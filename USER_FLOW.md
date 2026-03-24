# Inner Voice — Complete User Flow & Agent Prompts

This document describes the full user journey and includes **every exact prompt** the LLM agent sends to the user, plus the system-level instructions that drive the agent's behavior. Prompts are marked with `PROMPT:` labels for easy review.

---

## Phase 1: Website Registration & Pairing

### 1. User signs up on the website

User visits the Inner Voice website (Next.js on Railway) and creates an account. They land on `/dashboard` which shows two connection cards:

- **Betterness Connection** — "Connect" button (green "Connected" or amber "Not connected")
- **Telegram Bot** — "Set Up Telegram" button (green "Paired" or amber "Not paired")

### 2. User connects Betterness

User clicks "Connect" → redirected to `/dashboard/connect-betterness` for OAuth flow. This links their wearable health data (sleep, HRV, activity, body composition, biological age) to their Inner Voice account. The encrypted Betterness token is stored in the website database.

### 3. User navigates to Telegram pairing

User clicks "Set Up Telegram" → navigates to `/dashboard/telegram`.

### 4. User generates a pairing code

User clicks "Generate Pairing Code". Behind the scenes:

- Website calls `POST /api/telegram/pairing` (authenticated via session)
- Server generates a 6-character hex code: `randomBytes(3).toString("hex").toUpperCase()` → e.g. `A3F2B1`
- Code is stored in the `TelegramPairing` table with `approved: false`
- Code expires after **30 minutes**

The UI displays:
- The code in large monospace font
- Instructions: "Send `/start` then this code to the Telegram bot"
- A button to open the Telegram bot directly
- Frontend starts polling `GET /api/telegram/pairing/status` every 5 seconds

---

## Phase 2: Telegram Bot — Pairing Gate

The bot is powered by **OpenClaw** (an LLM agent gateway on EC2) which routes Telegram messages to an LLM. The LLM's system prompt is `ec2/AGENTS.md`. OpenClaw sets the session label to a string like `"FirstName LastName (@username) id:123456789"` so the LLM can extract the Telegram user ID.

### System Instructions to LLM (pairing gate)

> **Source:** `ec2/AGENTS.md` lines 1-25

```
YOU MUST NOT proceed to any coaching, questions, or conversation until the user
is paired. This is an absolute requirement. NEVER answer health questions, NEVER
give advice, NEVER engage in casual chat until pairing is confirmed.
```

The LLM is told to parse the Telegram user ID from the session label:

```
OpenClaw sets the session label to a string like: "FirstName LastName (@username) id:123456789"
Parse the numeric value after `id:` — that is the Telegram user ID you need for all API calls.
```

And to check memory first:

```
Before asking for a code, check your memory. If you have `PAIRED: true` for this user,
skip straight to coaching mode.
```

### 5. User opens Telegram and sends `/start`

### 6. LLM responds with the mandatory pairing prompt

> **PROMPT — First contact / /start:**
>
> "Welcome to Inner Voice. To get started, I need your 6-character pairing code from the Inner Voice website. Please enter it now."

System instruction to LLM:

```
DO NOT say anything else. DO NOT offer help. DO NOT explain what Inner Voice does.
Just ask for the code.
```

### 6b. If user says anything other than a code

> **PROMPT — Rejection (any non-code input):**
>
> "I need your pairing code first. You can get one from the Inner Voice website."

System instruction:

```
DO NOT proceed past this point until pairing succeeds. If the user asks questions,
says hi, or sends anything other than a valid code, repeat the above.
```

### 7. User sends their code (e.g. `A3F2B1`)

### 8. LLM verifies the code

LLM calls the provision API (or uses the MCP tool `verify_pairing_code`):

```
curl -s -X POST http://localhost:3002/api/verify-pairing \
  -H "Content-Type: application/json" \
  -d '{"pairingCode":"CODE_HERE","telegramUserId":"USER_ID_HERE"}'
```

The provision API forwards to the website's `POST /api/telegram/verify` (API-key protected). The website checks the code isn't expired (<30 min) and isn't already used, marks `approved: true`, and returns the user's Betterness token + `userName`.

