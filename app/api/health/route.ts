import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      capabilities: {
        deterministicQuestionEngine: "available",
        openaiExtraction: process.env.OPENAI_API_KEY?.trim() ? "configured" : "not_configured",
        escoSearch: "available_with_verified_fallback",
        marketScenario: process.env.MARKET_DATA_API_URL?.trim()
          ? "external_provider_not_enabled_in_pilot"
          : "synthetic_demo",
      },
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
