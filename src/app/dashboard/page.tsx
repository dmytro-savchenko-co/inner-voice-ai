"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "./layout";

interface AgentStatus {
  status: string;
}

interface DailyLogEntry {
  date: string;
  checkinType: string;
  wellbeing: number | null;
  bodyStatus: string | null;
  didActiveHabit: boolean | null;
  checkinTime: string;
}

export default function DashboardPage() {
  const user = useUser();
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<DailyLogEntry[]>([]);

  useEffect(() => {
    if (!user?.telegramUserId) return;

    fetch(`/api/agents/${user.telegramUserId}/status`)
      .then((r) => r.json())
      .then((d: AgentStatus) => setAgentStatus(d.status ?? "unknown"))
      .catch(() => setAgentStatus("unavailable"));

    fetch(`/api/usage?type=logs&userId=${user.telegramUserId}`)
      .then((r) => r.ok ? r.json() : { logs: [] })
      .then((d) => setRecentLogs(d.logs?.slice(0, 5) ?? []))
      .catch(() => {});
  }, [user?.telegramUserId]);

  if (!user) return null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="mx-auto max-w-5xl">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {greeting}, {user.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your habit protocols and integrations
        </p>
      </div>

      {/* Quick stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Betterness"
          value={user.betternessConnected ? "Connected" : "Not connected"}
          color={user.betternessConnected ? "teal" : "amber"}
        />
        <StatCard
          label="Telegram"
          value={user.telegramPaired ? "Paired" : "Not paired"}
          color={user.telegramPaired ? "teal" : "amber"}
        />
        <StatCard
          label="Agent"
          value={agentStatus === "active" ? "Active" : agentStatus === "not_found" ? "Not provisioned" : agentStatus ?? "..."}
          color={agentStatus === "active" ? "teal" : "muted"}
        />
        <StatCard
          label="Check-ins"
          value={recentLogs.length > 0 ? `${recentLogs.length} recent` : "None yet"}
          color={recentLogs.length > 0 ? "teal" : "muted"}
        />
      </div>

      {/* Connection cards */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Betterness */}
        <div className="group relative overflow-hidden rounded-xl border border-card-border/60 bg-card/50 p-5 backdrop-blur-sm transition-all hover:border-card-border">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 transition-all group-hover:bg-primary/10" />
          <div className="relative">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${user.betternessConnected ? "bg-primary/15 text-primary" : "bg-card-border/40 text-muted"}`}>
                  <svg className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Betterness</h3>
                  <p className="text-xs text-muted">Sleep, HRV, activity data</p>
                </div>
              </div>
              <StatusBadge connected={user.betternessConnected} label={user.betternessConnected ? "Connected" : "Not connected"} />
            </div>
            {!user.betternessConnected && (
              <Link
                href="/dashboard/connections"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary-light"
              >
                Connect now
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {/* Telegram */}
        <div className="group relative overflow-hidden rounded-xl border border-card-border/60 bg-card/50 p-5 backdrop-blur-sm transition-all hover:border-card-border">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 transition-all group-hover:bg-primary/10" />
          <div className="relative">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${user.telegramPaired ? "bg-primary/15 text-primary" : "bg-card-border/40 text-muted"}`}>
                  <svg className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                    <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Telegram Bot</h3>
                  <p className="text-xs text-muted">Your habit coaching agent</p>
                </div>
              </div>
              <StatusBadge connected={user.telegramPaired} label={user.telegramPaired ? "Paired" : "Not paired"} />
            </div>
            {!user.telegramPaired && (
              <Link
                href="/dashboard/connections"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary-light"
              >
                Set up now
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      {recentLogs.length > 0 && (
        <div className="rounded-xl border border-card-border/60 bg-card/30 p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Check-ins</h3>
          <div className="space-y-2">
            {recentLogs.map((log, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-card-border/10 px-3 py-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  (log.wellbeing ?? 0) >= 7 ? "bg-primary/15 text-primary" :
                  (log.wellbeing ?? 0) >= 5 ? "bg-amber-500/15 text-amber-400" :
                  "bg-red-500/15 text-red-400"
                }`}>
                  {log.wellbeing ?? "?"}
                </div>
                <div className="flex-1">
                  <span className="text-xs text-foreground">
                    {log.checkinType === "morning" ? "Morning" : "Evening"} check-in
                  </span>
                  {log.bodyStatus && log.bodyStatus !== "fine" && (
                    <span className="ml-2 text-[10px] text-muted">{log.bodyStatus}</span>
                  )}
                </div>
                <span className="text-[10px] text-muted">
                  {new Date(log.checkinTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!user.betternessConnected && !user.telegramPaired && (
        <div className="mt-6 rounded-xl border border-dashed border-card-border/60 bg-card/20 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-foreground">Get started</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Connect your Betterness account and pair your Telegram bot to start receiving personalized coaching.
          </p>
          <Link
            href="/dashboard/connections"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-light"
          >
            Set up connections
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: "teal" | "amber" | "muted" }) {
  const dotColor = color === "teal" ? "bg-primary" : color === "amber" ? "bg-amber-500" : "bg-muted/40";
  return (
    <div className="rounded-lg border border-card-border/40 bg-card/30 px-3.5 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted/70">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <div className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className="text-xs font-medium text-foreground">{value}</span>
      </div>
    </div>
  );
}

function StatusBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
      connected
        ? "bg-primary/10 text-primary"
        : "bg-amber-500/10 text-amber-400"
    }`}>
      <span className={`h-1 w-1 rounded-full ${connected ? "bg-primary" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}
