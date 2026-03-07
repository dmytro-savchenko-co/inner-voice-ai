import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { validateBetternessToken } from "@/lib/betterness";
import { provisionUser } from "@/lib/ec2-api";

const connectSchema = z.object({
  token: z.string().startsWith("bk_"),
});

export async function POST(request: Request) {
  try {
    const user = await getSession();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = connectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { token } = parsed.data;

    console.log(`Betterness connect attempt for user ${user.id}, token starts with: ${token.slice(0, 10)}`);
    const isValid = await validateBetternessToken(token);
    console.log(`Betterness token valid: ${isValid}`);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid Betterness token. Please check your API key and try again." },
        { status: 400 }
      );
    }

    await prisma.betternessConnection.upsert({
      where: { userId: user.id },
      update: { encryptedToken: token },
      create: { userId: user.id, encryptedToken: token },
    });

    // Sync token to EC2 if user has a paired Telegram account
    if (user.telegramPairing?.telegramUserId) {
      const result = await provisionUser(
        user.telegramPairing.telegramUserId,
        token,
        user.telegramPairing.telegramUsername ?? undefined
      );
      console.log(`EC2 provision result for ${user.telegramPairing.telegramUserId}:`, result);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Betterness connect error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
