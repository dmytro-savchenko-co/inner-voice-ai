import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSession();

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        betternessConnected: !!user.betternessConnection,
        betternessTokenMasked: user.betternessConnection
          ? `${user.betternessConnection.encryptedToken.slice(0, 6)}...${user.betternessConnection.encryptedToken.slice(-4)}`
          : null,
        telegramPaired: !!user.telegramPairing,
        telegramUserId: user.telegramPairing?.telegramUserId ?? null,
      },
    });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