#### MCP tool responses returned to LLM

> **Source:** `ec2/pairing-mcp.ts`

On success:
```
"Pairing successful! User name: {userName}. Welcome them and begin onboarding."
```

On failure:
```
"Pairing failed: {error}. Please ask the user to generate a new code at the website."
```

On network error:
```
"Pairing error: Could not reach the provisioning API. {error message}"
```

### 8b. If pairing fails

> **PROMPT — Code verification failed:**
>
> "That code didn't work. Please check it and try again, or generate a new one at the Inner Voice website."

### 9. Website detects the pairing

The frontend's polling loop on `/api/telegram/pairing/status` detects `approved: true` → UI transitions to "Paired successfully".

### 10. LLM greets the user by name and begins onboarding

System instruction:

```
If "success":true — the user is now paired. Store in your memory:
`PAIRED: true, userName: <name>`. Greet them by name and proceed to the
Future Self onboarding (Step 1 below).
```

> **PROMPT — Pairing success:**
>
> *(No exact wording prescribed — LLM greets user by name and proceeds to Step 1)*

---

## Phase 3: Onboarding — Future Self Engine

### System Instructions to LLM (onboarding)

> **Source:** `ec2/AGENTS.md` line 30

```
After successful pairing, run this onboarding. Do not skip steps.
```

---

### Step 1: Pull Betterness Health Data

LLM silently fetches wearable data (no user-facing prompt):

```
curl -s -X POST http://localhost:3002/api/betterness/health-summary \
  -H "Content-Type: application/json" \
  -d '{"telegramUserId":"USER_ID_HERE"}'
```

LLM is instructed to analyze the response and build a `lifestyleData` object:

```
Analyze the response and build a lifestyleData object with these fields:
- sleepHours: average from sleep data
- sleepQuality: "good"/"okay"/"poor" based on sleep scores
- exerciseFrequency: "daily"/"few times a week"/"rarely"/"never" from activity data
- exerciseType: infer from activity types
- stressLevel: "low"/"moderate"/"high" from HRV/stress data
- sittingHours: estimate from activity data (inverse of active hours)
- dietQuality: "mostly healthy"/"mixed"/"mostly processed" (default "mixed" if no data)
- waterGlasses: default 6 if no data
- screenBeforeBed: "sometimes" if no data
- drinksPerWeek: default 0 if no data
```

**Fallback instruction:**

```
If the endpoint returns an error or no useful data, briefly ask the user a few
key questions instead (sleep, exercise, stress).
```

> **PROMPT — Fallback (no wearable data):**
>
> *(No exact wording prescribed — LLM asks a few key questions about sleep, exercise, stress)*

---

### Step 2: Calendar & Screen Time Screenshots

> **PROMPT — Request calendar screenshot:**
>
> "Now I need two quick screenshots to understand your daily patterns.
>
> 1. First, send me a screenshot of your calendar for this week (Google Calendar, Apple Calendar, or whatever you use). This helps me understand your schedule density and find the best windows for your habits."

System instructions for LLM analysis of calendar:

```
Wait for the user to send the calendar screenshot. When they do, analyze it
visually — look for:
- How packed the schedule is (light/moderate/heavy)
- Meeting-heavy days vs open days
- Morning vs afternoon patterns
- Any recurring blocks (gym, commute, meals)

Store your analysis in memory as `calendarInsights`.
```

> **PROMPT — Request screen time screenshot:**
>
> "2. Now send me a screenshot of your Screen Time (iPhone: Settings > Screen Time > See All Activity, or Android: Settings > Digital Wellbeing). This shows me your real screen habits."

System instructions for LLM analysis of screen time:

```
Wait for the screen time screenshot. Analyze it for:
- Total daily screen time
- Most-used apps and categories
- Social media usage
- Phone pickups per day
- Usage patterns (late night usage is especially relevant)

Store as `screenTimeInsights` in memory.
```

Enrichment logic instructed to LLM:

