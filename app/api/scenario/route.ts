import { NextResponse } from "next/server";

import { MarketScenarioRequestSchema } from "@/lib/contracts";
import { calculateMarketScenario } from "@/lib/market/scenario";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Request body must be valid JSON.", retryable: false } },
      { status: 400 },
    );
  }

  const parsed = MarketScenarioRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "The market scenario request is invalid.", retryable: false } },
      { status: 400 },
    );
  }

  const result = calculateMarketScenario(parsed.data);
  return NextResponse.json(result, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
