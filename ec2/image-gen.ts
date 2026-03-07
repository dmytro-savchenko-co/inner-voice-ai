import Replicate from "replicate";
import { createCanvas, loadImage } from "canvas";
import fs from "node:fs";
import path from "node:path";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

const COLORS = {
  bg: "#0F172A",
  bgGradientEnd: "#1E293B",
  teal: "#0D9488",
  tealLight: "#14B8A6",
  gold: "#F59E0B",
  white: "#F8FAFC",
  gray: "#94A3B8",
};

interface LifestyleData {
  sleepHours: number;
  sleepQuality: string;
  exerciseFrequency: string;
  exerciseType: string;
  stressLevel: string;
  sittingHours: number;
  dietQuality: string;
  waterGlasses: number;
  screenBeforeBed: string;
  drinksPerWeek: number;
}

function buildAgingPrompt(
  lifestyle: LifestyleData,
  mode: "bad_trajectory" | "good_trajectory",
  habitChosen?: string
): string {
  if (mode === "bad_trajectory") {
    const issues: string[] = [];
    if (lifestyle.sleepHours < 7) issues.push("chronic sleep deprivation");
    if (lifestyle.exerciseFrequency === "rarely" || lifestyle.exerciseFrequency === "never")
      issues.push("sedentary lifestyle");
    if (lifestyle.stressLevel === "high") issues.push("chronic stress");
    if (lifestyle.dietQuality === "mostly processed") issues.push("poor nutrition");
    if (lifestyle.drinksPerWeek > 7) issues.push("excessive alcohol consumption");
    if (lifestyle.sittingHours > 8) issues.push("prolonged sitting");

    const issueStr = issues.length > 0 ? issues.join(", ") : "suboptimal health habits";
    return `Photo of this person aged 20 years older, showing effects of ${issueStr}. Tired eyes, dull skin, visible aging, low energy appearance. Realistic photo.`;
  } else {
    return `Photo of this person aged 20 years older, but healthy and vibrant. Regular ${habitChosen || "exercise"}, good sleep, healthy diet. Glowing skin, bright eyes, fit, energetic appearance. Realistic photo, aging gracefully.`;
  }
}

