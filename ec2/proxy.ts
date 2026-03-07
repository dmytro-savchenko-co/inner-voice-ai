import http from "node:http";
import https from "node:https";
import Database from "better-sqlite3";
import path from "node:path";

const PORT = 3001;
const BETTERNESS_MCP_URL = "https://api.betterness.ai/mcp";
const DB_PATH = path.join(__dirname, "users.db");

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS user_tokens (
    telegram_user_id TEXT PRIMARY KEY,
    betterness_token TEXT NOT NULL,
    telegram_username TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

function getTokenForUser(telegramUserId: string): string | undefined {
  const row = db.prepare("SELECT betterness_token FROM user_tokens WHERE telegram_user_id = ?").get(telegramUserId) as
    | { betterness_token: string }
    | undefined;
  return row?.betterness_token;
}

function getTokenByUsername(username: string): string | undefined {
  const row = db
    .prepare("SELECT betterness_token FROM user_tokens WHERE telegram_username = ?")
    .get(username) as { betterness_token: string } | undefined;
  return row?.betterness_token;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const body = await new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });

  // Extract telegram user info from MCP session context or headers
  const telegramUserId = req.headers["x-telegram-user-id"] as string;
  const telegramUsername = req.headers["x-telegram-username"] as string;

  let token: string | undefined;
  if (telegramUserId) {
    token = getTokenForUser(telegramUserId);
  }
  if (!token && telegramUsername) {
    token = getTokenByUsername(telegramUsername);
  }

  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No Betterness token configured for this user" }));
    return;
  }

  // Forward to Betterness MCP with user's token
  const url = new URL(BETTERNESS_MCP_URL);
  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to reach Betterness API" }));
  });

  proxyReq.write(body);
  proxyReq.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Betterness MCP Proxy running on http://127.0.0.1:${PORT}`);
});
