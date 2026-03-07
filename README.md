# Inner Voice AI

AI-powered longevity and habit coaching agent delivered through Telegram. Combines wearable health data (via [Betterness](https://betterness.ai)) with behavioral science to prescribe personalized micro-experiments.

## How It Works

1. **User signs up** on the web dashboard (Next.js)
2. **Connects Betterness** account to sync wearable data (Apple Health, Oura, Whoop, etc.)
3. **Pairs Telegram bot** using a 6-character code
4. **Onboarding**: Agent pulls health data, asks for selfie + calendar/screen time screenshots, generates AI-aged "future self" image showing trajectory of current habits
5. **Daily coaching**: Agent prescribes one small habit experiment at a time, checks in daily (wellbeing 1-10 + pain tracking), builds trends and projections

## Architecture

```
User (Telegram) --> OpenClaw Gateway (EC2)
                        |
                        v
                   Provision API (EC2 :3002)
                        |
                   +----+----+
                   |         |
            Betterness    Replicate
            MCP API       (face aging)

User (Browser) --> Next.js App (Railway/Vercel)
                        |
                        v
                   SQLite/LibSQL DB
```

- **Web App** (`src/`): Next.js 15 with auth, Betterness token management, Telegram pairing
- **Agent** (`ec2/AGENTS.md`): System prompt for the AI coaching agent (deployed as OpenClaw BOOTSTRAP.md)
- **Provision API** (`ec2/provision-api.ts`): Backend for pairing verification, Betterness data proxy, photo processing
- **Image Gen** (`ec2/image-gen.ts`): Replicate SAM face aging + Canvas comparison cards

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [OpenClaw](https://openclaw.ai/) installed on your server
- A Telegram bot (create via [@BotFather](https://t.me/BotFather))
- [Betterness](https://betterness.ai) API access
- [Replicate](https://replicate.com) account (for face aging, ~$0.004/run)

## Setup

### Web App (Next.js)

```bash
npm install
cp .env.example .env
# Edit .env with your values
npx prisma generate
npx prisma db push
npm run dev
```

### EC2 Agent Server

```bash
cd ec2
npm install

# Set environment variables
export EC2_API_KEY="your-shared-secret"
export TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
export REPLICATE_API_TOKEN="your-replicate-token"
export BETTERNESS_MCP_URL="https://api.betterness.ai/mcp"

# Start provision API
npx tsx provision-api.ts

# Deploy agent instructions
cp AGENTS.md ~/.openclaw/workspace/BOOTSTRAP.md

# Configure OpenClaw (see docs at openclaw.ai)
openclaw configure
```

### Environment Variables

#### Web App
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite connection string |
| `JWT_SECRET` | Secret for session tokens |
| `EC2_API_URL` | URL of your provision API |
| `EC2_API_KEY` | Shared secret for API auth |
| `NEXT_PUBLIC_TELEGRAM_BOT_URL` | Public link to your Telegram bot |

#### EC2 Server
| Variable | Description |
|----------|-------------|
| `EC2_API_KEY` | Same shared secret as web app |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `REPLICATE_API_TOKEN` | From replicate.com |
| `BETTERNESS_MCP_URL` | Betterness MCP endpoint |

## Agent Features

- **Mandatory pairing gate**: Bot won't respond until user verifies with pairing code
- **Future Self Engine**: Generates AI-aged photos based on real health data
- **Daily check-ins**: Wellbeing score (1-10) + pain/health tracking
- **Trend analysis**: Correlates habits with wearable data and self-reported wellbeing
- **Curated habit library**: Sleep, energy, focus, stress, movement experiments
- **Calendar/screen time awareness**: Uses screenshot analysis to tailor recommendations

## Deployment

The web app deploys to Railway (or any Docker-compatible platform) using the included `Dockerfile`. The agent server runs on any Linux VM with OpenClaw installed.

## License

MIT
