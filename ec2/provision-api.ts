import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import pg from "pg";

const PORT = 3002;
const API_KEY = process.env.EC2_API_KEY || "change-me-to-a-shared-secret";
const WEBSITE_URL = process.env.WEBSITE_URL || "https://elegant-stillness-production.up.railway.app";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const BETTERNESS_MCP_URL = "https://api.betterness.ai/mcp";
const DATABASE_URL = process.env.DATABASE_URL || "";
const OPENCLAW_API_URL = process.env.OPENCLAW_API_URL || ""; // e.g. http://10.0.1.x:18790
const PHOTOS_DIR = "/tmp/inner-voice-photos";
const PROJECT_ROOT = __dirname;
const PYTHON_BIN = path.join(PROJECT_ROOT, ".venv", "bin", "python3");

// PostgreSQL connection pool
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("rds.amazonaws.com") ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
});

// Ensure tables exist (idempotent — matches Prisma schema)
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "UserPreferences" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE,
      "telegramUserId" TEXT NOT NULL UNIQUE,
      timezone TEXT DEFAULT 'America/New_York',
      "morningCheckinTime" TEXT DEFAULT '08:00',
      "eveningCheckinTime" TEXT DEFAULT '21:00',
      "checkinIntensity" TEXT DEFAULT 'normal',
      "dndStart" TEXT,
      "dndEnd" TEXT,
      "onboardingComplete" BOOLEAN DEFAULT false,
      "activeHabit" TEXT,
      "habitStartDate" TEXT,
      "lastVideoRefresh" TEXT,
      "baselineWeekEnd" TEXT,
      "lastMorningSent" TEXT,
      "lastEveningSent" TEXT,
      "lastWeeklySent" TEXT,
      "lastUserMessage" TIMESTAMPTZ,
      "lastTemplateIdx" INTEGER DEFAULT 0,
      "createdAt" TIMESTAMPTZ DEFAULT now(),
      "updatedAt" TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "DailyLog" (
      id SERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "telegramUserId" TEXT NOT NULL,
      date TEXT NOT NULL,
      "checkinType" TEXT DEFAULT 'morning',
      wellbeing INTEGER,
      "moodLabel" TEXT,
      "bodyStatus" TEXT DEFAULT 'fine',
      "painLocation" TEXT,
      "painSeverity" INTEGER,
      "sleepSelfReport" TEXT,
      "expectedDayLoad" TEXT,
      "didActiveHabit" BOOLEAN,
      "habitNotes" TEXT,
      notes TEXT,
      "checkinTime" TIMESTAMPTZ DEFAULT now(),
      UNIQUE("telegramUserId", date, "checkinType")
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "GenerationJob" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "telegramUserId" TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      "videoPath" TEXT,
      error TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT now(),
      "completedAt" TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "UsageLog" (
      id SERIAL PRIMARY KEY,
      "telegramUserId" TEXT NOT NULL,
      "sessionId" TEXT,
      "inputTokens" INTEGER NOT NULL DEFAULT 0,
      "outputTokens" INTEGER NOT NULL DEFAULT 0,
      "cacheReadTokens" INTEGER DEFAULT 0,
      "cacheWriteTokens" INTEGER DEFAULT 0,
      model TEXT,
      "durationMs" INTEGER,
      "createdAt" TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_usage_user_date ON "UsageLog" ("telegramUserId", "createdAt")`);
  console.log("Database tables initialized");
}

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

function deriveSkinAging(data: any): "low" | "medium" | "high" {
  let score = 0;
  if (data.sleepHours < 6) score += 2; else if (data.sleepHours < 7) score += 1;
  if (data.stressLevel === "high") score += 2;
  if (data.sittingHours > 8) score += 1;
  if (data.screenBeforeBed === "always") score += 1;
  return score >= 4 ? "high" : score >= 2 ? "medium" : "low";
}

function deriveHairGray(data: any): "low" | "medium" | "high" {
  let score = 0;
  if (data.stressLevel === "high") score += 2;
  if (data.sleepQuality === "poor") score += 1;
  return score >= 3 ? "high" : score >= 1 ? "medium" : "low";
}

function deriveHairLoss(data: any): "low" | "medium" | "high" {
  let score = 0;
  if (data.dietQuality === "mostly processed") score += 2;
  if (data.exerciseFrequency === "rarely" || data.exerciseFrequency === "never") score += 1;
  if (data.stressLevel === "high") score += 1;
  return score >= 3 ? "high" : score >= 1 ? "medium" : "low";
}

// Helper: look up Betterness token for a Telegram user
async function getBetternessToken(telegramUserId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT bc."encryptedToken" FROM "BetternessConnection" bc
     JOIN "TelegramPairing" tp ON bc."userId" = tp."userId"
     WHERE tp."telegramUserId" = $1`,
    [telegramUserId]
  );
  return result.rows[0]?.encryptedToken ?? null;
}

