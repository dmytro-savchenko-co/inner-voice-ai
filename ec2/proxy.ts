import http from "node:http";
import https from "node:https";
import pg from "pg";

const PORT = 3001;
const BETTERNESS_MCP_URL = "https://api.betterness.ai/mcp";
const DATABASE_URL = process.env.DATABASE_URL || "";

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("rds.amazonaws.com") ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

async function getTokenForUser(telegramUserId: string): Promise<string | undefined> {
  const result = await pool.query(
    `SELECT bc."encryptedToken" FROM "BetternessConnection" bc
     JOIN "TelegramPairing" tp ON bc."userId" = tp."userId"
     WHERE tp."telegramUserId" = $1`,
    [telegramUserId]
  );
  return result.rows[0]?.encryptedToken;
}

async function getTokenByUsername(username: string): Promise<string | undefined> {
  const result = await pool.query(
    `SELECT bc."encryptedToken" FROM "BetternessConnection" bc
     JOIN "TelegramPairing" tp ON bc."userId" = tp."userId"
     WHERE tp."telegramUsername" = $1`,
    [username]
  );
  return result.rows[0]?.encryptedToken;
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
    token = await getTokenForUser(telegramUserId);
  }
  if (!token && telegramUsername) {
    token = await getTokenByUsername(telegramUsername);
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Betterness MCP Proxy running on http://0.0.0.0:${PORT}`);
});