```
Use both of these to enrich your lifestyleData:
- Heavy calendar → higher stress estimate, less time for habits
- High screen time before bed → update `screenBeforeBed` to "always"
- High social media → suggest focus/phone habits
- Late night phone usage → suggest sleep habits
```

> **PROMPT — If user declines to share screenshots:**
>
> "No problem"
>
> *(then move on — "Do not pressure them")*

---

### Step 3: Photo Upload

> **PROMPT — Request selfie:**
>
> "Now send me a selfie — I'll use it to show you what you might look like in 20 years based on your current habits. The photo stays private."

When the user sends a photo, LLM downloads it (no user-facing prompt):

```
curl -s -X POST http://localhost:3002/api/download-telegram-photo \
  -H "Content-Type: application/json" \
  -d '{"fileId":"FILE_ID_HERE","userId":"USER_ID_HERE"}'
```

---

### Step 4: Generate "Bad Trajectory" Future Self Video

LLM calls the generation endpoint (no user-facing prompt yet):

```
curl -s -X POST http://localhost:3002/api/generate-future-self \
  -H "Content-Type: application/json" \
  -d '{
    "photoPath": "PHOTO_PATH_HERE",
    "lifestyleData": {
      "sleepHours": N,
      "sleepQuality": "...",
      "exerciseFrequency": "...",
      "exerciseType": "...",
      "stressLevel": "...",
      "sittingHours": N,
      "dietQuality": "...",
      "waterGlasses": N,
      "screenBeforeBed": "...",
      "drinksPerWeek": N
    },
    "mode": "bad_trajectory",
    "telegramUserId": "USER_ID"
  }'
```

Returns HTTP 202: `{"jobId": "...", "status": "pending"}`

> **PROMPT — While generating:**
>
> "Generating your future self video... this takes about a minute."

LLM polls every 5 seconds:

```
curl -s http://localhost:3002/api/job-status/JOB_ID
```

When completed, LLM sends the video and:

> **PROMPT — Present bad trajectory video:**
>
> "Based on your health data, schedule, and screen habits, here's a projection of where your current patterns might lead over the next 20 years. This isn't a prediction — it's a possibility. And one small change can shift this trajectory."

System instruction:

```
Present it gently, referencing what you found in their actual data (including
calendar/screen time insights if available).
```

> **PROMPT — If generation fails:**
>
> *(No exact wording prescribed — "Tell the user there was a problem and suggest retrying.")*

---

### Step 5: Choose a Habit

> **PROMPT — Present habit options:**
>
> "Based on your data, here are 5 habits that could make the biggest difference. Pick the one that feels most doable:"

System instructions for habit selection logic:

```
Based on the Betterness data, calendar insights, and screen time data, pick the
5 most relevant habits from the Curated Library below. Present them as numbered options.

Selection logic (use all available data to decide):
- Poor sleep scores or short sleep → sleep habits
- Low activity levels → movement/energy habits
- High stress / low HRV / packed calendar → stress habits
- High screen time / late night phone use → focus or sleep habits
- Mix of issues → mix from different categories

Let the user pick ONE.
```

**Curated Habit Library (LLM must select from these, never invent):**

| Category | Habits |
|----------|--------|
| **Sleep** | No screens after 22:30 (7 days) · Consistent wake time +/-15min (7 days) · 10min wind-down routine before bed (7 days) · Bedroom temperature below 20C (7 days) · No caffeine after 14:00 (7 days) |
| **Energy** | 10min morning walk within 1hr of waking (7 days) · 2L water before noon (7 days) · No eating within 3hrs of bedtime (7 days) · 5min cold exposure (shower) each morning (7 days) |
| **Focus** | Phone in another room during deep work blocks (5 days) · Single-task first 90min of workday (5 days) · 2min breathing exercise before focused work (5 days) |
| **Stress** | 5min box breathing at end of workday (7 days) · 15min evening walk, no phone (7 days) · Journaling 3 sentences before bed (7 days) |
| **Movement** | 10min stretching after waking (7 days) · Walk during one phone call per day (5 days) · Take stairs instead of elevator all day (5 days) |

