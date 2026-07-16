import { NextResponse } from "next/server";

import { AnswerVacancyQuestionRequestSchema } from "@/lib/contracts";
import {
  AnswerQuestionError,
  answerVacancyQuestion,
} from "@/lib/domain/answer-question";

export const runtime = "nodejs";

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message, retryable: false } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = AnswerVacancyQuestionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The answer request is invalid.");
  }

  try {
    const response = answerVacancyQuestion(parsed.data);
    return NextResponse.json(response, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AnswerQuestionError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(500, "answer_failed", "The answer could not be recorded.");
  }
}
