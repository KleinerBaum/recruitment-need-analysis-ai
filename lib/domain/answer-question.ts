import { randomUUID } from "node:crypto";

import {
  AnalysisResponseSchema,
  VacancyBriefSchema,
  VacancyFactSchema,
  type AnalysisResponse,
  type AnswerVacancyQuestionRequest,
  type EditVacancyFactRequest,
  type JsonValue,
  type Question,
  type VacancyAnswerAction,
  type VacancyAnswerValue,
  type VacancyBrief,
  type VacancyFact,
  type VacancyFieldId,
} from "@/lib/contracts";
import {
  QUESTION_CATALOG,
  assessCompleteness,
  selectNextQuestions,
} from "@/lib/domain/question-engine";

export type AnswerQuestionErrorCode =
  | "question_not_available"
  | "question_field_mismatch"
  | "field_not_editable"
  | "invalid_answer";

export class AnswerQuestionError extends Error {
  readonly code: AnswerQuestionErrorCode;
  readonly status: number;

  constructor(code: AnswerQuestionErrorCode, message: string, status: number) {
    super(message);
    this.name = "AnswerQuestionError";
    this.code = code;
    this.status = status;
  }
}

type AnswerQuestionOptions = {
  now?: () => Date;
  idFactory?: () => string;
};

function invalidAnswer(message: string): never {
  throw new AnswerQuestionError("invalid_answer", message, 400);
}

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

type AnswerTarget = Pick<
  Question,
  "fieldId" | "answerType" | "options" | "allowNotApplicable"
>;
type FactMutationInput = {
  brief: VacancyBrief;
  fieldId: VacancyFieldId;
  action: VacancyAnswerAction;
};

function validateAnswerValue(target: AnswerTarget, value: VacancyAnswerValue): JsonValue {
  switch (target.answerType) {
    case "short_text": {
      if (typeof value !== "string" || value.length > 1_000 || /[\r\n]/u.test(value)) {
        return invalidAnswer("This question requires a single-line text answer.");
      }
      return value;
    }
    case "long_text": {
      if (typeof value !== "string") {
        return invalidAnswer("This question requires a text answer.");
      }
      return value;
    }
    case "date": {
      if (typeof value !== "string" || !isIsoCalendarDate(value)) {
        return invalidAnswer("This question requires a valid date in YYYY-MM-DD format.");
      }
      return value;
    }
    case "number": {
      if (typeof value !== "number") {
        return invalidAnswer("This question requires a numeric answer.");
      }
      if (
        target.fieldId === "role.headcount" &&
        (!Number.isInteger(value) || value < 1 || value > 10_000)
      ) {
        return invalidAnswer("Headcount must be a whole number from 1 to 10,000.");
      }
      return value;
    }
    case "percentage": {
      if (typeof value !== "number" || value < 0 || value > 100) {
        return invalidAnswer("This question requires a percentage from 0 to 100.");
      }
      return value;
    }
    case "single_select": {
      if (typeof value !== "string") {
        return invalidAnswer("This question requires one canonical option value.");
      }
      const allowedValues = new Set(target.options.map((option) => option.value));
      if (!allowedValues.has(value)) {
        return invalidAnswer("The selected value is not an option for this question.");
      }
      return value;
    }
    case "multi_select": {
      if (!Array.isArray(value)) {
        return invalidAnswer("This question requires a list of values.");
      }
      const normalizedKeys = value.map((item) => item.toLocaleLowerCase());
      if (new Set(normalizedKeys).size !== normalizedKeys.length) {
        return invalidAnswer("Multi-select answers must not contain duplicate values.");
      }
      if (target.options.length > 0) {
        const allowedValues = new Set(target.options.map((option) => option.value));
        if (value.some((item) => !allowedValues.has(item))) {
          return invalidAnswer("The answer contains a value that is not an option for this question.");
        }
      }
      if (
        target.fieldId === "role.leadershipScope" &&
        value.includes("none") &&
        value.length > 1
      ) {
        return invalidAnswer(
          "No leadership responsibility cannot be combined with another leadership scope.",
        );
      }
      return value;
    }
  }
}

function evidenceQuote(
  request: FactMutationInput,
  value: JsonValue,
): string {
  if (request.action.kind === "declined") {
    return request.brief.locale === "de"
      ? "Angabe durch das Hiring-Team abgelehnt."
      : "Answer declined by the hiring team.";
  }
  if (request.action.kind === "not_applicable") {
    return request.brief.locale === "de"
      ? "Durch das Hiring-Team als nicht anwendbar markiert."
      : "Marked as not applicable by the hiring team.";
  }
  const text = Array.isArray(value) ? value.join(" | ") : String(value);
  return text.length <= 4_000 ? text : `${text.slice(0, 3_999)}…`;
}

