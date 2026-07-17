import { NextResponse } from "next/server";

import {
  AcceptEscoSkillRequestSchema,
  type AnalysisResponse,
} from "@/lib/contracts";
import {
  AnswerQuestionError,
  editVacancyFactWithVerifiedEsco,
} from "@/lib/domain/answer-question";
import { getEscoOccupationSkillRelations } from "@/lib/integrations/esco";
import {
  EscoProvenanceError,
  assertValidBriefEscoProvenance,
  attestEscoSkillRelation,
  type EscoSkillRelationClaim,
} from "@/lib/server/esco-provenance";
import {
  getKnowledgeGuardConfig,
  knowledgeRateLimiter,
  knowledgeRateLimitKey,
} from "@/lib/server/knowledge-guard";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 64_000;

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable = false,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, retryable } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const config = getKnowledgeGuardConfig();
  const rateLimit = knowledgeRateLimiter.consume(
    knowledgeRateLimitKey(request, config.trustProxyHeaders),
    config.rateLimit,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limited",
          message: "Too many ESCO acceptance requests. Please retry later.",
          retryable: true,
        },
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(413, "request_too_large", "The ESCO skill acceptance request is too large.");
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return errorResponse(413, "request_too_large", "The ESCO skill acceptance request is too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = AcceptEscoSkillRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The ESCO skill acceptance request is invalid.");
  }

  const { brief, fieldId, action, escoCandidate } = parsed.data;
  const primaryOccupation = brief.esco.primaryOccupation;
  if (!primaryOccupation) {
    return errorResponse(400, "invalid_request", "A confirmed primary ESCO occupation is required.");
  }
  try {
    assertValidBriefEscoProvenance(brief);
    const relations = await getEscoOccupationSkillRelations({
      occupationUri: escoCandidate.occupationUri,
      locale: escoCandidate.language,
      limitPerRelation: 50,
    }, { signal: request.signal });
    if (relations.status === "unavailable") {
      return errorResponse(
        503,
        "official_esco_unavailable",
        "The official ESCO relation could not be verified right now.",
        true,
      );
    }

    const verifiedRelation = relations.skills.find((skill) => (
      skill.source === "official_esco_api"
      && skill.uri === escoCandidate.skillUri
      && skill.relation === escoCandidate.relation
      && skill.version === escoCandidate.version
      && skill.preferredLabel === escoCandidate.label
    ));
    if (!verifiedRelation) {
      if (relations.status === "partial") {
        return errorResponse(
          503,
          "official_esco_incomplete",
          "The official ESCO response was incomplete, so the relation was not accepted.",
          true,
        );
      }
      return errorResponse(
        409,
        "esco_relation_not_verified",
        "The presented occupation-to-skill relation was not verified by the official ESCO API.",
      );
    }

    const relationClaim: EscoSkillRelationClaim = {
      briefId: brief.id,
      occupationUri: primaryOccupation.uri,
      occupationVersion: verifiedRelation.version,
      skillUri: verifiedRelation.uri,
      skillLabel: verifiedRelation.preferredLabel,
      skillLanguage: brief.locale,
      skillVersion: verifiedRelation.version,
      skillAlternativeLabels: [],
      relation: verifiedRelation.relation,
    };
    const response: AnalysisResponse = editVacancyFactWithVerifiedEsco(
      { brief, fieldId, action },
      {
        occupationUri: primaryOccupation.uri,
        skillUri: verifiedRelation.uri,
        relation: verifiedRelation.relation,
        version: verifiedRelation.version,
        language: brief.locale,
        label: verifiedRelation.preferredLabel,
        attestation: attestEscoSkillRelation(relationClaim),
      },
    );
    return NextResponse.json(response, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof EscoProvenanceError) {
      return errorResponse(error.status, error.code, error.message, error.retryable);
    }
    if (error instanceof AnswerQuestionError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(
      503,
      "official_esco_unavailable",
      "The official ESCO relation could not be verified right now.",
      true,
    );
  }
}
