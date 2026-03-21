-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetternessConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetternessConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramPairing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "telegramUserId" TEXT,
    "pairingCode" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramPairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "morningCheckinTime" TEXT NOT NULL DEFAULT '08:00',
    "eveningCheckinTime" TEXT NOT NULL DEFAULT '21:00',
    "checkinIntensity" TEXT NOT NULL DEFAULT 'normal',
    "dndStart" TEXT,
    "dndEnd" TEXT,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "activeHabit" TEXT,
    "habitStartDate" TEXT,
    "lastVideoRefresh" TEXT,
    "baselineWeekEnd" TEXT,
    "lastMorningSent" TEXT,
    "lastEveningSent" TEXT,
    "lastWeeklySent" TEXT,
    "lastUserMessage" TIMESTAMP(3),
    "lastTemplateIdx" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLog" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "checkinType" TEXT NOT NULL DEFAULT 'morning',
    "wellbeing" INTEGER,
    "moodLabel" TEXT,
    "bodyStatus" TEXT NOT NULL DEFAULT 'fine',
    "painLocation" TEXT,
    "painSeverity" INTEGER,
    "sleepSelfReport" TEXT,
    "expectedDayLoad" TEXT,
    "didActiveHabit" BOOLEAN,
    "habitNotes" TEXT,
    "notes" TEXT,
    "checkinTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "videoPath" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BetternessConnection_userId_key" ON "BetternessConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPairing_userId_key" ON "TelegramPairing"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPairing_telegramUserId_key" ON "TelegramPairing"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPairing_pairingCode_key" ON "TelegramPairing"("pairingCode");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_telegramUserId_key" ON "UserPreferences"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_telegramUserId_date_checkinType_key" ON "DailyLog"("telegramUserId", "date", "checkinType");

-- AddForeignKey
ALTER TABLE "BetternessConnection" ADD CONSTRAINT "BetternessConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPairing" ADD CONSTRAINT "TelegramPairing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
