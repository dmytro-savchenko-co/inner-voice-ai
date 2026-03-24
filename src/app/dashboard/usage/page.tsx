"use client";

import { useEffect, useState } from "react";
import { useUser } from "../layout";

interface UsageSummary {
  total_requests: string;
  total_input: string;
  total_output: string;
  total_cache_read: string;
  total_cache_write: string;
  avg_duration: string;
}

interface DailyUsage {
  date: string;
  requests: string;
  input_tokens: string;
  output_tokens: string;
}

interface UsageEntry {
  id: number;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
  durationMs: number | null;
  createdAt: string;
}

export default function UsagePage() {
  const user = useUser();
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [recent, setRecent] = useState<UsageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.telegramUserId) {
      setLoading(false);
      return;
    }

    Promise.all([
      fetch("/api/usage?type=summary&days=30").then((r) => r.json()),
      fetch("/api/usage?type=recent&limit=15").then((r) => r.json()),
    ])
      .then(([summaryData, recentData]) => {
        setSummary(summaryData.summary || null);
        setDaily(summaryData.daily || []);
        setRecent(recentData.entries || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.telegramUserId]);

  if (!user) return null;

  const totalTokens = summary
    ? parseInt(summary.total_input) + parseInt(summary.total_output)
    : 0;
  const totalRequests = summary ? parseInt(summary.total_requests) : 0;
  const estimatedCost = totalTokens > 0
    ? ((parseInt(summary!.total_input) * 3 + parseInt(summary!.total_output) * 15) / 1_000_000).toFixed(4)
    : "0.00";
  const cacheHitRate = summary && (parseInt(summary.total_cache_read) + parseInt(summary.total_input)) > 0
    ? Math.round((parseInt(summary.total_cache_read) / (parseInt(summary.total_cache_read) + parseInt(summary.total_input))) * 100)
    : 0;

  const maxDailyRequests = Math.max(...daily.map((d) => parseInt(d.requests)), 1);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Usage</h1>
        <p className="mt-1 text-sm text-muted">API requests and token consumption over the last 30 days</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading usage data...
        </div>
      ) : !user.telegramUserId ? (
        <div className="rounded-xl border border-dashed border-card-border/60 bg-card/20 p-8 text-center">
          <p className="text-sm text-muted">Pair your Telegram bot to start tracking usage.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="Requests" value={totalRequests.toLocaleString()} sub="this month" />
            <SummaryCard label="Total Tokens" value={formatNumber(totalTokens)} sub="input + output" />
            <SummaryCard label="Est. Cost" value={`$${estimatedCost}`} sub="Sonnet pricing" />
            <SummaryCard label="Cache Hit" value={`${cacheHitRate}%`} sub="prompt cache" />
          </div>

          {/* Daily chart */}
          {daily.length > 0 && (
            <div className="mb-6 rounded-xl border border-card-border/60 bg-card/30 p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Daily Requests</h3>
              <div className="flex items-end gap-1" style={{ height: 120 }}>
                {daily.slice(0, 30).reverse().map((d, i) => {
                  const h = Math.max((parseInt(d.requests) / maxDailyRequests) * 100, 4);
                  return (
                    <div key={i} className="group relative flex-1">
                      <div
                        className="w-full rounded-t bg-primary/60 transition-colors group-hover:bg-primary"
                        style={{ height: `${h}%` }}
                      />
                      <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 rounded bg-card px-2 py-1 text-[9px] text-foreground shadow-lg group-hover:block">
                        {d.requests} req
                        <br />
                        {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[9px] text-muted/60">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
            </div>
          )}

          {/* Recent requests */}
          <div className="rounded-xl border border-card-border/60 bg-card/30 p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Requests</h3>
            {recent.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">No usage data yet. Start chatting with the bot.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-card-border/30 text-left text-[10px] font-medium uppercase tracking-wider text-muted/60">
                      <th className="pb-2 pr-4">Time</th>
                      <th className="pb-2 pr-4">Model</th>
                      <th className="pb-2 pr-4 text-right">Input</th>
                      <th className="pb-2 pr-4 text-right">Output</th>
                      <th className="pb-2 pr-4 text-right">Cache</th>
                      <th className="pb-2 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((entry) => (
                      <tr key={entry.id} className="border-b border-card-border/10 text-muted">
                        <td className="py-2 pr-4 text-foreground/80">
                          {new Date(entry.createdAt).toLocaleString("en-US", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2 pr-4">
                          <span className="rounded bg-card-border/20 px-1.5 py-0.5 font-mono text-[10px]">
                            {entry.model?.replace("us.anthropic.", "").replace("amazon-bedrock/", "") || "—"}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">{entry.inputTokens.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right font-mono">{entry.outputTokens.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right font-mono text-muted/50">
                          {entry.cacheReadTokens > 0 ? `${formatNumber(entry.cacheReadTokens)} read` : "—"}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {entry.durationMs ? `${(entry.durationMs / 1000).toFixed(1)}s` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-card-border/40 bg-card/30 p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted/60">{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight text-foreground">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted/50">{sub}</div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
