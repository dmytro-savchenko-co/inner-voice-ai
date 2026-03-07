"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

export default function TelegramPairingPage() {
  const [pairingCode, setPairingCode] = useState("");
  const [botUrl, setBotUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "paired" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleGenerateCode() {
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/telegram/pairing", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error || "Failed to generate pairing code.");
        return;
      }

      setPairingCode(data.pairingCode);
      setBotUrl(data.botUrl);
      setStatus("ready");

      // Start polling for pairing approval
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/telegram/pairing/status");
          const statusData = await statusRes.json();
          if (statusData.approved) {
            setStatus("paired");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // ignore polling errors
        }
      }, 5000);
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
          Set Up Telegram Bot
        </h1>
        <p className="mb-8 text-muted">
          Start your first experiment by messaging Inner Voice on Telegram. It will ask a few quick questions, then design a small habit protocol matched to your context.
        </p>

        <div className="rounded-xl border border-card-border bg-card/80 p-6 backdrop-blur-sm">
          {status === "idle" && (
            <div className="text-center">
              <p className="mb-5 text-sm text-muted">
                Generate a pairing code, then send it to the Telegram bot to begin.
              </p>
              <button
                onClick={handleGenerateCode}
                className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-light"
              >
                Generate Pairing Code
              </button>
            </div>
          )}

          {status === "loading" && (
            <div className="py-4 text-center text-muted">
              Generating pairing code...
            </div>
          )}

          {status === "error" && (
            <div>
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {errorMessage}
              </div>
              <button
                onClick={handleGenerateCode}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-light"
              >
                Try Again
              </button>
            </div>
          )}

          {status === "paired" && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-5 text-center">
              <p className="text-lg font-semibold text-green-400">
                Paired successfully
              </p>
              <p className="mt-2 text-sm text-muted">
                Your Telegram account is now connected. Open Telegram to start chatting with Inner Voice.
              </p>
              <a
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-light"
              >
                Open Telegram Bot
              </a>
            </div>
          )}

          {status === "ready" && (
            <div className="space-y-6">
              {/* Pairing Code Display */}
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-5 text-center">
                <p className="mb-2 text-sm text-muted">Your pairing code</p>
                <p className="font-mono text-3xl font-bold tracking-widest text-primary">
                  {pairingCode}
                </p>
              </div>

              {/* Steps */}
              <div>
                <h2 className="mb-4 text-lg font-semibold text-foreground">
                  How to pair
                </h2>
                <ol className="space-y-3 text-sm text-muted">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                      1
                    </span>
                    <span>
                      Open the Telegram bot by clicking the link below.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                      2
                    </span>
                    <span>
                      Send <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-accent">/start</code> to the bot.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                      3
                    </span>
                    <span>
                      Send your pairing code:{" "}
                      <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-accent">
                        {pairingCode}
                      </code>
                    </span>
                  </li>
                </ol>
              </div>

              {/* Open Telegram Button */}
              <a
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-light"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
                Open Telegram Bot
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