export async function generateFutureSelf(
  photoPath: string,
  lifestyleData: LifestyleData,
  mode: "bad_trajectory" | "good_trajectory",
  habitChosen?: string
): Promise<string> {
  const photoBuffer = fs.readFileSync(photoPath);
  const base64Photo = `data:image/jpeg;base64,${photoBuffer.toString("base64")}`;

  const outputDir = "/tmp/inner-voice-photos";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const userId = path.basename(photoPath, path.extname(photoPath));
  const outputFilename = `${userId}_${mode}.jpg`;
  const outputPath = path.join(outputDir, outputFilename);

  const targetAge = mode === "good_trajectory" ? "70" : "80";

  try {
    // SAM model for face aging — needs version ID for older models
    const output = await replicate.run(
      "yuval-alaluf/sam:9222a21c181b707209ef12b5e0d7e94c994b58f01c7b2fec075d2e892362f13c",
      {
        input: {
          image: base64Photo,
          target_age: targetAge,
        },
      }
    );

    // SAM returns a single URL string or a FileOutput object
    let resultUrl: string;
    if (typeof output === "string") {
      resultUrl = output;
    } else if (output && typeof (output as any).url === "function") {
      resultUrl = (output as any).url();
    } else if (output && typeof (output as any).toString === "function") {
      resultUrl = (output as any).toString();
    } else {
      throw new Error(`Unexpected SAM output type: ${typeof output}`);
    }

    console.log(`SAM result URL: ${resultUrl}`);
    const response = await fetch(resultUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    console.log(`SAM aging result saved to ${outputPath}`);
  } catch (err) {
    console.error("SAM model failed, falling back to Flux:", err);

    // Fallback: use Flux text-to-image with aging prompt
    const prompt = buildAgingPrompt(lifestyleData, mode, habitChosen);
    const output = await replicate.run("black-forest-labs/flux-1.1-pro", {
      input: {
        prompt,
        prompt_upsampling: true,
      },
    });

    let resultUrl: string;
    if (typeof output === "string") {
      resultUrl = output;
    } else if (output && typeof (output as any).url === "function") {
      resultUrl = (output as any).url();
    } else if (output && typeof (output as any).toString === "function") {
      resultUrl = (output as any).toString();
    } else {
      throw new Error(`Unexpected Flux output type: ${typeof output}`);
    }

    console.log(`Flux result URL: ${resultUrl}`);
    const response = await fetch(resultUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    console.log(`Flux aging result saved to ${outputPath}`);
  }

  // Create comparison card
  const comparisonPath = path.join(outputDir, `${userId}_${mode}_comparison.jpg`);
  const label = mode === "bad_trajectory" ? "Current Trajectory" : `With: ${habitChosen || "Better Habits"}`;
  await createComparisonCard(photoPath, outputPath, label, mode, comparisonPath);

  return comparisonPath;
}

export async function createComparisonCard(
  currentPhotoPath: string,
  futurePhotoPath: string,
  label: string,
  mode: "bad_trajectory" | "good_trajectory",
  outputPath: string
): Promise<void> {
  const W = 1080;
  const H = 1080;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Dark gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, COLORS.bg);
  grad.addColorStop(0.5, "#0F1D32");
  grad.addColorStop(1, COLORS.bgGradientEnd);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = COLORS.white;
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Your Future Self", W / 2, 60);

  // Load images
  const currentImg = await loadImage(currentPhotoPath);
  const futureImg = await loadImage(futurePhotoPath);

  const imgSize = 420;
  const imgY = 110;
  const gap = 40;
  const leftX = W / 2 - imgSize - gap / 2;
  const rightX = W / 2 + gap / 2;

  // Draw rounded image frames
  for (const [x, img] of [[leftX, currentImg], [rightX, futureImg]] as const) {
    ctx.save();
    const r = 20;
    ctx.beginPath();
    ctx.moveTo(x + r, imgY);
    ctx.lineTo(x + imgSize - r, imgY);
    ctx.arcTo(x + imgSize, imgY, x + imgSize, imgY + r, r);
    ctx.lineTo(x + imgSize, imgY + imgSize - r);
    ctx.arcTo(x + imgSize, imgY + imgSize, x + imgSize - r, imgY + imgSize, r);
    ctx.lineTo(x + r, imgY + imgSize);
    ctx.arcTo(x, imgY + imgSize, x, imgY + imgSize - r, r);
    ctx.lineTo(x, imgY + r);
    ctx.arcTo(x, imgY, x + r, imgY, r);
    ctx.closePath();
    ctx.clip();
    // Cover-fit the image
    const scale = Math.max(imgSize / (img.width as number), imgSize / (img.height as number));
    const sw = imgSize / scale;
    const sh = imgSize / scale;
    const sx = ((img.width as number) - sw) / 2;
    const sy = ((img.height as number) - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, imgY, imgSize, imgSize);
    ctx.restore();
  }

  // Labels under images
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.white;
  ctx.fillText("You Now", leftX + imgSize / 2, imgY + imgSize + 45);
  ctx.fillText("You in 20 Years", rightX + imgSize / 2, imgY + imgSize + 45);

  // Bottom label bar
  const barY = imgY + imgSize + 80;
  const accentColor = mode === "bad_trajectory" ? "#EF4444" : COLORS.tealLight;
  ctx.fillStyle = accentColor;
  const barW = 600;
  const barH = 50;
  const barX = (W - barW) / 2;
  const br = 25;
  ctx.beginPath();
  ctx.moveTo(barX + br, barY);
  ctx.lineTo(barX + barW - br, barY);
  ctx.arcTo(barX + barW, barY, barX + barW, barY + br, br);
  ctx.lineTo(barX + barW, barY + barH - br);
  ctx.arcTo(barX + barW, barY + barH, barX + barW - br, barY + barH, br);
  ctx.lineTo(barX + br, barY + barH);
  ctx.arcTo(barX, barY + barH, barX, barY + barH - br, br);
  ctx.lineTo(barX, barY + br);
  ctx.arcTo(barX, barY, barX + br, barY, br);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COLORS.white;
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(label, W / 2, barY + 33);

  // Branding
  ctx.fillStyle = COLORS.gray;
  ctx.font = "18px sans-serif";
  ctx.fillText("Inner Voice AI", W / 2, H - 30);

  // Save
  const buf = canvas.toBuffer("image/jpeg", { quality: 0.9 });
  fs.writeFileSync(outputPath, buf);
}
