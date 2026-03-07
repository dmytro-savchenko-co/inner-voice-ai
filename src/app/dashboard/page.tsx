"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  id: string;
  email: string;
  name: string;
  betternessConnected: boolean;
  telegramPaired: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();

        if (!data.user) {
          router.push("/login");
          return;
        }

        setUser(data.user);
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }

    fetchSession();
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-border bg-card/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-primary">
            Inner Voice AI
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted">{user.email}</span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-card-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-500/50 hover:text-red-400"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-2 text-3xl font-bold text-foreground">
          Welcome, {user.name}
        </h1>
        <p className="mb-8 text-muted">
          Your habit protocols and integrations
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Betterness Connection Card */}
          <div className="rounded-xl border border-card-border bg-card/80 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  user.betternessConnected
                    ? "bg-primary/20 text-primary"
                    : "bg-card-border/50 text-muted"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Betterness Connection
                </h2>
                <p className="text-sm text-muted">Sleep, HRV, and activity data</p>
              </div>
            </div>

            <div className="mb-5">
              {user.betternessConnected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-medium text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-accent">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  Not connected
                </span>
              )}
            </div>

            {!user.betternessConnected && (
              <Link
                href="/dashboard/connect-betterness"
                className="inline-block rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-light"
              >
                Connect
              </Link>
            )}
          </div>

          {/* Telegram Bot Card */}
          <div className="rounded-xl border border-card-border bg-card/80 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  user.telegramPaired
                    ? "bg-primary/20 text-primary"
                    : "bg-card-border/50 text-muted"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                  <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Telegram Bot
                </h2>
                <p className="text-sm text-muted">Your habit coaching agent</p>
              </div>
            </div>

            <div className="mb-5">
              {user.telegramPaired ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-medium text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Paired
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-accent">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  Not paired
                </span>
              )}
            </div>

            {!user.telegramPaired && (
              <Link
                href="/dashboard/telegram"
                className="inline-block rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-light"
              >
                Set Up Telegram
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
