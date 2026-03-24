import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAgentStatus } from "@/lib/ec2-api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ telegramUserId: string }> }
) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { telegramUserId } = await params;

    // Only allow users to check their own agent status
    if (user.telegramPairing?.telegramUserId !== telegramUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await getAgentStatus(telegramUserId);

    if (!result.success) {
      return NextResponse.json(
        { status: "unavailable", error: result.error },
        { status: 200 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Agent status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