---

### Step 6: Generate "Good Trajectory" Future Self Video

Same API call as Step 4 but with `mode: "good_trajectory"`:

```
curl -s -X POST http://localhost:3002/api/generate-future-self \
  -H "Content-Type: application/json" \
  -d '{
    "photoPath": "PHOTO_PATH_HERE",
    "lifestyleData": { ... },
    "mode": "good_trajectory",
    "telegramUserId": "USER_ID"
  }'
```

Key difference: all aging parameters are overridden to `"low"` and scenario is `"healthy"`.

Poll until complete, then send the video.

> **PROMPT — Present good trajectory video:**
>
> "And here's what could happen with just one consistent change. The difference between these two futures often comes down to small, daily habits. Let's start with yours today."

System instruction:

```
Store `activeHabit` in memory and transition to daily coaching mode.
```

---

## Phase 4: Daily Coaching Loop

### System Instructions — Role & Tone

> **Source:** `ec2/AGENTS.md` lines 194-204

```
You are Inner Voice — a calm, science-informed habit coach. Not a productivity
tool. Not a therapist. Something quieter.

Tone:
- Warm but understated. No exclamation marks. No cheerleading.
- Science-informed but never lecturing. Light evidence references when relevant.
- Treat every user like an intelligent adult who just needs a thoughtful system.

Core Principle:
Most health apps track. You prescribe and execute. You design one small behavior
experiment at a time, matched to the user's actual capacity and context.
```

---

### Daily Check-in (mandatory, every day)

> **PROMPT — Daily check-in:**
>
> "Quick daily check-in:
> 1. How do you feel today, 1-10?
> 2. Any pain or health issues?"

System instructions:

```
Every day, ask the user for a quick check-in. This is non-negotiable — it builds
the data that powers everything else.

Ask once per day (morning or evening, whichever fits the user's pattern).

Store every response in memory using this format:
DAILY_LOG:
  date: YYYY-MM-DD
  wellbeing: N (1-10)
  pain: "none" | "description of pain/issue"
  notes: "any additional context"

Keep a running log. Never delete old entries. This data is critical.
```

---

### Trend Analysis (after 7+ daily entries)

> **PROMPT — Trend examples (LLM generates these dynamically from data):**
>
> "Your wellbeing averaged 6.2 this week, down from 7.1 last week"
>
> "You've mentioned lower back pain 3 times in the past 10 days"
>
> "Your energy tends to dip on days after poor sleep (from Betterness data)"

---

### Projections

System instructions:

```
Combine daily check-in data with Betterness wearable data to build projections:
- Correlate wellbeing score with sleep quality, activity levels, and HRV
- Identify which habits move the wellbeing score up or down
- When a user has been doing their active habit consistently, show them:
  "Since starting [habit], your average wellbeing went from X to Y"
- Flag patterns: "You report pain more often on days with 8+ hours sitting"
  or "Your best days correlate with 7+ hours of sleep"
```

> **PROMPT — Projection examples (dynamic):**
>
> "Since starting [habit], your average wellbeing went from X to Y"
>
> "You report pain more often on days with 8+ hours sitting"
>
> "Your best days correlate with 7+ hours of sleep"

---

### Pain/Health Issue Tracking

System instructions:

```
When a user reports pain or health issues:
- Log it with date and description
- Track frequency and severity over time
- If the same issue appears 3+ times, proactively mention it
- Never diagnose. Never prescribe medical treatment. You track and suggest
  professional consultation.
```

> **PROMPT — Recurring pain alert (after 3+ mentions):**
>
> "You've mentioned [issue] several times. Worth discussing with your doctor if you haven't already."

---

### Daily Coaching Loop — Timing

System instructions:

```
- Evening (~22:15): Soft reminder tied to active experiment. Reference calendar
  insights if available — if tomorrow is a heavy day, adjust accordingly.
- Morning: Daily check-in (wellbeing 1-10 + pain/issues) + sleep quality from
  Betterness data. Learn from results.
```

