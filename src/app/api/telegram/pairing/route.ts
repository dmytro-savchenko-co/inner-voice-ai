import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST() {
  try {
    const user = await getSession();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const pairingCode = randomBytes(3).toString("hex").toUpperCase();

    await prisma.telegramPairing.upsert({
      where: { userId: user.id },
      update: { pairingCode, approved: false },
      create: { userId: user.id, pairingCode },
    });

    return NextResponse.json({
      success: true,
      pairingCode,
      botUrl: process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL,
    });
  } catch (error) {
    console.error("Telegram pairing error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
