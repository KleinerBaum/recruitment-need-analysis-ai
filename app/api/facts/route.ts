import { NextResponse } from "next/server";

import { EditVacancyFactRequestSchema } from "@/lib/contracts";
import {
  AnswerQuestionError,
  editVacancyFact,
} from "@/lib/domain/answer-question";
import { EscoProvenanceError } from "@/lib/server/esco-provenance";

export const runtime = "nodejs";

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message, retryable: false } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = EditVacancyFactRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The fact edit request is invalid.");
  }

  try {
    const response = editVacancyFact(parsed.data);
    return NextResponse.json(response, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof EscoProvenanceError) {
      return errorResponse(error.status, error.code, error.message);
    }
    if (error instanceof AnswerQuestionError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(500, "fact_edit_failed", "The fact could not be updated.");
  }
}
