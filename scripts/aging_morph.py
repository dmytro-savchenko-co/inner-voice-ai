#!/usr/bin/env python3
"""
Create smooth face-aging morph videos from a single portrait.

Backends:
- sam: Replicate SAM aging endpoint
- face_reaging: local face_reaging checkpoint
- flux_kontext: Replicate FLUX Kontext image editing
- hidream_e1: Replicate HiDream E1.1 image editing

Examples:
  python scripts/aging_morph.py \
    --input /path/to/face.jpg \
    --output output/aging_morph.mp4 \
    --backend face_reaging

  python scripts/aging_morph.py \
    --input /path/to/face.jpg \
    --output output/aging_compare.mp4 \
    --compare-backends face_reaging,flux_kontext,hidream_e1
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Sequence, Tuple

import cv2
import mediapipe as mp
import numpy as np
import requests
from PIL import Image
from scipy.spatial import Delaunay


REPLICATE_BASE_URL = "https://api.replicate.com/v1"
MEDIAPIPE_FACE_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)
SAM_VERSION = "9222a21c181b707209ef12b5e0d7e94c994b58f01c7b2fec075d2e892362f13c"
FLUX_KONTEXT_VERSION = "85723d503c17da3f9fd9cecfb9987a8bf60ef747fd8f68a25d7636f88260eb59"
HIDREAM_E1_VERSION = "433436facdc1172b6efcb801eb6f345d7858a32200d24e5febaccfb4b44ad66f"
AGE_STEPS = [0, 20]
FRAME_RATE = 24
DEFAULT_DURATION_SECONDS = 8.0
ALIGNED_OUTPUT_SIZE = (960, 720)
REFERENCE_OUTPUT_SIZE = (1024, 768)
SUPPORTED_BACKENDS = ("sam", "face_reaging", "flux_kontext", "hidream_e1")
SCENARIOS = ("healthy", "neutral", "unhealthy")
LEVELS = ("low", "medium", "high")

# Stable landmark subsets for pose normalization.
LEFT_EYE_IDXS = [33, 133, 159, 145]
RIGHT_EYE_IDXS = [362, 263, 386, 374]


@dataclass
class ReplicateConfig:
    api_token: str
    version: str
    poll_interval_seconds: float = 3.0
    timeout_seconds: float = 300.0


@dataclass
class FaceReagingConfig:
    repo_path: Path
    checkpoint_path: Path


@dataclass
class AlignedFace:
    age: int
    image: np.ndarray
    landmarks: np.ndarray
    path: Path


@dataclass
class HiDreamSettings:
    scenario: str = "neutral"
    skin_aging: str = "medium"
    hair_gray: str = "medium"
    hair_loss: str = "medium"
    guidance_scale: float = 3.5
    image_guidance_scale: float = 2.0
    refine_strength: float = 0.3
    num_inference_steps: int = 28
    seed: int = -1
    speed_mode: str = "Extra Juiced 🚀 (even more speed)"


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_local_env(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def read_image_rgb(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {path}")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def write_image_rgb(path: Path, image_rgb: np.ndarray) -> None:
    image_bgr = cv2.cvtColor(np.clip(image_rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    cv2.imwrite(str(path), image_bgr)


def ensure_face_landmarker_model(work_dir: Path) -> Path:
    model_path = work_dir / "face_landmarker.task"
    if model_path.exists():
        return model_path

    response = requests.get(MEDIAPIPE_FACE_LANDMARKER_URL, timeout=120)
    response.raise_for_status()
    model_path.write_bytes(response.content)
    return model_path


def create_face_landmarker(model_dir: Path):
    model_path = ensure_face_landmarker_model(model_dir)
    base_options = mp.tasks.BaseOptions(model_asset_path=str(model_path))
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=base_options,
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


def normalize_generation_input(image_path: Path, work_dir: Path, max_side: int = 1024) -> Path:
    image = Image.open(image_path).convert("RGB")
    width, height = image.size
    scale = min(1.0, max_side / max(width, height))
    new_width = max(8, int(width * scale) // 8 * 8)
    new_height = max(8, int(height * scale) // 8 * 8)
    resized = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    output_path = work_dir / f"{image_path.stem}_upload.jpg"
    resized.save(output_path, quality=95)
    return output_path


def path_to_data_url(image_path: Path) -> str:
    mime_type = mimetypes.guess_type(image_path.name)[0] or "image/jpeg"
    payload = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{payload}"


class ReplicateClient:
    def __init__(self, config: ReplicateConfig) -> None:
        self.config = config
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Token {config.api_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    def create_prediction(self, input_payload: dict) -> str:
        payload = {"version": self.config.version, "input": input_payload}
        response = self.session.post(f"{REPLICATE_BASE_URL}/predictions", json=payload, timeout=60)
        response.raise_for_status()
        prediction = response.json()
        prediction_id = prediction.get("id")
        if not prediction_id:
            raise RuntimeError(f"Unexpected Replicate response: {json.dumps(prediction)[:800]}")
        return prediction_id

    def wait_for_prediction(self, prediction_id: str) -> str:
        deadline = time.time() + self.config.timeout_seconds
        last_payload: dict | None = None

        while time.time() < deadline:
            response = self.session.get(f"{REPLICATE_BASE_URL}/predictions/{prediction_id}", timeout=60)
            response.raise_for_status()
            payload = response.json()
            last_payload = payload
            status = payload.get("status")

            if status == "succeeded":
                output = payload.get("output")
                if isinstance(output, str):
                    return output
                if isinstance(output, list) and output:
                    if isinstance(output[0], str):
                        return output[0]
                    if isinstance(output[0], dict) and output[0].get("url"):
                        return output[0]["url"]
                raise RuntimeError(f"Unexpected Replicate output: {json.dumps(output)[:800]}")
            if status in {"failed", "canceled"}:
                raise RuntimeError(f"Replicate prediction failed: {json.dumps(payload)[:1200]}")

            time.sleep(self.config.poll_interval_seconds)

        raise TimeoutError(f"Timed out waiting for Replicate prediction: {json.dumps(last_payload)[:1200]}")

    def download_image(self, url: str, output_path: Path) -> Path:
        response = requests.get(url, timeout=120)
        response.raise_for_status()
        output_path.write_bytes(response.content)
        return output_path


def sam_prompt_note() -> str:
    return "same identity, same hairstyle, realistic older age progression"


def build_flux_prompt() -> str:
    return (
        "Age this exact same man by 20 years. Preserve the same identity, facial structure, expression, "
        "pose, camera angle, crop, shirt, room, wall art, lighting, hairstyle, beard style, and overall "
        "composition. Only apply realistic aging: visibly grayer scalp hair and beard, mild temple recession, "
        "slightly thinner hair density, more mature skin texture, subtle forehead lines, nasolabial folds, "
        "and under-eye aging. Photorealistic. No restyling. No background changes."
    )


def build_hidream_prompt(settings: HiDreamSettings) -> str:
    scenario_map = {
        "healthy": (
            "healthy aging, fit appearance, clear skin tone, restrained puffiness, good vitality, "
            "well-rested look"
        ),
        "neutral": (
            "natural aging, balanced realism, ordinary healthy decline without exaggeration"
        ),
        "unhealthy": (
            "harsher aging from an unhealthy lifestyle, duller complexion, more stress aging, more puffiness, "
            "more fatigue"
        ),
    }
    skin_map = {
        "low": "subtle wrinkles, light forehead lines, light crow's feet, mild skin texture change",
        "medium": "noticeable forehead lines, crow's feet, under-eye aging, nasolabial folds, moderate skin texture change",
        "high": "deeper forehead lines, stronger crow's feet, heavier under-eye aging, deeper folds, rougher skin texture",
    }
    hair_gray_map = {
        "low": "slightly grayer scalp hair and beard",
        "medium": "clearly grayer scalp hair at the temples and top, clearly grayer beard",
        "high": "substantially grayer scalp hair across the temples and top, substantially grayer beard",
    }
    hair_loss_map = {
        "low": "minimal temple recession, almost no density loss",
        "medium": "mild temple recession and slightly thinner frontal hair density",
        "high": "clear temple recession and noticeably thinner frontal hair density",
    }

    return (
        "Edit the photo so the same man looks about 20 years older. "
        "Preserve identity, facial structure, expression, hairstyle, beard style, shirt, framing, pose, room, "
        "and lighting. Apply realistic age progression only. "
        f"Scenario: {scenario_map[settings.scenario]}. "
        f"Skin aging: {skin_map[settings.skin_aging]}. "
        f"Hair graying: {hair_gray_map[settings.hair_gray]}. "
        f"Hair loss: {hair_loss_map[settings.hair_loss]}. "
        "Keep the result photorealistic and keep the background unchanged."
    )


def generate_with_sam(
    input_path: Path,
    output_path: Path,
    config: ReplicateConfig,
    base_age: int,
) -> Path:
    client = ReplicateClient(config)
    prediction_id = client.create_prediction(
        {
            "image": path_to_data_url(input_path),
            "target_age": str(base_age + 20),
        }
    )
    image_url = client.wait_for_prediction(prediction_id)
    return client.download_image(image_url, output_path)


def generate_with_flux_kontext(
    input_path: Path,
    output_path: Path,
    config: ReplicateConfig,
) -> Path:
    client = ReplicateClient(config)
    prediction_id = client.create_prediction(
        {
            "prompt": build_flux_prompt(),
            "input_image": path_to_data_url(input_path),
            "go_fast": True,
            "guidance": 2.5,
            "aspect_ratio": "match_input_image",
            "output_format": "jpg",
            "output_quality": 90,
            "num_inference_steps": 30,
        }
    )
    image_url = client.wait_for_prediction(prediction_id)
    return client.download_image(image_url, output_path)


def generate_with_hidream_e1(
    input_path: Path,
    output_path: Path,
    config: ReplicateConfig,
    settings: HiDreamSettings,
) -> Path:
    client = ReplicateClient(config)
    prediction_id = client.create_prediction(
        {
            "image": path_to_data_url(input_path),
            "prompt": build_hidream_prompt(settings),
            "seed": settings.seed,
            "speed_mode": settings.speed_mode,
            "clip_cfg_norm": True,
            "output_format": "jpg",
            "output_quality": 90,
            "guidance_scale": settings.guidance_scale,
            "refine_strength": settings.refine_strength,
            "num_inference_steps": settings.num_inference_steps,
            "image_guidance_scale": settings.image_guidance_scale,
        }
    )
    image_url = client.wait_for_prediction(prediction_id)
    return client.download_image(image_url, output_path)


@contextlib.contextmanager
def pushd(path: Path):
    cwd = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(cwd)


def generate_with_face_reaging(
    input_path: Path,
    output_path: Path,
    config: FaceReagingConfig,
    base_age: int,
) -> Path:
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("face_reaging backend requires torch to be installed.") from exc

    repo_path = config.repo_path
    checkpoint_path = config.checkpoint_path
    if not repo_path.exists():
        raise FileNotFoundError(f"face_reaging repo not found: {repo_path}")
    if not checkpoint_path.exists():
        raise FileNotFoundError(f"face_reaging checkpoint not found: {checkpoint_path}")

    if str(repo_path) not in sys.path:
        sys.path.insert(0, str(repo_path))

    with pushd(repo_path):
        from model.models import UNet  # type: ignore
        from scripts.test_functions import process_image  # type: ignore

        torch.set_num_threads(max(1, (os.cpu_count() or 4) // 2))
        model = UNet().cpu().eval()
        state_dict = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        model.load_state_dict(state_dict)

        source_image = Image.open(input_path).convert("RGB")
        aged_image = process_image(
            model,
            source_image,
            False,
            source_age=base_age,
            target_age=base_age + 20,
        )
        aged_image.save(output_path, quality=95)

    return output_path


def generate_images(
    input_path: Path,
    output_dir: Path,
    backend: str,
    base_age: int,
    replicate_token: str | None,
    hidream_settings: HiDreamSettings,
    reuse_generated: bool = False,
) -> List[Tuple[int, Path]]:
    ensure_dir(output_dir)
    normalized_input = normalize_generation_input(input_path, output_dir, max_side=max(REFERENCE_OUTPUT_SIZE))
    generated: List[Tuple[int, Path]] = [(0, input_path)]
    target_path = output_dir / "age_20.jpg"

    if reuse_generated and target_path.exists():
        return generated + [(20, target_path)]

    if backend == "sam":
        if not replicate_token:
            raise EnvironmentError("REPLICATE_API_TOKEN is required for backend=sam.")
        config = ReplicateConfig(
            api_token=replicate_token,
            version=os.environ.get("REPLICATE_SAM_VERSION", SAM_VERSION),
        )
        generate_with_sam(normalized_input, target_path, config, base_age=base_age)
    elif backend == "flux_kontext":
        if not replicate_token:
            raise EnvironmentError("REPLICATE_API_TOKEN is required for backend=flux_kontext.")
        config = ReplicateConfig(
            api_token=replicate_token,
            version=os.environ.get("REPLICATE_FLUX_KONTEXT_VERSION", FLUX_KONTEXT_VERSION),
        )
        generate_with_flux_kontext(normalized_input, target_path, config)
    elif backend == "hidream_e1":
        if not replicate_token:
            raise EnvironmentError("REPLICATE_API_TOKEN is required for backend=hidream_e1.")
        config = ReplicateConfig(
            api_token=replicate_token,
            version=os.environ.get("REPLICATE_HIDREAM_E1_VERSION", HIDREAM_E1_VERSION),
        )
        generate_with_hidream_e1(normalized_input, target_path, config, hidream_settings)
    elif backend == "face_reaging":
        config = FaceReagingConfig(
            repo_path=Path(os.environ.get("FACE_REAGING_REPO", "/tmp/face_reaging")),
            checkpoint_path=Path(
                os.environ.get("FACE_REAGING_CHECKPOINT", "/tmp/face_reaging_real/best_unet_model.pth")
            ),
        )
        generate_with_face_reaging(normalized_input, target_path, config, base_age=base_age)
    else:
        raise ValueError(f"Unsupported backend: {backend}")

    generated.append((20, target_path))
    return generated


def detect_landmarks(image_rgb: np.ndarray, landmarker) -> np.ndarray:
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb.astype(np.uint8))
    result = landmarker.detect(mp_image)
    if not result.face_landmarks:
        raise RuntimeError("No face detected. Use a centered, front-facing portrait with one visible face.")

    face_landmarks = result.face_landmarks[0]
    height, width = image_rgb.shape[:2]
    return np.array([(lm.x * width, lm.y * height) for lm in face_landmarks], dtype=np.float32)


def mean_point(landmarks: np.ndarray, indices: Sequence[int]) -> np.ndarray:
    return np.mean(landmarks[list(indices)], axis=0)


def compute_similarity_transform(
    src_landmarks: np.ndarray,
    output_size: Tuple[int, int],
    zoom_out: float = 1.0,
) -> Tuple[np.ndarray, np.ndarray]:
    width, height = output_size
    left_eye = mean_point(src_landmarks, LEFT_EYE_IDXS)
    right_eye = mean_point(src_landmarks, RIGHT_EYE_IDXS)
    eye_center = ((left_eye + right_eye) / 2.0).astype(np.float32)

    dy = float(right_eye[1] - left_eye[1])
    dx = float(right_eye[0] - left_eye[0])
    angle = np.degrees(np.arctan2(dy, dx))

    desired_left_eye = (0.40, 0.38)
    desired_right_eye_x = 1.0 - desired_left_eye[0]
    current_eye_distance = max(np.hypot(dx, dy), 1e-6)
    desired_eye_distance = (desired_right_eye_x - desired_left_eye[0]) * width
    scale = (desired_eye_distance / current_eye_distance) * zoom_out

    transform = cv2.getRotationMatrix2D(tuple(eye_center), angle, scale).astype(np.float32)
    transform[0, 2] += (width * 0.5) - eye_center[0]
    transform[1, 2] += (height * desired_left_eye[1]) - eye_center[1]
    transformed = cv2.transform(src_landmarks[None, :, :], transform)[0]
    return transform, transformed


def add_boundary_points(landmarks: np.ndarray, output_size: Tuple[int, int]) -> np.ndarray:
    width, height = output_size
    boundary = np.array(
        [
            (0, 0),
            (width // 2, 0),
            (width - 1, 0),
            (width - 1, height // 2),
            (width - 1, height - 1),
            (width // 2, height - 1),
            (0, height - 1),
            (0, height // 2),
        ],
        dtype=np.float32,
    )
    return np.vstack([landmarks, boundary])


def align_faces(
    images: Sequence[Tuple[int, Path]],
    output_dir: Path,
    output_size: Tuple[int, int] = ALIGNED_OUTPUT_SIZE,
) -> List[AlignedFace]:
    aligned_faces: List[AlignedFace] = []

    with create_face_landmarker(output_dir) as landmarker:
        for age, image_path in images:
            image_rgb = read_image_rgb(image_path)
            landmarks = detect_landmarks(image_rgb, landmarker)
            transform, transformed_landmarks = compute_similarity_transform(landmarks, output_size, zoom_out=0.82)
            aligned_image = cv2.warpAffine(
                image_rgb,
                transform,
                output_size,
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REFLECT_101,
            )

            transformed_landmarks = add_boundary_points(transformed_landmarks, output_size)
            aligned_path = output_dir / f"aligned_{age:02d}.png"
            write_image_rgb(aligned_path, aligned_image)
            aligned_faces.append(
                AlignedFace(
                    age=age,
                    image=aligned_image.astype(np.float32),
                    landmarks=transformed_landmarks.astype(np.float32),
                    path=aligned_path,
                )
            )

    return aligned_faces


def get_triangle_indices(points: np.ndarray) -> np.ndarray:
    delaunay = Delaunay(points)
    return delaunay.simplices


def warp_triangle(
    img1: np.ndarray,
    img2: np.ndarray,
    output: np.ndarray,
    t1: np.ndarray,
    t2: np.ndarray,
    t: np.ndarray,
) -> None:
    r = cv2.boundingRect(np.float32([t]))
    r1 = cv2.boundingRect(np.float32([t1]))
    r2 = cv2.boundingRect(np.float32([t2]))
    h1, w1 = img1.shape[:2]
    h2, w2 = img2.shape[:2]
    ho, wo = output.shape[:2]

    if (
        r[2] <= 0
        or r[3] <= 0
        or r1[2] <= 0
        or r1[3] <= 0
        or r2[2] <= 0
        or r2[3] <= 0
        or r[0] < 0
        or r[1] < 0
        or r1[0] < 0
        or r1[1] < 0
        or r2[0] < 0
        or r2[1] < 0
        or r[0] + r[2] > wo
        or r[1] + r[3] > ho
        or r1[0] + r1[2] > w1
        or r1[1] + r1[3] > h1
        or r2[0] + r2[2] > w2
        or r2[1] + r2[3] > h2
    ):
        return

    t_rect = []
    t1_rect = []
    t2_rect = []
    for i in range(3):
        t_rect.append(((t[i][0] - r[0]), (t[i][1] - r[1])))
        t1_rect.append(((t1[i][0] - r1[0]), (t1[i][1] - r1[1])))
        t2_rect.append(((t2[i][0] - r2[0]), (t2[i][1] - r2[1])))

    mask = np.zeros((r[3], r[2], 3), dtype=np.float32)
    cv2.fillConvexPoly(mask, np.int32(t_rect), (1.0, 1.0, 1.0), 16, 0)

    img1_rect = img1[r1[1] : r1[1] + r1[3], r1[0] : r1[0] + r1[2]]
    img2_rect = img2[r2[1] : r2[1] + r2[3], r2[0] : r2[0] + r2[2]]
    size = (r[2], r[3])

    warp_mat1 = cv2.getAffineTransform(np.float32(t1_rect), np.float32(t_rect))
    warp_mat2 = cv2.getAffineTransform(np.float32(t2_rect), np.float32(t_rect))
    warped1 = cv2.warpAffine(img1_rect, warp_mat1, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    warped2 = cv2.warpAffine(img2_rect, warp_mat2, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)

    alpha = getattr(warp_triangle, "_alpha", 0.5)
    patch = (1.0 - alpha) * warped1 + alpha * warped2
    output_slice = output[r[1] : r[1] + r[3], r[0] : r[0] + r[2]]
    output_slice *= 1.0 - mask
    output_slice += patch * mask


def morph_pair(
    img1: np.ndarray,
    img2: np.ndarray,
    points1: np.ndarray,
    points2: np.ndarray,
    triangle_indices: np.ndarray,
    alpha: float,
) -> np.ndarray:
    points = (1.0 - alpha) * points1 + alpha * points2
    morphed = np.zeros_like(img1, dtype=np.float32)
    setattr(warp_triangle, "_alpha", alpha)

    for triangle in triangle_indices:
        x, y, z = triangle
        t1 = np.array([points1[x], points1[y], points1[z]], dtype=np.float32)
        t2 = np.array([points2[x], points2[y], points2[z]], dtype=np.float32)
        t = np.array([points[x], points[y], points[z]], dtype=np.float32)
        warp_triangle(img1, img2, morphed, t1, t2, t)

    return np.clip(morphed, 0, 255)


def smooth_frame_sequence(
    frames: Sequence[np.ndarray],
    temporal_blend: float = 0.18,
    optical_flow_refine: bool = False,
) -> List[np.ndarray]:
    if not frames:
        return []

    smoothed: List[np.ndarray] = [frames[0].copy()]
    prev_gray = cv2.cvtColor(frames[0].astype(np.uint8), cv2.COLOR_RGB2GRAY)

    for current in frames[1:]:
        blended = cv2.addWeighted(current, 1.0 - temporal_blend, smoothed[-1], temporal_blend, 0)

        if optical_flow_refine:
            current_gray = cv2.cvtColor(current.astype(np.uint8), cv2.COLOR_RGB2GRAY)
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray,
                current_gray,
                None,
                pyr_scale=0.5,
                levels=3,
                winsize=21,
                iterations=3,
                poly_n=5,
                poly_sigma=1.2,
                flags=0,
            )
            h, w = current_gray.shape
            grid_x, grid_y = np.meshgrid(np.arange(w), np.arange(h))
            map_x = (grid_x - flow[..., 0]).astype(np.float32)
            map_y = (grid_y - flow[..., 1]).astype(np.float32)
            warped_prev = cv2.remap(
                smoothed[-1],
                map_x,
                map_y,
                interpolation=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REFLECT_101,
            )
            blended = cv2.addWeighted(blended, 0.75, warped_prev, 0.25, 0)
            prev_gray = current_gray
        else:
            prev_gray = cv2.cvtColor(current.astype(np.uint8), cv2.COLOR_RGB2GRAY)

        smoothed.append(np.clip(blended, 0, 255))

    return smoothed


def morph_faces(
    aligned_faces: Sequence[AlignedFace],
    output_dir: Path,
    fps: int = FRAME_RATE,
    duration_seconds: float = DEFAULT_DURATION_SECONDS,
    optical_flow_refine: bool = False,
) -> List[Path]:
    if len(aligned_faces) < 2:
        raise ValueError("At least two aligned faces are required to morph.")

    total_frames = max(int(duration_seconds * fps), len(aligned_faces))
    segment_count = len(aligned_faces) - 1
    frames_per_segment = max(2, total_frames // segment_count)
    reference_shape = np.mean(np.stack([face.landmarks for face in aligned_faces], axis=0), axis=0)
    triangle_indices = get_triangle_indices(reference_shape)

    raw_frames: List[np.ndarray] = []
    for index in range(segment_count):
        start_face = aligned_faces[index]
        end_face = aligned_faces[index + 1]
        alphas = np.linspace(0.0, 1.0, frames_per_segment, endpoint=(index == segment_count - 1))
        eased_alphas = 3.0 * (alphas**2) - 2.0 * (alphas**3)
        for alpha in eased_alphas:
            raw_frames.append(
                morph_pair(
                    start_face.image,
                    end_face.image,
                    start_face.landmarks,
                    end_face.landmarks,
                    triangle_indices,
                    float(alpha),
                )
            )

    smoothed_frames = smooth_frame_sequence(raw_frames, temporal_blend=0.18, optical_flow_refine=optical_flow_refine)
    ensure_dir(output_dir)
    frame_paths: List[Path] = []
    for i, frame in enumerate(smoothed_frames):
        frame_path = output_dir / f"frame_{i:04d}.png"
        write_image_rgb(frame_path, frame)
        frame_paths.append(frame_path)
    return frame_paths


def render_video(frame_dir: Path, output_path: Path, fps: int = FRAME_RATE) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required but was not found in PATH.")

    command = [
        ffmpeg,
        "-y",
        "-framerate",
        str(fps),
        "-i",
        str(frame_dir / "frame_%04d.png"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-crf",
        "18",
        str(output_path),
    ]
    subprocess.run(command, check=True)
    return output_path


def build_backend_output_path(base_output: Path, backend: str) -> Path:
    return base_output.with_name(f"{base_output.stem}_{backend}{base_output.suffix}")


def run_backend(
    backend: str,
    args: argparse.Namespace,
    replicate_token: str | None,
) -> Path:
    backend_work_dir = ensure_dir(args.work_dir / backend)
    generated_dir = ensure_dir(backend_work_dir / "generated")
    aligned_dir = ensure_dir(backend_work_dir / "aligned")
    frame_dir = ensure_dir((args.debug_dir / backend) if args.debug_dir else backend_work_dir / "frames")
    output_path = build_backend_output_path(args.output, backend) if args.compare_backends else args.output

    generated_images = generate_images(
        args.input,
        generated_dir,
        backend=backend,
        base_age=args.base_age,
        replicate_token=replicate_token,
        hidream_settings=HiDreamSettings(
            scenario=args.scenario,
            skin_aging=args.skin_aging,
            hair_gray=args.hair_gray,
            hair_loss=args.hair_loss,
            guidance_scale=args.hidream_guidance_scale,
            image_guidance_scale=args.hidream_image_guidance_scale,
            refine_strength=args.hidream_refine_strength,
            num_inference_steps=args.hidream_steps,
            seed=args.seed,
            speed_mode=args.hidream_speed_mode,
        ),
        reuse_generated=args.reuse_generated,
    )
    aligned_faces = align_faces(generated_images, aligned_dir, output_size=ALIGNED_OUTPUT_SIZE)
    morph_faces(
        aligned_faces=aligned_faces,
        output_dir=frame_dir,
        fps=args.fps,
        duration_seconds=args.duration,
        optical_flow_refine=args.optical_flow_refine,
    )
    render_video(frame_dir=frame_dir, output_path=output_path, fps=args.fps)

    if not args.debug_dir and not args.keep_temp:
        shutil.rmtree(frame_dir, ignore_errors=True)

    return output_path


def parse_backend_list(value: str) -> List[str]:
    backends = [item.strip() for item in value.split(",") if item.strip()]
    invalid = [item for item in backends if item not in SUPPORTED_BACKENDS]
    if invalid:
        raise argparse.ArgumentTypeError(f"Unsupported backends: {', '.join(invalid)}")
    if not backends:
        raise argparse.ArgumentTypeError("At least one backend must be provided.")
    return backends


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a smooth face aging morph video.")
    parser.add_argument("--input", type=Path, required=True, help="Path to the source face image.")
    parser.add_argument("--output", type=Path, required=True, help="Output MP4 path.")
    parser.add_argument("--work-dir", type=Path, default=Path("output/aging_morph"), help="Working directory.")
    parser.add_argument("--debug-dir", type=Path, default=None, help="Optional directory to keep intermediate files.")
    parser.add_argument("--fps", type=int, default=FRAME_RATE, help="Video frame rate.")
    parser.add_argument(
        "--duration",
        type=float,
        default=DEFAULT_DURATION_SECONDS,
        help="Target video duration in seconds (6-10 recommended).",
    )
    parser.add_argument(
        "--optical-flow-refine",
        action="store_true",
        help="Apply optical-flow refinement during temporal smoothing.",
    )
    parser.add_argument("--keep-temp", action="store_true", help="Keep temporary frame directories.")
    parser.add_argument("--reuse-generated", action="store_true", help="Reuse existing backend outputs if present.")
    parser.add_argument("--base-age", type=int, default=45, help="Approximate current age in the source photo.")
    parser.add_argument("--scenario", choices=SCENARIOS, default="neutral", help="HiDream aging scenario preset.")
    parser.add_argument("--skin-aging", choices=LEVELS, default="medium", help="HiDream skin aging emphasis.")
    parser.add_argument("--hair-gray", choices=LEVELS, default="medium", help="HiDream hair graying emphasis.")
    parser.add_argument("--hair-loss", choices=LEVELS, default="medium", help="HiDream hair loss emphasis.")
    parser.add_argument(
        "--hidream-guidance-scale",
        type=float,
        default=3.5,
        help="HiDream prompt guidance strength.",
    )
    parser.add_argument(
        "--hidream-image-guidance-scale",
        type=float,
        default=2.0,
        help="HiDream source-image adherence strength.",
    )
    parser.add_argument(
        "--hidream-refine-strength",
        type=float,
        default=0.3,
        help="HiDream refinement pass strength.",
    )
    parser.add_argument(
        "--hidream-steps",
        type=int,
        default=28,
        help="HiDream inference steps.",
    )
    parser.add_argument("--seed", type=int, default=-1, help="Seed for reproducible generation where supported.")
    parser.add_argument(
        "--hidream-speed-mode",
        type=str,
        default="Extra Juiced 🚀 (even more speed)",
        help="HiDream speed mode string passed through to Replicate.",
    )
    parser.add_argument(
        "--backend",
        choices=SUPPORTED_BACKENDS,
        default="face_reaging",
        help="Single backend to use for endpoint generation.",
    )
    parser.add_argument(
        "--compare-backends",
        type=parse_backend_list,
        default=None,
        help="Comma-separated backends to run, e.g. face_reaging,flux_kontext,hidream_e1.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    load_local_env(Path(".env"))

    if not args.input.exists():
        raise FileNotFoundError(f"Input image not found: {args.input}")
    if args.duration < 6 or args.duration > 10:
        raise ValueError("Duration must be between 6 and 10 seconds to match the output requirement.")

    args.work_dir = ensure_dir(args.work_dir)
    if args.debug_dir is not None:
        args.debug_dir = ensure_dir(args.debug_dir)

    replicate_token = os.environ.get("REPLICATE_API_TOKEN")
    backends = args.compare_backends or [args.backend]

    failures: Dict[str, str] = {}
    outputs: Dict[str, str] = {}

    for backend in backends:
        try:
            outputs[backend] = str(run_backend(backend, args, replicate_token))
        except Exception as exc:  # noqa: BLE001
            failures[backend] = str(exc)

    print(json.dumps({"outputs": outputs, "failures": failures}, indent=2))
    return 1 if failures and not outputs else 0


if __name__ == "__main__":
    raise SystemExit(main())
