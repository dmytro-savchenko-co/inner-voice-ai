/**
 * Migration script: SQLite (Railway app.db + EC2 users.db) → PostgreSQL
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." \
 *   RAILWAY_DB_PATH="./app.db" \
 *   EC2_DB_PATH="./users.db" \
 *   npx tsx scripts/migrate-to-postgres.ts
 *
 * This script:
 * 1. Reads users, connections, and pairings from Railway's SQLite (app.db)
 * 2. Reads user_tokens, user_preferences, daily_logs, generation_jobs from EC2's SQLite (users.db)
 * 3. Cross-references by telegramUserId to link EC2 data to Railway users
 * 4. Inserts everything into the unified PostgreSQL database
 * 5. Verifies row counts match
 */

import Database from "better-sqlite3";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const RAILWAY_DB_PATH = process.env.RAILWAY_DB_PATH || "./app.db";
const EC2_DB_PATH = process.env.EC2_DB_PATH || "./users.db";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

async function migrate() {
  console.log("==> Opening SQLite databases...");
  const railwayDb = new Database(RAILWAY_DB_PATH, { readonly: true });
  const ec2Db = new Database(EC2_DB_PATH, { readonly: true });

  // ── Step 1: Migrate Railway Users ──
  console.log("\n==> Migrating users from Railway...");
  const users = railwayDb.prepare("SELECT * FROM User").all() as any[];
  console.log(`   Found ${users.length} users`);

  for (const user of users) {
    await pool.query(
      `INSERT INTO "User" (id, email, "passwordHash", name, "createdAt")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, user.email, user.passwordHash, user.name, user.createdAt]
    );
  }

  // ── Step 2: Migrate Betterness Connections ──
  console.log("==> Migrating Betterness connections...");
  const connections = railwayDb.prepare("SELECT * FROM BetternessConnection").all() as any[];
  console.log(`   Found ${connections.length} connections`);

  for (const conn of connections) {
    await pool.query(
      `INSERT INTO "BetternessConnection" (id, "userId", "encryptedToken", "connectedAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [conn.id, conn.userId, conn.encryptedToken, conn.connectedAt]
    );
  }

  // ── Step 3: Migrate Telegram Pairings ──
  console.log("==> Migrating Telegram pairings...");
  const pairings = railwayDb.prepare("SELECT * FROM TelegramPairing").all() as any[];
  console.log(`   Found ${pairings.length} pairings`);

  for (const pairing of pairings) {
    await pool.query(
      `INSERT INTO "TelegramPairing" (id, "userId", "telegramUsername", "telegramUserId", "pairingCode", approved, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [pairing.id, pairing.userId, pairing.telegramUsername, pairing.telegramUserId,
       pairing.pairingCode, !!pairing.approved, pairing.createdAt]
    );
  }

  // ── Step 4: Build telegramUserId → userId lookup ──
  const telegramToUser: Record<string, string> = {};
  for (const pairing of pairings) {
    if (pairing.telegramUserId) {
      telegramToUser[pairing.telegramUserId] = pairing.userId;
    }
  }

  // Also check EC2's user_tokens for telegram usernames that map to pairings
  const ec2Tokens = ec2Db.prepare("SELECT * FROM user_tokens").all() as any[];
  for (const token of ec2Tokens) {
    if (token.telegram_username) {
      const matchingPairing = pairings.find(
        (p: any) => p.telegramUsername === token.telegram_username
      );
      if (matchingPairing && !telegramToUser[token.telegram_user_id]) {
        telegramToUser[token.telegram_user_id] = matchingPairing.userId;
      }
    }
  }

  console.log(`   Built lookup: ${Object.keys(telegramToUser).length} telegramUserId → userId mappings`);

  // ── Step 5: Migrate User Preferences ──
  console.log("==> Migrating user preferences from EC2...");
  let prefsTable: any[];
  try {
    prefsTable = ec2Db.prepare("SELECT * FROM user_preferences").all() as any[];
  } catch {
    prefsTable = [];
    console.log("   user_preferences table not found, skipping");
  }
  console.log(`   Found ${prefsTable.length} preference records`);

  for (const pref of prefsTable) {
    const userId = telegramToUser[pref.telegram_user_id] || "unknown";
    await pool.query(
      `INSERT INTO "UserPreferences" (id, "userId", "telegramUserId", timezone,
        "morningCheckinTime", "eveningCheckinTime", "checkinIntensity",
        "dndStart", "dndEnd", "onboardingComplete", "activeHabit",
        "habitStartDate", "lastVideoRefresh", "baselineWeekEnd",
        "lastMorningSent", "lastEveningSent", "lastWeeklySent",
        "lastUserMessage", "lastTemplateIdx", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT ("telegramUserId") DO NOTHING`,
      [
        userId, pref.telegram_user_id,
        pref.timezone || "America/New_York",
        pref.morning_checkin_time || "08:00",
        pref.evening_checkin_time || "21:00",
        pref.checkin_intensity || "normal",
        pref.dnd_start, pref.dnd_end,
        !!pref.onboarding_complete,
        pref.active_habit, pref.habit_start_date,
        pref.last_video_refresh, pref.baseline_week_end,
        pref.last_morning_sent, pref.last_evening_sent,
        pref.last_weekly_sent,
        pref.last_user_message ? new Date(pref.last_user_message) : null,
        pref.last_template_idx || 0,
        pref.created_at ? new Date(pref.created_at) : new Date(),
        pref.updated_at ? new Date(pref.updated_at) : new Date(),
      ]
    );
  }

  // ── Step 6: Migrate Daily Logs ──
  console.log("==> Migrating daily logs from EC2...");
  let dailyLogs: any[];
  try {
    dailyLogs = ec2Db.prepare("SELECT * FROM daily_logs").all() as any[];
  } catch {
    dailyLogs = [];
    console.log("   daily_logs table not found, skipping");
  }
  console.log(`   Found ${dailyLogs.length} daily log entries`);

  for (const log of dailyLogs) {
    const userId = telegramToUser[log.telegram_user_id] || "unknown";
    await pool.query(
      `INSERT INTO "DailyLog" ("userId", "telegramUserId", date, "checkinType",
        wellbeing, "moodLabel", "bodyStatus", "painLocation", "painSeverity",
        "sleepSelfReport", "expectedDayLoad", "didActiveHabit", "habitNotes",
        notes, "checkinTime")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT ("telegramUserId", date, "checkinType") DO NOTHING`,
      [
        userId, log.telegram_user_id, log.date,
        log.checkin_type || "morning",
        log.wellbeing, log.mood_label,
        log.body_status || "fine", log.pain_location,
        log.pain_severity, log.sleep_self_report,
        log.expected_day_load,
        log.did_active_habit != null ? !!log.did_active_habit : null,
        log.habit_notes, log.notes,
        log.checkin_time ? new Date(log.checkin_time) : new Date(),
      ]
    );
  }

  // ── Step 7: Migrate Generation Jobs ──
  console.log("==> Migrating generation jobs from EC2...");
  let genJobs: any[];
  try {
    genJobs = ec2Db.prepare("SELECT * FROM generation_jobs").all() as any[];
  } catch {
    genJobs = [];
    console.log("   generation_jobs table not found, skipping");
  }
  console.log(`   Found ${genJobs.length} generation jobs`);

  for (const job of genJobs) {
    const userId = telegramToUser[job.telegram_user_id] || "unknown";
    await pool.query(
      `INSERT INTO "GenerationJob" (id, "userId", "telegramUserId", mode, status,
        "videoPath", error, "createdAt", "completedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        job.job_id, userId, job.telegram_user_id || "unknown",
        job.mode, job.status,
        job.video_path, job.error,
        job.created_at ? new Date(job.created_at) : new Date(),
        job.completed_at ? new Date(job.completed_at) : null,
      ]
    );
  }

  // ── Step 8: Verify ──
  console.log("\n==> Verifying migration...");
  const counts = {
    users: (await pool.query(`SELECT COUNT(*) FROM "User"`)).rows[0].count,
    connections: (await pool.query(`SELECT COUNT(*) FROM "BetternessConnection"`)).rows[0].count,
    pairings: (await pool.query(`SELECT COUNT(*) FROM "TelegramPairing"`)).rows[0].count,
    preferences: (await pool.query(`SELECT COUNT(*) FROM "UserPreferences"`)).rows[0].count,
    dailyLogs: (await pool.query(`SELECT COUNT(*) FROM "DailyLog"`)).rows[0].count,
    generationJobs: (await pool.query(`SELECT COUNT(*) FROM "GenerationJob"`)).rows[0].count,
  };

  console.log("   PostgreSQL row counts:");
  console.log(`     Users:              ${counts.users} (source: ${users.length})`);
  console.log(`     BetternessConn:     ${counts.connections} (source: ${connections.length})`);
  console.log(`     TelegramPairings:   ${counts.pairings} (source: ${pairings.length})`);
  console.log(`     UserPreferences:    ${counts.preferences} (source: ${prefsTable.length})`);
  console.log(`     DailyLogs:          ${counts.dailyLogs} (source: ${dailyLogs.length})`);
  console.log(`     GenerationJobs:     ${counts.generationJobs} (source: ${genJobs.length})`);

  const allMatch =
    parseInt(counts.users) >= users.length &&
    parseInt(counts.connections) >= connections.length &&
    parseInt(counts.pairings) >= pairings.length;

  if (allMatch) {
    console.log("\n==> Migration completed successfully!");
  } else {
    console.error("\n==> WARNING: Some row counts don't match. Review the output above.");
  }

  railwayDb.close();
  ec2Db.close();
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