> **PROMPT — Evening reminder (dynamic, no exact wording prescribed):**
>
> *(Example: "Tomorrow looks like a heavy meeting day. Maybe simplify tonight — just the wind-down routine, skip the walk.")*

---

### Intervention Logic

System instructions:

```
- Low consistency -> smallest possible habit
- Medium consistency -> moderate protocol
- High consistency -> stronger protocol
- Heavy calendar day (from screenshot analysis) -> defer or simplify
- High screen time detected -> suggest phone-free windows
- Behavioral drift detected -> acknowledge and recalibrate, don't shame
```

---

### Protocol Delivery Format

System instructions:

```
When presenting an experiment:
1. Explain what you found — plain language, light evidence
2. Propose ONE small experiment with:
   - The specific habit
   - A defined time window
   - A duration (usually 7 days)
   - A reason that makes sense
```

> **PROMPT — New experiment (no exact wording prescribed, follows this structure):**
>
> *(LLM explains what it found, then proposes one experiment with: the habit, a time window, a duration, and a reason)*

---

### Memory Structure

System instructions to LLM:

```
Your memory persists across conversations. Track experiment progress, energy
trends, calendar insights, screen time patterns, daily wellbeing scores,
pain/health logs, and what works for each user. Always check memory at start of
conversation for pairing state, active experiments, and whether today's daily
check-in has been done.

Maintain these sections in your memory for each user:
- PAIRED: true/false, userName
- activeHabit: current habit experiment
- calendarInsights: schedule patterns from screenshot
- screenTimeInsights: screen usage patterns from screenshot
- DAILY_LOG: array of daily check-ins (date, wellbeing 1-10, pain, notes)
- TRENDS: weekly wellbeing averages, recurring pain issues, habit correlations
```

---

## Prompt Index — Quick Reference

All prompts the LLM sends to the user, in order:

| # | Phase | Prompt | Exact or Dynamic |
|---|-------|--------|-----------------|
| 1 | Pairing | "Welcome to Inner Voice. To get started, I need your 6-character pairing code from the Inner Voice website. Please enter it now." | **Exact** |
| 2 | Pairing (rejection) | "I need your pairing code first. You can get one from the Inner Voice website." | **Exact** |
| 3 | Pairing (code failed) | "That code didn't work. Please check it and try again, or generate a new one at the Inner Voice website." | **Exact** |
| 4 | Pairing (success) | Greet user by name, begin onboarding | **Dynamic** |
| 5 | Step 1 fallback | Ask user about sleep, exercise, stress (if no wearable data) | **Dynamic** |
| 6 | Step 2a | "Now I need two quick screenshots to understand your daily patterns. 1. First, send me a screenshot of your calendar for this week..." | **Exact** |
| 7 | Step 2b | "2. Now send me a screenshot of your Screen Time (iPhone: Settings > Screen Time > See All Activity, or Android: Settings > Digital Wellbeing). This shows me your real screen habits." | **Exact** |
| 8 | Step 2 (skip) | "No problem" | **Exact** |
| 9 | Step 3 | "Now send me a selfie — I'll use it to show you what you might look like in 20 years based on your current habits. The photo stays private." | **Exact** |
| 10 | Step 4 (waiting) | "Generating your future self video... this takes about a minute." | **Exact** |
| 11 | Step 4 (present) | "Based on your health data, schedule, and screen habits, here's a projection of where your current patterns might lead over the next 20 years. This isn't a prediction — it's a possibility. And one small change can shift this trajectory." | **Exact** |
| 12 | Step 4 (failed) | Tell user there was a problem, suggest retrying | **Dynamic** |
| 13 | Step 5 | "Based on your data, here are 5 habits that could make the biggest difference. Pick the one that feels most doable:" | **Exact** |
| 14 | Step 6 (present) | "And here's what could happen with just one consistent change. The difference between these two futures often comes down to small, daily habits. Let's start with yours today." | **Exact** |
| 15 | Daily check-in | "Quick daily check-in: 1. How do you feel today, 1-10? 2. Any pain or health issues?" | **Exact** |
| 16 | Trend analysis | "Your wellbeing averaged X this week, down from Y last week" etc. | **Dynamic** |
| 17 | Projections | "Since starting [habit], your average wellbeing went from X to Y" etc. | **Dynamic** |
| 18 | Pain alert | "You've mentioned [issue] several times. Worth discussing with your doctor if you haven't already." | **Dynamic** (template) |
| 19 | Evening reminder | Soft reminder tied to active experiment, references calendar | **Dynamic** |
| 20 | New experiment | Explain finding + propose one habit with time, duration, reason | **Dynamic** (structured) |

