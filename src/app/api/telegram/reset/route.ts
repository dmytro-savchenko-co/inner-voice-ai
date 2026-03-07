import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EC2_API_KEY = process.env.EC2_API_KEY;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!EC2_API_KEY || apiKey !== EC2_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { telegramUserId, email } = await req.json();

    if (!telegramUserId && !email) {
      return NextResponse.json(
        { error: "telegramUserId or email is required" },
        { status: 400 }
      );
    }

    let pairing;
    if (telegramUserId) {
      pairing = await prisma.telegramPairing.findFirst({
        where: { telegramUserId },
      });
    }
    if (!pairing && email) {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { telegramPairing: true },
      });
      pairing = user?.telegramPairing ?? null;
    }

    if (!pairing) {
      return NextResponse.json(
        { error: "No pairing found" },
        { status: 404 }
      );
    }

    await prisma.telegramPairing.delete({
      where: { id: pairing.id },
    });

    return NextResponse.json({ success: true, deleted: pairing.id });
  } catch (error) {
    console.error("Telegram reset error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
