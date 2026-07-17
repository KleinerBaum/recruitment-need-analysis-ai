import { NextResponse } from "next/server";

import { recruitmentKnowledgeCapability } from "@/lib/integrations/vector-store";

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
        recruitmentKnowledge: recruitmentKnowledgeCapability(),
        escoSearch: "available_with_verified_fallback",
        escoProvenanceSigning:
          (process.env.ESCO_PROVENANCE_SIGNING_SECRET?.trim().length ?? 0) >= 32
            ? "configured"
            : "not_configured",
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
