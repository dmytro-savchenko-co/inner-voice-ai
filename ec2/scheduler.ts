import pg from "pg";

const API_BASE = "http://localhost:3002";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TICK_INTERVAL_MS = 60_000; // 1 minute

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

interface UserPrefs {
  telegramUserId: string;
  timezone: string;
  morningCheckinTime: string;
  eveningCheckinTime: string;
  checkinIntensity: string;
  dndStart: string | null;
  dndEnd: string | null;
  onboardingComplete: boolean;
  activeHabit: string | null;
  habitStartDate: string | null;
  lastMorningSent: string | null;
  lastEveningSent: string | null;
  lastWeeklySent: string | null;
  lastUserMessage: string | null;
  lastTemplateIdx: number;
}

// ── Message templates ──

const MORNING_TEMPLATES = [
  (habit: string) =>
    `Good morning. Quick check-in before the day gets going:\n\n1. How do you feel today, 1-10?\n2. Any body aches or issues?\n3. What does today's load look like — light, moderate, or heavy?`,
  (habit: string) =>
    `Morning. Let's get a quick read on where you're at:\n\n1. Wellbeing, 1-10?\n2. How's the body — anything off?\n3. Expecting a light day, packed day, or somewhere in between?`,
  (habit: string) =>
    `Hey, new day. Three quick ones:\n\n1. Energy level, 1-10?\n2. Body check — all good, or something to note?\n3. How's the schedule looking today?`,
  (habit: string) =>
    `Rise and check in:\n\n1. Overall feeling right now, 1-10?\n2. Any pain or discomfort?\n3. What kind of day are you heading into?`,
  (habit: string) =>
    `Good morning. Before things pick up:\n\n1. Rate how you feel, 1-10.\n2. Anything going on physically?\n3. Light, moderate, or heavy day ahead?`,
];

const EVENING_TEMPLATES = [
  (habit: string) =>
    `Evening check-in. Did you get to "${habit}" today?\n\nYes / Partly / No\n\nAnything you want to note about today?`,
  (habit: string) =>
    `End of day. How did "${habit}" go?\n\nYes / Partly / No\n\nAny reflections?`,
  (habit: string) =>
    `Wrapping up. Quick one — did "${habit}" happen today?\n\nYes / Partly / No`,
  (habit: string) =>
    `Day's winding down. "${habit}" — did you get to it?\n\nYes / Partly / No\n\nHow are you feeling tonight?`,
  (habit: string) =>
    `Evening. Checking in on "${habit}".\n\nDid it happen? Yes / Partly / No`,
];

const REENGAGEMENT_24H = [
  `Haven't heard from you today. No pressure — just checking in. How are things?`,
  `Quick nudge. How's today going?`,
  `Just a gentle ping. Everything alright?`,
];

const REENGAGEMENT_72H = [
  `It's been a few days. Hope things are going well. Ready to pick back up whenever you are.`,
  `Been a bit. No judgment — life happens. Send a message when you're ready.`,
];

const REENGAGEMENT_7D = [
  `It's been about a week. Want to pick up where we left off, adjust your habit, or start fresh? All good options.`,
  `A week since we last connected. Want to recalibrate, or keep the current plan?`,
];

function getWeeklyInsight(currentAvg: number | null, prevAvg: number | null): string {
  if (currentAvg == null) return "Not enough data for a trend yet.";
  if (prevAvg == null) return `Average wellbeing this week: ${currentAvg}. Building your baseline.`;
  const diff = currentAvg - prevAvg;
  if (diff > 0.5) return "Upward trend. Whatever you're doing is working.";
  if (diff < -0.5) return "Slight dip this week. Worth looking at what changed.";
  return "Holding steady. Consistency is the goal.";
}

// ── Helpers ──

function getUserLocalTime(timezone: string): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "0";
  return new Date(
    parseInt(get("year")),
    parseInt(get("month")) - 1,
    parseInt(get("day")),
    parseInt(get("hour")),
    parseInt(get("minute"))
  );
}

function timeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isWithinWindow(current: string, target: string, marginMinutes: number = 5): boolean {
  const [ch, cm] = current.split(":").map(Number);
  const [th, tm] = target.split(":").map(Number);
  const currentMin = ch * 60 + cm;
  const targetMin = th * 60 + tm;
  return Math.abs(currentMin - targetMin) <= marginMinutes;
}

function isInDnd(current: string, dndStart: string | null, dndEnd: string | null): boolean {
  if (!dndStart || !dndEnd) return false;
  const [ch, cm] = current.split(":").map(Number);
  const [sh, sm] = dndStart.split(":").map(Number);
  const [eh, em] = dndEnd.split(":").map(Number);
  const c = ch * 60 + cm;
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s <= e) return c >= s && c <= e;
  return c >= s || c <= e; // overnight DND
}

function hoursSince(isoDate: string | null): number {
  if (!isoDate) return Infinity;
  return (Date.now() - new Date(isoDate).getTime()) / 3_600_000;
}

async function sendMessage(telegramUserId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/send-telegram-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramUserId, text }),
    });
    const data = await res.json() as any;
    if (data.ok) {
      console.log(`[scheduler] Sent message to ${telegramUserId}`);
      return true;
    }
    console.error(`[scheduler] Telegram API error for ${telegramUserId}:`, data.description);
    return false;
  } catch (err) {
    console.error(`[scheduler] Send failed for ${telegramUserId}:`, err);
    return false;
  }
}

async function updatePreferences(telegramUserId: string, updates: Record<string, any>): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/user-preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramUserId, ...updates }),
    });
  } catch (err) {
    console.error(`[scheduler] Failed to update prefs for ${telegramUserId}:`, err);
  }
}

