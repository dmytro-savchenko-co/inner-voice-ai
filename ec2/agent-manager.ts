/**
 * Agent Manager — lightweight HTTP API for managing OpenClaw agents.
 * Runs on the OpenClaw EC2 instance alongside the OpenClaw gateway.
 * Called by the Platform API (on ECS Fargate) to provision/manage per-user agents.
 *
 * Endpoints:
 *   POST /agents/provision  — create a new agent + bind to Telegram user
 *   GET  /agents/:id/status — check if an agent exists
 *   DELETE /agents/:id      — delete an agent
 *   GET  /health            — health check
 */

import http from "node:http";
import { execSync } from "node:child_process";

const PORT = parseInt(process.env.AGENT_MANAGER_PORT || "18790", 10);
const API_KEY = process.env.EC2_API_KEY || "change-me-to-a-shared-secret";
const PLATFORM_API_URL = process.env.PLATFORM_API_URL || "http://innervoice-dev-alb-1965498156.us-east-1.elb.amazonaws.com";

async function logUsage(telegramUserId: string, usage: any, model: string, durationMs?: number) {
  try {
    await fetch(`${PLATFORM_API_URL}/api/usage/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramUserId,
        inputTokens: usage?.input || 0,
        outputTokens: usage?.output || 0,
        cacheReadTokens: usage?.cacheRead || 0,
        cacheWriteTokens: usage?.cacheWrite || 0,
        model,
        durationMs,
      }),
    });
  } catch (err: any) {
    console.error("Usage log failed:", err.message);
  }
}

function authenticate(req: http.IncomingMessage): boolean {
  return req.headers["x-api-key"] === API_KEY;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function runClaw(args: string): string {
  return execSync(`openclaw ${args}`, {
    encoding: "utf-8",
    timeout: 30000,
    env: { ...process.env, HOME: process.env.HOME || "/home/ec2-user" },
  }).trim();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // Health check (no auth)
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // All other endpoints require auth
  if (!authenticate(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // POST /agents/provision — create agent + bind to Telegram user
  if (req.method === "POST" && url.pathname === "/agents/provision") {
    try {
      const body = JSON.parse(await readBody(req));
      const { telegramUserId, userName } = body;

      if (!telegramUserId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "telegramUserId is required" }));
        return;
      }

      const agentId = `user-${telegramUserId}`;

      // Check if agent already exists
      try {
        const list = runClaw("agents list --json");
        const agents = JSON.parse(list);
        if (agents.some((a: any) => a.id === agentId || a.name === agentId)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ agentId, status: "already_exists" }));
          return;
        }
      } catch {
        // agents list may fail if no agents exist yet — that's fine
      }

      // Create agent with isolated workspace
      const addResult = runClaw(
        `agents add "${agentId}" --non-interactive --json`
      );
      console.log(`Agent created: ${agentId}`, addResult);

      // Bind agent to Telegram user ID
      const bindResult = runClaw(
        `agents bind --agent "${agentId}" --bind "telegram:${telegramUserId}"`
      );
      console.log(`Agent bound: ${agentId} -> telegram:${telegramUserId}`, bindResult);

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ agentId, status: "provisioned", userName }));
    } catch (err: any) {
      console.error("Provision error:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /agents/:id/status
  const statusMatch = url.pathname.match(/^\/agents\/([^/]+)\/status$/);
  if (req.method === "GET" && statusMatch) {
    try {
      const agentId = statusMatch[1];
      const list = runClaw("agents list --json");
      const agents = JSON.parse(list);
      const agent = agents.find((a: any) => a.id === agentId || a.name === agentId);

      if (agent) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ agentId, status: "active", ...agent }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ agentId, status: "not_found" }));
      }
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // DELETE /agents/:id
  const deleteMatch = url.pathname.match(/^\/agents\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    try {
      const agentId = deleteMatch[1];
      const result = runClaw(`agents delete "${agentId}" --json`);
      console.log(`Agent deleted: ${agentId}`, result);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ agentId, status: "deleted" }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /usage/log — log usage from external callers (e.g. OpenClaw webhook)
  if (req.method === "POST" && url.pathname === "/usage/log") {
    try {
      const body = JSON.parse(await readBody(req));
      const { telegramUserId, usage, model, durationMs } = body;
      if (!telegramUserId || !usage) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "telegramUserId and usage required" }));
        return;
      }
      await logUsage(telegramUserId, usage, model, durationMs);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Agent Manager running on http://0.0.0.0:${PORT}`);
});