// Helper: look up userId from telegramUserId
async function getUserIdByTelegram(telegramUserId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT "userId" FROM "TelegramPairing" WHERE "telegramUserId" = $1`,
    [telegramUserId]
  );
  return result.rows[0]?.userId ?? null;
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
        res.end(JSON.stringify({ error: (verifyData as any).error || "Verification failed" }));
        return;
      }

      console.log(`Pairing verified for telegram user ${telegramUserId}`);

      // Auto-provision OpenClaw agent for this user (fire-and-forget)
      if (OPENCLAW_API_URL) {
        fetch(`${OPENCLAW_API_URL}/agents/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
          body: JSON.stringify({ telegramUserId, userName: (verifyData as any).userName }),
        })
          .then((r) => r.json())
          .then((d) => console.log(`Agent provisioned for ${telegramUserId}:`, d))
          .catch((e) => console.error(`Agent provision failed for ${telegramUserId}:`, e.message));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, userName: (verifyData as any).userName }));
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
      const token = await getBetternessToken(telegramUserId);

      if (!token) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No Betterness token found for this user" }));
        return;
      }

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

  // Generate future self video - async with polling (localhost only)
  if (req.method === "POST" && url.pathname === "/api/generate-future-self") {
    try {
      const body = JSON.parse(await readBody(req));
      const { photoPath, lifestyleData, mode, telegramUserId } = body;

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

      const jobId = crypto.randomUUID();
      if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
      const outputPath = path.join(PHOTOS_DIR, `${jobId}.mp4`);
      const scenario = mode === "bad_trajectory" ? "unhealthy" : "healthy";

      const skinAging = mode === "good_trajectory" ? "low" : deriveSkinAging(lifestyleData);
      const hairGray = mode === "good_trajectory" ? "low" : deriveHairGray(lifestyleData);
      const hairLoss = mode === "good_trajectory" ? "low" : deriveHairLoss(lifestyleData);

      // Look up userId for the relation
      const userId = telegramUserId ? await getUserIdByTelegram(telegramUserId) : null;

      await pool.query(
        `INSERT INTO "GenerationJob" (id, "userId", "telegramUserId", mode, status, "createdAt")
         VALUES ($1, $2, $3, $4, 'pending', now())`,
        [jobId, userId || "unknown", telegramUserId || "unknown", mode]
      );

      console.log(`Starting morph job ${jobId} (${mode}) for ${photoPath}...`);

      const proc = spawn(PYTHON_BIN, [
        "scripts/aging_morph.py",
        "--input", photoPath,
        "--output", outputPath,
        "--backend", "hidream_e1",
        "--scenario", scenario,
        "--skin-aging", skinAging,
        "--hair-gray", hairGray,
        "--hair-loss", hairLoss,
        "--duration", "8",
      ], { cwd: PROJECT_ROOT, env: { ...process.env } });

      let stderr = "";
      proc.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

      proc.on("error", async (err) => {
        await pool.query(
          `UPDATE "GenerationJob" SET status = 'failed', error = $1, "completedAt" = now() WHERE id = $2`,
          [err.message, jobId]
        );
        console.error(`Job ${jobId} spawn error: ${err.message}`);
      });

      proc.on("close", async (code) => {
        if (code === 0) {
          await pool.query(
            `UPDATE "GenerationJob" SET status = 'completed', "videoPath" = $1, "completedAt" = now() WHERE id = $2`,
            [outputPath, jobId]
          );
          console.log(`Job ${jobId} completed: ${outputPath}`);
        } else {
          const errMsg = stderr.trim().split("\n").pop() || `Exit code ${code}`;
          await pool.query(
            `UPDATE "GenerationJob" SET status = 'failed', error = $1, "completedAt" = now() WHERE id = $2`,
            [errMsg, jobId]
          );
          console.error(`Job ${jobId} failed (code ${code}): ${errMsg}`);
        }
      });

      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jobId, status: "pending" }));
    } catch (err) {
      console.error("Generate future self error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to start generation job" }));
    }
    return;
  }

  // Poll job status - no auth (localhost only)
  if (req.method === "GET" && url.pathname.startsWith("/api/job-status/")) {
    const jobId = url.pathname.split("/").pop();
    const result = await pool.query(
      `SELECT id, status, "videoPath", error FROM "GenerationJob" WHERE id = $1`,
      [jobId]
    );
    if (result.rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Job not found" }));
      return;
    }
    const job = result.rows[0];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jobId: job.id,
      status: job.status,
      videoPath: job.videoPath,
      error: job.error,
    }));
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
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".mp4": "video/mp4",
    };
    const mime = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Content-Length": data.length });
    res.end(data);
    return;
  }

  // POST /api/daily-log — store a check-in
  if (req.method === "POST" && url.pathname === "/api/daily-log") {
    try {
      const body = JSON.parse(await readBody(req));
      const { telegramUserId, date, checkinType, wellbeing, moodLabel, bodyStatus,
              painLocation, painSeverity, sleepSelfReport, expectedDayLoad,
              didActiveHabit, habitNotes, notes } = body;
      if (!telegramUserId || !date) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "telegramUserId and date are required" }));
        return;
      }

      const userId = await getUserIdByTelegram(telegramUserId) || "unknown";

      await pool.query(
        `INSERT INTO "DailyLog" ("userId", "telegramUserId", date, "checkinType", wellbeing, "moodLabel",
          "bodyStatus", "painLocation", "painSeverity", "sleepSelfReport", "expectedDayLoad",
          "didActiveHabit", "habitNotes", notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT ("telegramUserId", date, "checkinType") DO UPDATE SET
          wellbeing = EXCLUDED.wellbeing, "moodLabel" = EXCLUDED."moodLabel",
          "bodyStatus" = EXCLUDED."bodyStatus", "painLocation" = EXCLUDED."painLocation",
          "painSeverity" = EXCLUDED."painSeverity", "sleepSelfReport" = EXCLUDED."sleepSelfReport",
          "expectedDayLoad" = EXCLUDED."expectedDayLoad", "didActiveHabit" = EXCLUDED."didActiveHabit",
          "habitNotes" = EXCLUDED."habitNotes", notes = EXCLUDED.notes,
          "checkinTime" = now()`,
        [userId, telegramUserId, date, checkinType || "morning", wellbeing ?? null,
          moodLabel ?? null, bodyStatus ?? "fine", painLocation ?? null,
          painSeverity ?? null, sleepSelfReport ?? null, expectedDayLoad ?? null,
          didActiveHabit ?? null, habitNotes ?? null, notes ?? null]
      );

      // Update last_user_message timestamp
      await pool.query(
        `UPDATE "UserPreferences" SET "lastUserMessage" = now(), "updatedAt" = now()
         WHERE "telegramUserId" = $1`,
        [telegramUserId]
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error("Daily log error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to store daily log" }));
    }
    return;
  }

  // GET /api/daily-log/:userId/summary?days=7
  if (req.method === "GET" && url.pathname.match(/^\/api\/daily-log\/[^/]+\/summary$/)) {
    try {
      const userId = url.pathname.split("/")[3];
      const days = parseInt(url.searchParams.get("days") || "7", 10);

      const result = await pool.query(
        `SELECT * FROM "DailyLog"
         WHERE "telegramUserId" = $1 AND date >= (CURRENT_DATE - $2 * INTERVAL '1 day')::text
         ORDER BY date DESC, "checkinType"`,
        [userId, days]
      );
      const logs = result.rows;

      const wellbeingValues = logs.map((l: any) => l.wellbeing).filter((v: any): v is number => v != null);
      const avgWellbeing = wellbeingValues.length > 0
        ? Math.round((wellbeingValues.reduce((a: number, b: number) => a + b, 0) / wellbeingValues.length) * 10) / 10
        : null;
      const habitLogs = logs.filter((l: any) => l.didActiveHabit != null);
      const habitCompletionRate = habitLogs.length > 0
        ? Math.round((habitLogs.filter((l: any) => l.didActiveHabit === true).length / habitLogs.length) * 100)
        : null;
      const painMap: Record<string, number> = {};
      for (const l of logs) {
        if ((l as any).painLocation) {
          painMap[(l as any).painLocation] = (painMap[(l as any).painLocation] || 0) + 1;
        }
      }
      const painMentions = Object.entries(painMap).map(([location, count]) => ({ location, count }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ logs, avgWellbeing, habitCompletionRate, painMentions }));
    } catch (err) {
      console.error("Daily log summary error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to get summary" }));
    }
    return;
  }

  // GET /api/daily-log/:userId/trends
  if (req.method === "GET" && url.pathname.match(/^\/api\/daily-log\/[^/]+\/trends$/)) {
    try {
      const userId = url.pathname.split("/")[3];

      const weeklyResult = await pool.query(
        `SELECT EXTRACT(WEEK FROM date::date) as week_num,
                MIN(date) as week_start,
                AVG(wellbeing) as avg_wellbeing,
                CAST(SUM(CASE WHEN "didActiveHabit" = true THEN 1 ELSE 0 END) AS REAL) /
                  NULLIF(SUM(CASE WHEN "didActiveHabit" IS NOT NULL THEN 1 ELSE 0 END), 0) as habit_rate
         FROM "DailyLog"
         WHERE "telegramUserId" = $1 AND wellbeing IS NOT NULL
         GROUP BY week_num
         ORDER BY week_num`,
        [userId]
      );
      const weeklyAverages = weeklyResult.rows.map((r: any) => ({
        weekStart: r.week_start,
        avgWellbeing: Math.round(r.avg_wellbeing * 10) / 10,
        habitRate: r.habit_rate != null ? Math.round(r.habit_rate * 100) : null,
      }));

      const painResult = await pool.query(
        `SELECT "painLocation" as location, COUNT(*) as occurrences
         FROM "DailyLog"
         WHERE "telegramUserId" = $1 AND "painLocation" IS NOT NULL
         GROUP BY "painLocation"
         ORDER BY occurrences DESC`,
        [userId]
      );
      const recurringPain = painResult.rows;

      const totalDaysResult = await pool.query(
        `SELECT COUNT(DISTINCT date) as cnt FROM "DailyLog" WHERE "telegramUserId" = $1`,
        [userId]
      );
      const totalDays = parseInt(totalDaysResult.rows[0]?.cnt || "0", 10);

      // Current streak: consecutive days with a log up to today
      const allDatesResult = await pool.query(
        `SELECT DISTINCT date FROM "DailyLog"
         WHERE "telegramUserId" = $1 ORDER BY date DESC`,
        [userId]
      );
      let currentStreak = 0;
      const today = new Date();
      for (let i = 0; i < allDatesResult.rows.length; i++) {
        const expected = new Date(today);
        expected.setDate(expected.getDate() - i);
        const expectedStr = expected.toISOString().split("T")[0];
        if (allDatesResult.rows[i].date === expectedStr) {
          currentStreak++;
        } else {
          break;
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ weeklyAverages, recurringPain, totalDays, currentStreak }));
    } catch (err) {
      console.error("Trends error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to get trends" }));
    }
    return;
  }

  // POST /api/user-preferences — upsert
  if (req.method === "POST" && url.pathname === "/api/user-preferences") {
    try {
      const body = JSON.parse(await readBody(req));
      const { telegramUserId, ...fields } = body;
      if (!telegramUserId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "telegramUserId is required" }));
        return;
      }

      const allowedFields: Record<string, string> = {
        timezone: "timezone",
        morningCheckinTime: "morningCheckinTime",
        eveningCheckinTime: "eveningCheckinTime",
        checkinIntensity: "checkinIntensity",
        dndStart: "dndStart",
        dndEnd: "dndEnd",
        onboardingComplete: "onboardingComplete",
        activeHabit: "activeHabit",
        habitStartDate: "habitStartDate",
        lastVideoRefresh: "lastVideoRefresh",
        baselineWeekEnd: "baselineWeekEnd",
        lastMorningSent: "lastMorningSent",
        lastEveningSent: "lastEveningSent",
        lastWeeklySent: "lastWeeklySent",
        lastUserMessage: "lastUserMessage",
        lastTemplateIdx: "lastTemplateIdx",
      };

      // Build dynamic update
      const setClauses: string[] = [`"updatedAt" = now()`];
      const values: any[] = [];
      let paramIdx = 1;

      for (const [key, val] of Object.entries(fields)) {
        const dbField = allowedFields[key];
        if (dbField && val !== undefined) {
          setClauses.push(`"${dbField}" = $${paramIdx}`);
          values.push(val);
          paramIdx++;
        }
      }

      // Look up userId for the relation
      const userId = await getUserIdByTelegram(telegramUserId);

      // Upsert
      values.push(telegramUserId);
      const telegramParam = `$${paramIdx}`;
      paramIdx++;
      values.push(userId || "unknown");
      const userIdParam = `$${paramIdx}`;

      await pool.query(
        `INSERT INTO "UserPreferences" (id, "userId", "telegramUserId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, ${userIdParam}, ${telegramParam}, now(), now())
         ON CONFLICT ("telegramUserId") DO UPDATE SET ${setClauses.join(", ")}`,
        values
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error("User preferences error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to update preferences" }));
    }
    return;
  }

  // GET /api/user-preferences/:userId
  if (req.method === "GET" && url.pathname.match(/^\/api\/user-preferences\/[^/]+$/)) {
    try {
      const userId = url.pathname.split("/").pop();
      const result = await pool.query(
        `SELECT * FROM "UserPreferences" WHERE "telegramUserId" = $1`,
        [userId]
      );
      if (result.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User preferences not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.rows[0]));
    } catch (err) {
      console.error("Get preferences error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to get preferences" }));
    }
    return;
  }

  // POST /api/send-telegram-message — proactive messaging
  if (req.method === "POST" && url.pathname === "/api/send-telegram-message") {
    try {
      const body = JSON.parse(await readBody(req));
      const { telegramUserId, text, parseMode } = body;
      if (!telegramUserId || !text) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "telegramUserId and text are required" }));
        return;
      }
      if (!TELEGRAM_BOT_TOKEN) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }));
        return;
      }
      const tgBody: Record<string, string> = {
        chat_id: telegramUserId,
        text,
      };
      if (parseMode) tgBody.parse_mode = parseMode;
      const tgRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tgBody),
        }
      );
      const tgData = await tgRes.json();
      res.writeHead(tgRes.ok ? 200 : 502, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tgData));
    } catch (err) {
      console.error("Send telegram message error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to send message" }));
    }
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

      // The Betterness token is now stored in BetternessConnection by the web app.
      // This endpoint is kept for backward compatibility but no longer stores tokens directly.
      console.log(`Provision request for user: ${telegramUsername || telegramUserId || "unknown"}`);
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

      // Pairing approval now happens via the web app's TelegramPairing table
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

  // Agent status proxy — forwards to OpenClaw Agent Manager
  const agentStatusMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/status$/);
  if (req.method === "GET" && agentStatusMatch && OPENCLAW_API_URL) {
    try {
      const agentId = agentStatusMatch[1];
      const agentRes = await fetch(`${OPENCLAW_API_URL}/agents/${agentId}/status`, {
        headers: { "x-api-key": API_KEY },
      });
      const data = await agentRes.json();
      res.writeHead(agentRes.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (err: any) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Agent manager unavailable" }));
    }
    return;
  }

  // POST /api/usage/log — log a usage entry
  if (req.method === "POST" && url.pathname === "/api/usage/log") {
    try {
      const body = JSON.parse(await readBody(req));
      const { telegramUserId, sessionId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, model, durationMs } = body;
      if (!telegramUserId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "telegramUserId is required" }));
        return;
      }
      await pool.query(
        `INSERT INTO "UsageLog" ("telegramUserId", "sessionId", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", model, "durationMs")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [telegramUserId, sessionId || null, inputTokens || 0, outputTokens || 0, cacheReadTokens || 0, cacheWriteTokens || 0, model || null, durationMs || null]
      );
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
      console.error("Usage log error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/usage/summary?userId=X&days=30
  if (req.method === "GET" && url.pathname === "/api/usage/summary") {
    try {
      const userId = url.searchParams.get("userId");
      const days = parseInt(url.searchParams.get("days") || "30", 10);
      if (!userId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "userId is required" }));
        return;
      }
      const summary = await pool.query(
        `SELECT
           COUNT(*) as total_requests,
           COALESCE(SUM("inputTokens"), 0) as total_input,
           COALESCE(SUM("outputTokens"), 0) as total_output,
           COALESCE(SUM("cacheReadTokens"), 0) as total_cache_read,
           COALESCE(SUM("cacheWriteTokens"), 0) as total_cache_write,
           COALESCE(AVG("durationMs"), 0) as avg_duration
         FROM "UsageLog"
         WHERE "telegramUserId" = $1 AND "createdAt" > NOW() - INTERVAL '1 day' * $2`,
        [userId, days]
      );
      const daily = await pool.query(
        `SELECT DATE("createdAt") as date, COUNT(*) as requests,
           SUM("inputTokens") as input_tokens, SUM("outputTokens") as output_tokens
         FROM "UsageLog"
         WHERE "telegramUserId" = $1 AND "createdAt" > NOW() - INTERVAL '1 day' * $2
         GROUP BY DATE("createdAt") ORDER BY date DESC`,
        [userId, days]
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ summary: summary.rows[0], daily: daily.rows }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/usage/recent?userId=X&limit=20
  if (req.method === "GET" && url.pathname === "/api/usage/recent") {
    try {
      const userId = url.searchParams.get("userId");
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);
      if (!userId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "userId is required" }));
        return;
      }
      const result = await pool.query(
        `SELECT * FROM "UsageLog" WHERE "telegramUserId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
        [userId, limit]
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ entries: result.rows }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Start server after DB init
initDb().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Provisioning API running on http://0.0.0.0:${PORT}`);
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
