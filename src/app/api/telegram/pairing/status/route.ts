import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pairing = await prisma.telegramPairing.findUnique({
      where: { userId: user.id },
    });

    if (!pairing) {
      return NextResponse.json({ approved: false });
    }

    return NextResponse.json({
      approved: pairing.approved,
      telegramUserId: pairing.telegramUserId ?? undefined,
    });
  } catch (error) {
    console.error("Pairing status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
