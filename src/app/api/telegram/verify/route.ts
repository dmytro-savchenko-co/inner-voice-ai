import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EC2_API_KEY = process.env.EC2_API_KEY;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!EC2_API_KEY || apiKey !== EC2_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { pairingCode, telegramUserId } = await req.json();

    if (!pairingCode || !telegramUserId) {
      return NextResponse.json(
        { error: "pairingCode and telegramUserId are required" },
        { status: 400 }
      );
    }

    const pairing = await prisma.telegramPairing.findUnique({
      where: { pairingCode },
      include: {
        user: {
          include: { betternessConnection: true },
        },
      },
    });

    if (!pairing || pairing.approved) {
      return NextResponse.json(
        { error: "Invalid or already used pairing code" },
        { status: 404 }
      );
    }

    // Reject codes older than 30 minutes
    const ageMs = Date.now() - pairing.createdAt.getTime();
    if (ageMs > 30 * 60 * 1000) {
      return NextResponse.json(
        { error: "Pairing code expired. Please generate a new one." },
        { status: 410 }
      );
    }

    await prisma.telegramPairing.update({
      where: { id: pairing.id },
      data: { approved: true, telegramUserId },
    });

    const betternessToken =
      pairing.user.betternessConnection?.encryptedToken ?? null;

    return NextResponse.json({
      success: true,
      betternessToken,
      userName: pairing.user.name,
    });
  } catch (error) {
    console.error("Telegram verify error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