function replaceFact(brief: VacancyBrief, fact: VacancyFact): VacancyFact[] {
  const currentIndex = brief.facts.findIndex((item) => item.fieldId === fact.fieldId);
  if (currentIndex < 0) return [...brief.facts, fact];
  return brief.facts.map((item, index) => (index === currentIndex ? fact : item));
}

function nextBrief(
  brief: VacancyBrief,
  fact: VacancyFact,
  recordedAt: string,
): VacancyBrief {
  const facts = replaceFact(brief, fact);
  const { title: previousTitle, ...briefWithoutTitle } = brief;
  const titleFact = facts.find((item) => item.fieldId === "role.title");
  const title = typeof titleFact?.value === "string" && titleFact.value.trim()
    ? titleFact.value.trim()
    : fact.fieldId === "role.title"
      ? undefined
      : previousTitle;

  return VacancyBriefSchema.parse({
    ...briefWithoutTitle,
    ...(title ? { title } : {}),
    revision: brief.revision + 1,
    facts,
    updatedAt: recordedAt,
  });
}

function mutateFact(
  request: FactMutationInput,
  target: AnswerTarget,
  options: AnswerQuestionOptions,
): AnalysisResponse {
  if (request.action.kind === "not_applicable" && !target.allowNotApplicable) {
    throw new AnswerQuestionError(
      "invalid_answer",
      "This field is required and cannot be marked as not applicable.",
      400,
    );
  }
  const value = request.action.kind === "answer"
    ? validateAnswerValue(target, request.action.value)
    : null;
  const status = request.action.kind === "answer"
    ? "user_confirmed" as const
    : request.action.kind;
  const recordedAt = (options.now?.() ?? new Date()).toISOString();
  const id = options.idFactory?.() ?? randomUUID();
  const sourceId = `user-answer-${id}`;
  const previousFact = request.brief.facts.find((item) => item.fieldId === request.fieldId);
  const evidence = [
    ...(previousFact?.evidence ?? []).slice(-49),
    {
      id: `evidence-${id}`,
      sourceId,
      sourceType: "user_answer" as const,
      quote: evidenceQuote(request, value),
      locator: {},
      language: request.brief.locale,
    },
  ];
  const fact = VacancyFactSchema.parse({
    fieldId: request.fieldId,
    value,
    status,
    evidence,
    confidence: 1,
    provenance: {
      origin: "user",
      method: "user_entry",
      sourceIds: [
        ...new Set([...(previousFact?.provenance.sourceIds ?? []), sourceId]),
      ],
      recordedAt,
    },
    hasConflict: false,
  });
  const brief = nextBrief(request.brief, fact, recordedAt);
  const completeness = assessCompleteness(brief);
  const nextQuestions = selectNextQuestions(brief, { locale: brief.locale, limit: 3 });
  const responseStatus: AnalysisResponse["status"] = completeness.conflictFieldIds.length > 0
    ? "conflict"
    : completeness.readyForSummary
      ? "completed"
      : "needs_input";

  return AnalysisResponseSchema.parse({
    analysisId: `analysis-${options.idFactory?.() ?? randomUUID()}`,
    status: responseStatus,
    brief,
    completeness,
    nextQuestions,
    warnings: [],
  });
}

export function answerVacancyQuestion(
  request: AnswerVacancyQuestionRequest,
  options: AnswerQuestionOptions = {},
): AnalysisResponse {
  const currentQuestions = selectNextQuestions(request.brief, { limit: 3 });
  const question = currentQuestions.find((item) => item.id === request.questionId);
  if (!question) {
    throw new AnswerQuestionError(
      "question_not_available",
      "The question is not available for this brief revision.",
      409,
    );
  }
  if (question.fieldId !== request.fieldId) {
    throw new AnswerQuestionError(
      "question_field_mismatch",
      "The question does not target the supplied field.",
      400,
    );
  }

  return mutateFact(request, question, options);
}

export function editVacancyFact(
  request: EditVacancyFactRequest,
  options: AnswerQuestionOptions = {},
): AnalysisResponse {
  const target = QUESTION_CATALOG.find((definition) => definition.fieldId === request.fieldId);
  if (!target) {
    throw new AnswerQuestionError(
      "field_not_editable",
      "The field does not have a canonical answer definition.",
      400,
    );
  }
  return mutateFact(request, target, options);
}
