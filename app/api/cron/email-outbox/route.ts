import { NextResponse, type NextRequest } from "next/server";
import { processEmailOutbox } from "@/lib/email/outbox";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processEmailOutbox());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email delivery failed" }, { status: 500 });
  }
}
