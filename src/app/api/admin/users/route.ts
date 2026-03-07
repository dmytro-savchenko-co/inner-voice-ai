import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EC2_API_KEY = process.env.EC2_API_KEY;

export async function DELETE(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!EC2_API_KEY || apiKey !== EC2_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.betternessConnection.deleteMany();
  await prisma.telegramPairing.deleteMany();
  await prisma.user.deleteMany();

  return NextResponse.json({ success: true, message: "All users, pairings, and connections deleted" });
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!EC2_API_KEY || apiKey !== EC2_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    include: {
      betternessConnection: true,
      telegramPairing: true,
    },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      betterness: u.betternessConnection
        ? { token: u.betternessConnection.encryptedToken, connectedAt: u.betternessConnection.connectedAt }
        : null,
      telegram: u.telegramPairing
        ? { approved: u.telegramPairing.approved, telegramUserId: u.telegramPairing.telegramUserId, code: u.telegramPairing.pairingCode }
        : null,
    }))
  );
}
