import { NextResponse } from "next/server";
import { z } from "zod";

import { EscoConceptSchema } from "@/lib/contracts";
import {
  EscoIntegrationError,
  searchEscoConcepts,
} from "@/lib/integrations/esco";

export const runtime = "nodejs";

const SearchQuerySchema = z.strictObject({
  query: z.string().trim().min(2).max(160),
  locale: z.enum(["de", "en"]).default("de"),
  type: z.enum(["occupation", "skill"]).default("occupation"),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const SearchResponseSchema = z.strictObject({
  mode: z.enum(["live", "fallback"]),
  catalogLabel: z.enum(["live_official_esco_api", "verified_offline_esco_catalog"]),
  concepts: z.array(EscoConceptSchema).max(20),
  warning: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = SearchQuerySchema.safeParse({
    query: url.searchParams.get("q") ?? url.searchParams.get("query") ?? "",
    locale: url.searchParams.get("locale") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "The ESCO search request is invalid.", retryable: false } },
      { status: 400 },
    );
  }

  try {
    const result = await searchEscoConcepts(parsed.data);
    const response = SearchResponseSchema.parse({
      mode: result.mode,
      catalogLabel: result.mode === "live"
        ? "live_official_esco_api"
        : "verified_offline_esco_catalog",
      concepts: result.concepts.map((concept) => ({
        uri: concept.uri,
        conceptType: concept.type,
        preferredLabel: concept.preferredLabel,
        alternativeLabels: [],
        language: parsed.data.locale,
        version: concept.version,
        source: "official_esco",
      })),
      ...(result.warning ? { warning: result.warning } : {}),
    });
    return NextResponse.json(response, {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    const mapped = error instanceof EscoIntegrationError
      ? error
      : new EscoIntegrationError("provider_unavailable", "ESCO is temporarily unavailable.", {
        status: 503,
        retryable: true,
      });
    return NextResponse.json(
      { error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable } },
      { status: mapped.status },
    );
  }
}
