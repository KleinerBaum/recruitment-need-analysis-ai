import { NextResponse } from "next/server";
import { z } from "zod";

import { EscoIntegrationError, searchEscoConcepts } from "@/lib/integrations/esco";

export const runtime = "nodejs";

const SearchQuerySchema = z.strictObject({
  query: z.string().trim().min(2).max(160),
  locale: z.enum(["de", "en"]).default("de"),
});

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = SearchQuerySchema.safeParse({
    query: url.searchParams.get("q") ?? "",
    locale: url.searchParams.get("locale") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "The ESCO seed search request is invalid." } }, { status: 400 });
  }
  try {
    const result = await searchEscoConcepts({ ...parsed.data, type: "occupation", limit: 5 });
    return NextResponse.json({
      concepts: result.concepts.map((concept) => ({
        uri: concept.uri,
        preferredLabel: concept.preferredLabel,
        version: concept.version,
      })),
      ...(result.warning ? { warning: result.warning } : {}),
    }, { status: 200, headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    const mapped = error instanceof EscoIntegrationError
      ? error
      : new EscoIntegrationError("provider_unavailable", "ESCO is temporarily unavailable.", { status: 503, retryable: true });
    return NextResponse.json({ error: { message: mapped.message } }, { status: mapped.status });
  }
}
