import { NextResponse } from "next/server";

import {
  RecruitmentKnowledgeRequestSchema,
  RecruitmentKnowledgeResponseSchema,
} from "@/lib/contracts";
import { enrichRecruitmentKnowledge } from "@/lib/integrations/recruitment-knowledge";
import {
  getKnowledgeGuardConfig,
  isKnowledgeResponseCacheable,
  knowledgeRateLimiter,
  knowledgeRateLimitKey,
  knowledgeResponseCache,
  type RateLimitDecision,
} from "@/lib/server/knowledge-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 32_000;

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  headers: Readonly<Record<string, string>> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message, retryable } },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1_000)),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const config = getKnowledgeGuardConfig();
  const rateLimit = knowledgeRateLimiter.consume(
    knowledgeRateLimitKey(request, config.trustProxyHeaders),
    config.rateLimit,
  );
  const guardHeaders = rateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return errorResponse(
      429,
      "rate_limited",
      "Too many recruitment knowledge requests. Please retry later.",
      true,
      {
        ...guardHeaders,
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(
      413,
      "request_too_large",
      "The recruitment knowledge request is too large.",
      false,
      guardHeaders,
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
      false,
      guardHeaders,
    );
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return errorResponse(
      413,
      "request_too_large",
      "The recruitment knowledge request is too large.",
      false,
      guardHeaders,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
      false,
      guardHeaders,
    );
  }

  const parsed = RecruitmentKnowledgeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "The recruitment knowledge request is invalid.",
      false,
      guardHeaders,
    );
  }

  const cached = knowledgeResponseCache.get(parsed.data);
  if (cached) {
    return NextResponse.json(cached, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        ...guardHeaders,
        "X-Knowledge-Cache": "HIT",
      },
    });
  }

  try {
    const result = RecruitmentKnowledgeResponseSchema.parse(
      await enrichRecruitmentKnowledge(parsed.data, { signal: request.signal }),
    );
    if (!request.signal.aborted && isKnowledgeResponseCacheable(result)) {
      knowledgeResponseCache.set(parsed.data, result, {
        ttlMs: config.cacheTtlMs,
        maxEntries: config.cacheMaxEntries,
      });
    }
    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        ...guardHeaders,
        "X-Knowledge-Cache": "MISS",
      },
    });
  } catch {
    return errorResponse(
      503,
      "knowledge_unavailable",
      "Recruitment knowledge enrichment is temporarily unavailable.",
      true,
      guardHeaders,
    );
  }
}