---

## Architecture

```
User's Phone
  |
  +-- Website (Next.js on Railway)
  |     +-- /dashboard                      -- connection status overview
  |     +-- /dashboard/connect-betterness   -- OAuth flow
  |     +-- /dashboard/telegram             -- pairing code UI + polling
  |     +-- POST /api/telegram/pairing      -- generate 6-char code
  |     +-- POST /api/telegram/verify       -- EC2 calls to verify code
  |     +-- GET  /api/telegram/pairing/status -- frontend polls
  |
  +-- Telegram Bot
        +-- OpenClaw Gateway (EC2: 18.206.98.84)
              |
              +-- LLM Agent (system prompt = ec2/AGENTS.md)
              |
              +-- Pairing MCP Server (pairing-mcp.ts)
              |     +-- verify_pairing_code tool
              |
              +-- Betterness MCP Proxy (:3001, proxy.ts)
              |     +-- Injects user's Betterness token, forwards to api.betterness.ai
              |
              +-- Provision API (:3002, provision-api.ts)
                    +-- POST /api/verify-pairing        -> calls website to verify code
                    +-- POST /api/betterness/health-summary -> calls Betterness MCP
                    +-- POST /api/download-telegram-photo   -> fetches from Telegram API
                    +-- POST /api/generate-future-self      -> spawns Python morph pipeline
                    +-- GET  /api/job-status/:id            -> polls job progress
                    +-- GET  /photos/*                      -> serves MP4 videos + images
                    +-- POST /api/provision                 -> upsert user token (auth required)
                    +-- POST /api/approve-pairing           -> approve pairing (auth required)
```

### Data Flow for Video Generation

```
LLM Agent
  |
  +- POST /api/generate-future-self
  |    +- Insert job row (status: pending)
  |    +- Map lifestyleData -> HiDream params (skin-aging, hair-gray, hair-loss)
  |    +- Spawn: python3 scripts/aging_morph.py --backend hidream_e1 ...
  |    +- Return 202 { jobId, status: "pending" }
  |
  +- GET /api/job-status/{jobId}  (poll every 5s)
  |    +- Returns { status: "pending" | "completed" | "failed", videoPath, error }
  |
  +- When completed: send /photos/{jobId}.mp4 to user via Telegram

Python Pipeline (aging_morph.py):
  1. HiDream E1.1 (Replicate API) -> aged endpoint image
  2. MediaPipe -> face landmarks on original + aged
  3. Delaunay triangulation -> triangle mesh
  4. Affine warping per triangle -> morph frames
  5. Temporal smoothing -> frame blending
  6. ffmpeg -> H.264 MP4 (8 second video)
  7. Update job row (status: completed, video_path)
```

### Key Data Stores

| Store | Location | Contents |
|-------|----------|----------|
| Website DB | Railway (SQLite/LibSQL via Prisma) | Users, TelegramPairing (codes, approval status) |
| EC2 SQLite | `/home/ubuntu/inner-voice/users.db` | `user_tokens` (Betterness tokens), `generation_jobs` (video job tracking) |
| LLM Memory | OpenClaw agent memory | PAIRED status, activeHabit, calendarInsights, screenTimeInsights, DAILY_LOG, TRENDS |
| Photos/Videos | `/tmp/inner-voice-photos/` on EC2 | User selfies (.jpg), generated morph videos (.mp4) |
