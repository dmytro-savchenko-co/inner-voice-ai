"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useUser } from "../layout";

export default function ConnectionsPage() {
  const user = useUser();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Connections</h1>
        <p className="mt-1 text-sm text-muted">Manage your integrations and data sources</p>
      </div>

      <div className="space-y-4">
        <BetternessCard connected={user.betternessConnected} />
        <TelegramCard paired={user.telegramPaired} />
      </div>
    </div>
  );
}

/* ── Betterness ─────────────────────────────────────────────────────────── */

function BetternessCard({ connected }: { connected: boolean }) {
  const [expanded, setExpanded] = useState(!connected);
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
        setErrorMessage(data.error || "Failed to connect.");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-card-border/60 bg-card/40 backdrop-blur-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-card-border/10"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          connected || status === "success" ? "bg-primary/15 text-primary" : "bg-card-border/40 text-muted"
        }`}>
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Betterness</h3>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              connected || status === "success" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-400"
            }`}>
              <span className={`h-1 w-1 rounded-full ${connected || status === "success" ? "bg-primary" : "bg-amber-500"}`} />
              {connected || status === "success" ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">Sleep, HRV, and activity data from wearables</p>
        </div>
        <svg className={`h-4 w-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-card-border/40 px-5 pb-5 pt-4">
          {status === "success" ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium text-primary">Connected successfully</p>
              <p className="mt-0.5 text-xs text-muted">Your wearable data is now available to Inner Voice.</p>
            </div>
          ) : connected ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium text-primary">Betterness is connected</p>
              <p className="mt-0.5 text-xs text-muted">Your sleep, HRV, and activity data flows into your coaching.</p>
            </div>
          ) : (
            <>
              <ol className="mb-4 space-y-2 text-xs text-muted">
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">1</span>
                  Go to <a href="https://betterness.ai" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:text-primary-light">betterness.ai</a> and sign in
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">2</span>
                  Navigate to Settings &rarr; API Keys
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">3</span>
                  Generate a key (starts with <code className="rounded bg-background px-1 py-0.5 font-mono text-[10px] text-accent">bk_</code>) and paste below
                </li>
              </ol>

              <form onSubmit={handleSubmit} className="space-y-3">
                {status === "error" && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    {errorMessage}
                  </div>
                )}
                <input
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="bk_..."
                  pattern="bk_.+"
                  title="Token must start with bk_"
                  className="w-full rounded-lg border border-card-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-50"
                >
                  {status === "loading" ? "Connecting..." : "Connect"}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Telegram ───────────────────────────────────────────────────────────── */

function TelegramCard({ paired }: { paired: boolean }) {
  const [expanded, setExpanded] = useState(!paired);
  const [pairingCode, setPairingCode] = useState("");
  const [botUrl, setBotUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "paired" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleGenerate() {
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/telegram/pairing", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error || "Failed to generate pairing code.");
        return;
      }
      setPairingCode(data.pairingCode);
      setBotUrl(data.botUrl);
      setStatus("ready");
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/telegram/pairing/status");
          const statusData = await statusRes.json();
          if (statusData.approved) {
            setStatus("paired");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {}
      }, 5000);
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong.");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-card-border/60 bg-card/40 backdrop-blur-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-card-border/10"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          paired || status === "paired" ? "bg-primary/15 text-primary" : "bg-card-border/40 text-muted"
        }`}>
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Telegram Bot</h3>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              paired || status === "paired" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-400"
            }`}>
              <span className={`h-1 w-1 rounded-full ${paired || status === "paired" ? "bg-primary" : "bg-amber-500"}`} />
              {paired || status === "paired" ? "Paired" : "Not paired"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">Your AI habit coaching agent on Telegram</p>
        </div>
        <svg className={`h-4 w-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-card-border/40 px-5 pb-5 pt-4">
          {(paired || status === "paired") ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium text-primary">Telegram is paired</p>
              <p className="mt-0.5 text-xs text-muted">Your coaching agent is active and ready to chat.</p>
              {botUrl && (
                <a href={botUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-light">
                  Open Telegram Bot
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  </svg>
                </a>
              )}
            </div>
          ) : status === "idle" || status === "error" ? (
            <div>
              {status === "error" && (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {errorMessage}
                </div>
              )}
              <p className="mb-3 text-xs text-muted">Generate a pairing code, then send it to the Telegram bot.</p>
              <button
                onClick={handleGenerate}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-light"
              >
                Generate Pairing Code
              </button>
            </div>
          ) : status === "loading" ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Generating...
            </div>
          ) : status === "ready" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted">Your pairing code</div>
                <div className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-primary">{pairingCode}</div>
              </div>
              <ol className="space-y-2 text-xs text-muted">
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">1</span>
                  Open the bot link below
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">2</span>
                  Send <code className="rounded bg-background px-1 py-0.5 font-mono text-[10px] text-accent">/start</code>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">3</span>
                  Send code: <code className="rounded bg-background px-1 py-0.5 font-mono text-[10px] text-accent">{pairingCode}</code>
                </li>
              </ol>
              {botUrl && (
                <a
                  href={botUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-light"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                  </svg>
                  Open Telegram Bot
                </a>
              )}
              <div className="flex items-center gap-2 text-[10px] text-muted">
                <div className="h-3 w-3 animate-spin rounded-full border border-muted/30 border-t-primary/50" />
                Waiting for pairing confirmation...
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
