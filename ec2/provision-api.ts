import http from "node:http";
import fs from "node:fs";
import Database from "better-sqlite3";
import path from "node:path";
import { generateFutureSelf } from "./image-gen.js";

const PORT = 3002;
const API_KEY = process.env.EC2_API_KEY || "change-me-to-a-shared-secret";
const WEBSITE_URL = process.env.WEBSITE_URL || "https://elegant-stillness-production.up.railway.app";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const BETTERNESS_MCP_URL = "https://api.betterness.ai/mcp";
const DB_PATH = path.join(__dirname, "users.db");
const PHOTOS_DIR = "/tmp/inner-voice-photos";

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS user_tokens (
    telegram_user_id TEXT PRIMARY KEY,
    betterness_token TEXT NOT NULL,
    telegram_username TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

function authenticate(req: http.IncomingMessage): boolean {
  return req.headers["x-api-key"] === API_KEY;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // Health check
  if (req.method === "GET" && url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }

  // Verify pairing - no auth required (called by OpenClaw agent on localhost)
  if (req.method === "POST" && url.pathname === "/api/verify-pairing") {
    try {
      const body = JSON.parse(await readBody(req));
      const { pairingCode, telegramUserId } = body;

      if (!pairingCode || !telegramUserId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "pairingCode and telegramUserId are required" }));
        return;
      }

      // Call website to verify the pairing code
      const verifyRes = await fetch(`${WEBSITE_URL}/api/telegram/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({ pairingCode, telegramUserId }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        res.writeHead(verifyRes.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: verifyData.error || "Verification failed" }));
        return;
      }

      // If website returned a betterness token, store it locally
      if (verifyData.betternessToken) {
        db.prepare(`
          INSERT INTO user_tokens (telegram_user_id, betterness_token)
          VALUES (?, ?)
          ON CONFLICT(telegram_user_id) DO UPDATE SET
            betterness_token = excluded.betterness_token
        `).run(telegramUserId, verifyData.betternessToken);
        console.log(`Stored betterness token for telegram user ${telegramUserId}`);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, userName: verifyData.userName }));
    } catch (err) {
      console.error("Verify pairing error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  // Get Betterness health summary - no auth (localhost only)
  if (req.method === "POST" && url.pathname === "/api/betterness/health-summary") {
    try {
      const body = JSON.parse(await readBody(req));
      const { telegramUserId } = body;

      if (!telegramUserId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "telegramUserId is required" }));
        return;
      }

      // Look up Betterness token
      const row = db.prepare("SELECT betterness_token FROM user_tokens WHERE telegram_user_id = ?")
        .get(telegramUserId) as { betterness_token: string } | undefined;

      if (!row?.betterness_token) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No Betterness token found for this user" }));
        return;
      }

      const token = row.betterness_token;
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      };

      // Step 1: Initialize MCP session
      const initRes = await fetch(BETTERNESS_MCP_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "inner-voice", version: "1.0.0" },
          },
        }),
      });

      const sessionId = initRes.headers.get("mcp-session-id");
      if (!sessionId) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to initialize Betterness MCP session" }));
        return;
      }

      // Send initialized notification
      await fetch(BETTERNESS_MCP_URL, {
        method: "POST",
        headers: { ...headers, "mcp-session-id": sessionId },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      });

      // Step 2: Call each tool with the session ID
      let callId = 2;
      async function callBetterness(toolName: string, args: Record<string, any> = {}) {
        try {
          const r = await fetch(BETTERNESS_MCP_URL, {
            method: "POST",
            headers: { ...headers, "mcp-session-id": sessionId! },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: callId++,
              method: "tools/call",
              params: { name: toolName, arguments: args },
            }),
          });
          const contentType = r.headers.get("content-type") || "";
          if (contentType.includes("text/event-stream")) {
            // Parse SSE response — extract JSON from data: lines
            const text = await r.text();
            const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
            if (dataLine) return JSON.parse(dataLine.slice(5));
            return { error: "No data in SSE response" };
          }
          return await r.json();
        } catch (e) {
          return { error: (e as Error).message };
        }
      }

      // Date range: last 30 days
      const today = new Date().toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const dateArgs = { from: thirtyDaysAgo, to: today, zoneId: "America/New_York" };

      const [devices, sleep, activity, vitals, bodyComp, bioAge] = await Promise.all([
        callBetterness("listConnectedDevices", {}),
        callBetterness("getSleepData", dateArgs),
        callBetterness("getActivityData", dateArgs),
        callBetterness("getVitals", dateArgs),
        callBetterness("getBodyComposition", dateArgs),
        callBetterness("getBiologicalAge", {}),
      ]);

      console.log(`Betterness health data fetched for user ${telegramUserId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ devices, sleep, activity, vitals, bodyComp, bioAge }));
    } catch (err) {
      console.error("Betterness health summary error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to fetch health data" }));
    }
    return;
  }

  // Download Telegram photo - no auth (localhost only)
  if (req.method === "POST" && url.pathname === "/api/download-telegram-photo") {
    try {
      const body = JSON.parse(await readBody(req));
      const { fileId, userId } = body;

      if (!fileId || !userId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "fileId and userId are required" }));
        return;
      }

      if (!TELEGRAM_BOT_TOKEN) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }));
        return;
      }

      // Get file path from Telegram
      const fileRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileData = await fileRes.json() as any;

      if (!fileData.ok || !fileData.result?.file_path) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Could not get file from Telegram" }));
        return;
      }

      // Download the file
      const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
      const photoRes = await fetch(downloadUrl);
      const photoBuffer = Buffer.from(await photoRes.arrayBuffer());

      if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
      const photoPath = path.join(PHOTOS_DIR, `${userId}.jpg`);
      fs.writeFileSync(photoPath, photoBuffer);

      console.log(`Downloaded photo for user ${userId} to ${photoPath}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ photoPath }));
    } catch (err) {
      console.error("Download photo error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to download photo" }));
    }
    return;
  }

  // Generate future self image - no auth (localhost only)
  if (req.method === "POST" && url.pathname === "/api/generate-future-self") {
    try {
      const body = JSON.parse(await readBody(req));
      const { photoPath, lifestyleData, mode, habitChosen } = body;

      if (!photoPath || !lifestyleData || !mode) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "photoPath, lifestyleData, and mode are required" }));
        return;
      }

      if (!fs.existsSync(photoPath)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Photo file not found" }));
        return;
      }

      console.log(`Generating future self (${mode}) for ${photoPath}...`);
      const imagePath = await generateFutureSelf(photoPath, lifestyleData, mode, habitChosen);
      console.log(`Generated: ${imagePath}`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ imagePath }));
    } catch (err) {
      console.error("Generate future self error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to generate future self image" }));
    }
    return;
  }

  // Static file serving for photos
  if (req.method === "GET" && url.pathname.startsWith("/photos/")) {
    const filename = path.basename(url.pathname);
    const filePath = path.join(PHOTOS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "File not found" }));
      return;
    }

    const data = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    res.writeHead(200, { "Content-Type": mime, "Content-Length": data.length });
    res.end(data);
    return;
  }

  // All other routes require auth
  if (!authenticate(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Provision user
  if (req.method === "POST" && url.pathname === "/api/provision") {
    try {
      const body = JSON.parse(await readBody(req));
      const { telegramUsername, betternessToken, telegramUserId } = body;

      if (!betternessToken) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "betternessToken is required" }));
        return;
      }

      // Upsert user token - use username as fallback ID if no telegram user ID
      const id = telegramUserId || telegramUsername || "unknown";
      db.prepare(`
        INSERT INTO user_tokens (telegram_user_id, betterness_token, telegram_username)
        VALUES (?, ?, ?)
        ON CONFLICT(telegram_user_id) DO UPDATE SET
          betterness_token = excluded.betterness_token,
          telegram_username = excluded.telegram_username
      `).run(id, betternessToken, telegramUsername || null);

      console.log(`Provisioned user: ${telegramUsername || id}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error("Provision error:", err);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
    }
    return;
  }

  // Approve pairing
  if (req.method === "POST" && url.pathname === "/api/approve-pairing") {
    try {
      const body = JSON.parse(await readBody(req));
      const { pairingCode, telegramUserId, telegramUsername } = body;

      if (!pairingCode || !telegramUserId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "pairingCode and telegramUserId are required" }));
        return;
      }

      // Update the user record with the actual telegram user ID
      if (telegramUsername) {
        db.prepare(`
          UPDATE user_tokens SET telegram_user_id = ? WHERE telegram_username = ?
        `).run(telegramUserId, telegramUsername);
      }

      console.log(`Pairing approved: ${telegramUsername} -> ${telegramUserId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error("Pairing error:", err);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Provisioning API running on http://0.0.0.0:${PORT}`);
});