async function getWeeklySummary(userId: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/daily-log/${userId}/trends`);
    const data = await res.json() as any;
    const weeks = data.weeklyAverages || [];
    const currentWeek = weeks[weeks.length - 1];
    const prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;

    const insight = getWeeklyInsight(
      currentWeek?.avgWellbeing ?? null,
      prevWeek?.avgWellbeing ?? null
    );

    let summary = `Weekly summary:\n\n`;
    if (currentWeek) {
      summary += `• Average wellbeing: ${currentWeek.avgWellbeing}/10\n`;
      if (currentWeek.habitRate != null) summary += `• Habit completion: ${currentWeek.habitRate}%\n`;
    }
    if (data.currentStreak > 0) summary += `• Current streak: ${data.currentStreak} days\n`;
    if (data.recurringPain?.length > 0) {
      const top = data.recurringPain[0];
      summary += `• Recurring pain: ${top.location} (${top.occurrences} mentions)\n`;
    }
    summary += `\n${insight}`;
    return summary;
  } catch {
    return "";
  }
}

// ── Main loop ──

async function tick() {
  let users: UserPrefs[];
  try {
    const result = await pool.query(
      `SELECT "telegramUserId", timezone, "morningCheckinTime", "eveningCheckinTime",
              "checkinIntensity", "dndStart", "dndEnd", "onboardingComplete",
              "activeHabit", "habitStartDate", "lastMorningSent", "lastEveningSent",
              "lastWeeklySent", "lastUserMessage", "lastTemplateIdx"
       FROM "UserPreferences" WHERE "onboardingComplete" = true`
    );
    users = result.rows as UserPrefs[];
  } catch {
    return; // table may not exist yet
  }

  for (const user of users) {
    try {
      const localTime = getUserLocalTime(user.timezone);
      const now = timeStr(localTime);
      const today = dateStr(localTime);
      const dayOfWeek = localTime.getDay(); // 0=Sun

      if (isInDnd(now, user.dndStart, user.dndEnd)) continue;

      const templateIdx = user.lastTemplateIdx || 0;
      const habit = user.activeHabit || "your habit";

      // Morning check-in
      if (
        isWithinWindow(now, user.morningCheckinTime) &&
        user.lastMorningSent !== today
      ) {
        const template = MORNING_TEMPLATES[templateIdx % MORNING_TEMPLATES.length];
        if (await sendMessage(user.telegramUserId, template(habit))) {
          await updatePreferences(user.telegramUserId, {
            lastMorningSent: today,
            lastTemplateIdx: (templateIdx + 1) % MORNING_TEMPLATES.length,
          });
        }
        continue;
      }

      // Evening check-in (2-4x/week: Mon, Wed, Fri, optionally Sun)
      const eveningDays = [1, 3, 5]; // Mon, Wed, Fri
      if (user.checkinIntensity === "high") eveningDays.push(0); // also Sunday
      if (
        eveningDays.includes(dayOfWeek) &&
        isWithinWindow(now, user.eveningCheckinTime) &&
        user.lastEveningSent !== today
      ) {
        // If morning was sent but user didn't respond, make it a combined check-in
        const lastMsgStr = user.lastUserMessage ? new Date(user.lastUserMessage).toISOString() : null;
        const hadMorningResponse =
          lastMsgStr && lastMsgStr >= today + "T00:00:00";
        let template;
        if (user.lastMorningSent === today && !hadMorningResponse) {
          template = (_h: string) =>
            `Evening. Looks like the morning check-in slipped by — no worries.\n\n1. How did you feel today, 1-10?\n2. Any body issues?\n3. Did "${habit}" happen? Yes / Partly / No`;
        } else {
          template = EVENING_TEMPLATES[templateIdx % EVENING_TEMPLATES.length];
        }
        if (await sendMessage(user.telegramUserId, template(habit))) {
          await updatePreferences(user.telegramUserId, {
            lastEveningSent: today,
            lastTemplateIdx: (templateIdx + 1) % EVENING_TEMPLATES.length,
          });
        }
        continue;
      }

      // Weekly summary (Sunday at morning check-in time)
      if (
        dayOfWeek === 0 &&
        isWithinWindow(now, user.morningCheckinTime) &&
        user.lastWeeklySent !== today
      ) {
        const summary = await getWeeklySummary(user.telegramUserId);
        if (summary && await sendMessage(user.telegramUserId, summary)) {
          await updatePreferences(user.telegramUserId, { lastWeeklySent: today });
        }
        continue;
      }

      // Re-engagement checks (only during reasonable hours 9-20)
      const hour = localTime.getHours();
      if (hour >= 9 && hour <= 20) {
        const lastMsgStr = user.lastUserMessage ? new Date(user.lastUserMessage).toISOString() : null;
        const silenceHours = hoursSince(lastMsgStr);
        if (silenceHours >= 168) {
          // 7+ days — silence, stop messaging
          continue;
        } else if (silenceHours >= 72 && silenceHours < 168) {
          if (user.lastEveningSent && hoursSince(user.lastEveningSent) < 48) continue;
          if (silenceHours >= 168 - 24) {
            const msg = REENGAGEMENT_7D[templateIdx % REENGAGEMENT_7D.length];
            await sendMessage(user.telegramUserId, msg);
            await updatePreferences(user.telegramUserId, {
              lastEveningSent: today,
              lastTemplateIdx: (templateIdx + 1),
            });
          } else {
            const msg = REENGAGEMENT_72H[templateIdx % REENGAGEMENT_72H.length];
            await sendMessage(user.telegramUserId, msg);
            await updatePreferences(user.telegramUserId, {
              lastEveningSent: today,
              lastTemplateIdx: (templateIdx + 1),
            });
          }
        } else if (silenceHours >= 24 && silenceHours < 72) {
          if (user.lastEveningSent === today || user.lastMorningSent === today) continue;
          const msg = REENGAGEMENT_24H[templateIdx % REENGAGEMENT_24H.length];
          await sendMessage(user.telegramUserId, msg);
          await updatePreferences(user.telegramUserId, {
            lastEveningSent: today,
            lastTemplateIdx: (templateIdx + 1),
          });
        }
      }
    } catch (err) {
      console.error(`[scheduler] Error processing user ${user.telegramUserId}:`, err);
    }
  }
}

// ── Start ──

console.log("[scheduler] Starting proactive message scheduler (60s tick)...");
tick(); // run immediately
setInterval(tick, TICK_INTERVAL_MS);
