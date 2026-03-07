"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

export default function ConnectBetternessPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/betterness/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error || "Failed to connect. Please check your token.");
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-border bg-card/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-primary">
            Inner Voice AI
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          Connect Betterness
        </h1>
        <p className="mb-8 text-muted">
          Connect your Betterness account so Inner Voice can read real sleep, HRV, and activity data — making your habit protocols more precise and personalized.
        </p>

        {status === "success" ? (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-6">
            <h2 className="mb-2 text-lg font-semibold text-primary">
              Successfully Connected
            </h2>
            <p className="mb-4 text-sm text-muted">
              Your Betterness account is now linked. Inner Voice will use your sleep, HRV, and activity data to design better habit protocols.
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-light"
            >
              Return to Dashboard
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-card-border bg-card/80 p-6 backdrop-blur-sm">
            {/* Instructions */}
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                How to get your API key
              </h2>
              <ol className="space-y-2 text-sm text-muted">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    1
                  </span>
                  <span>
                    Go to{" "}
                    <a
                      href="https://betterness.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:text-primary-light"
                    >
                      betterness.ai
                    </a>{" "}
                    and sign in to your account.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    2
                  </span>
                  <span>Navigate to Settings &rarr; API Keys.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    3
                  </span>
                  <span>
                    Generate a new API key. It will start with{" "}
                    <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-accent">
                      bk_
                    </code>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    4
                  </span>
                  <span>Copy the key and paste it below.</span>
                </li>
              </ol>
            </div>

            <hr className="mb-6 border-card-border" />

            <form onSubmit={handleSubmit} className="space-y-4">
              {status === "error" && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {errorMessage}
                </div>
              )}

              <div>
                <label htmlFor="token" className="mb-1.5 block text-sm font-medium text-foreground">
                  Betterness API Key
                </label>
                <input
                  id="token"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="bk_..."
                  pattern="bk_.+"
                  title="Token must start with bk_"
                  className="w-full rounded-lg border border-card-border bg-background px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <button
                type="submit"
                disabled={status === "loading"}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-50"
              >
                {status === "loading" ? "Connecting..." : "Connect"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
