import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const EC2_API_URL = process.env.EC2_API_URL;

export async function GET(req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const telegramUserId = user.telegramPairing?.telegramUserId;
    if (!telegramUserId) {
      return NextResponse.json({ summary: null, daily: [], entries: [] });
    }

    const type = req.nextUrl.searchParams.get("type") || "summary";

    if (type === "logs") {
      // Proxy to daily-log summary for the overview page
      const res = await fetch(
        `${EC2_API_URL}/api/daily-log/${telegramUserId}/summary?days=7`
      );
      return NextResponse.json(await res.json());
    }

    if (type === "recent") {
      const limit = req.nextUrl.searchParams.get("limit") || "20";
      const res = await fetch(
        `${EC2_API_URL}/api/usage/recent?userId=${telegramUserId}&limit=${limit}`
      );
      return NextResponse.json(await res.json());
    }

    // Default: summary
    const days = req.nextUrl.searchParams.get("days") || "30";
    const res = await fetch(
      `${EC2_API_URL}/api/usage/summary?userId=${telegramUserId}&days=${days}`
    );
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("Usage API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
