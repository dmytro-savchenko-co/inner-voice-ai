"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../layout";

export default function ProfilePage() {
  const user = useUser();
  const router = useRouter();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  async function handleSaveName() {
    if (!name.trim() || name === user?.name) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch("/api/profile/delete", { method: "POST" });
      if (res.ok) {
        router.push("/");
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted">Manage your account settings</p>
      </div>

      {/* Photo + Name */}
      <div className="mb-6 rounded-xl border border-card-border/60 bg-card/40 p-6 backdrop-blur-sm">
        <div className="flex items-start gap-6">
          {/* Photo */}
          <div className="shrink-0">
            <div
              onClick={() => fileRef.current?.click()}
              className="group relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-primary/10 transition-all hover:bg-primary/20"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-primary">
                  {user.name?.charAt(0).toUpperCase() || "U"}
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="hidden"
            />
            <p className="mt-2 text-center text-[10px] text-muted/50">Click to change</p>
          </div>

          {/* Name + Email */}
          <div className="flex-1 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Display name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleSaveName}
                  disabled={saving || !name.trim() || name === user.name}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-30"
                >
                  {saving ? "..." : saved ? "Saved" : "Save"}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Email</label>
              <div className="rounded-lg border border-card-border/40 bg-card-border/10 px-3 py-2 text-sm text-muted">
                {user.email}
              </div>
              <p className="mt-1 text-[10px] text-muted/40">Email cannot be changed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="mb-6 rounded-xl border border-card-border/60 bg-card/40 p-6 backdrop-blur-sm">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Account</h3>
        <div className="space-y-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">User ID</span>
            <span className="font-mono text-muted/60">{user.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Betterness</span>
            <span className={user.betternessConnected ? "text-primary" : "text-muted/50"}>
              {user.betternessConnected ? "Connected" : "Not connected"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Telegram</span>
            <span className={user.telegramPaired ? "text-primary" : "text-muted/50"}>
              {user.telegramPaired ? "Paired" : "Not paired"}
            </span>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
        <h3 className="mb-2 text-sm font-semibold text-red-400">Danger Zone</h3>
        <p className="mb-4 text-xs text-muted">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-red-400">Are you sure?</span>
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Yes, delete my account"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg border border-red-500/30 px-4 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
          >
            Delete Account
          </button>
        )}
      </div>
    </div>
  );
}
