import { describe, expect, it } from "vitest";

import { POST as answerQuestionRoute } from "@/app/api/answer/route";
import { PATCH as editFactRoute } from "@/app/api/facts/route";
import {
  AnalysisResponseSchema,
  AnswerVacancyQuestionRequestSchema,
  EditVacancyFactRequestSchema,
  VACANCY_FIELD_IDS,
  VacancyBriefSchema,
  VacancyFactSchema,
  type JsonValue,
  type VacancyBrief,
  type VacancyFact,
  type VacancyFieldId,
} from "@/lib/contracts";
import {
  AnswerQuestionError,
  answerVacancyQuestion,
  editVacancyFact,
} from "@/lib/domain/answer-question";
import { normalizeServerAnalysis } from "@/lib/client-normalize";

const timestamp = "2026-07-16T12:00:00.000Z";
const answeredAt = "2026-07-17T08:30:00.000Z";

function brief(facts: VacancyFact[] = [], revision = 3): VacancyBrief {
  return VacancyBriefSchema.parse({
    id: "brief-answer-test",
    schemaVersion: "1.0",
    locale: "en",
    revision,
    facts,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function userFact(fieldId: VacancyFieldId, value: JsonValue = "documented"): VacancyFact {
  return VacancyFactSchema.parse({
    fieldId,
    value,
    status: "user_confirmed",
    evidence: [],
    confidence: 1,
    provenance: {
      origin: "user",
      method: "user_entry",
      sourceIds: [],
      recordedAt: timestamp,
    },
    hasConflict: false,
  });
}

function almostCompleteBrief(missingFieldId: VacancyFieldId): VacancyBrief {
  return brief(
    VACANCY_FIELD_IDS
      .filter((fieldId) => fieldId !== missingFieldId)
      .map((fieldId) => userFact(fieldId)),
  );
}

describe("canonical iterative answers", () => {
  it("records a typed answer with user evidence and returns the next canonical batch", () => {
    const response = answerVacancyQuestion(
      {
        brief: brief(),
        questionId: "q_role_title",
        fieldId: "role.title",
        action: { kind: "answer", value: "Data Engineer" },
      },
      {
        now: () => new Date(answeredAt),
        idFactory: () => "fixed-id",
      },
    );
    const canonical = AnalysisResponseSchema.parse(response);
    const fact = canonical.brief.facts.find((item) => item.fieldId === "role.title");

    expect(canonical.brief.revision).toBe(4);
    expect(canonical.brief.updatedAt).toBe(answeredAt);
    expect(canonical.brief.title).toBe("Data Engineer");
    expect(fact).toMatchObject({
      value: "Data Engineer",
      status: "user_confirmed",
      confidence: 1,
      hasConflict: false,
      provenance: {
        origin: "user",
        method: "user_entry",
        sourceIds: ["user-answer-fixed-id"],
        recordedAt: answeredAt,
      },
    });
    expect(fact?.evidence.at(-1)).toMatchObject({
      sourceId: "user-answer-fixed-id",
      sourceType: "user_answer",
      quote: "Data Engineer",
      language: "en",
    });
    expect(canonical.nextQuestions).toHaveLength(3);
    expect(canonical.nextQuestions.map((question) => question.fieldId)).not.toContain("role.title");
    expect(canonical.nextQuestions.map((question) => question.fieldId)).toContain("role.purpose");
    expect(canonical.completeness.score).toBeGreaterThan(0);
  });

  it("accepts only the canonical value type and options for the target question", () => {
    expect(() =>
      answerVacancyQuestion({
        brief: brief(),
        questionId: "q_role_title",
        fieldId: "role.title",
        action: { kind: "answer", value: 42 },
      }),
    ).toThrowError(AnswerQuestionError);

    const seniorityBrief = almostCompleteBrief("role.seniority");
    expect(() =>
      answerVacancyQuestion({
        brief: seniorityBrief,
        questionId: "q_role_seniority",
        fieldId: "role.seniority",
        action: { kind: "answer", value: "Senior" },
      }),
    ).toThrow(/not an option/);

    const accepted = answerVacancyQuestion({
      brief: seniorityBrief,
      questionId: "q_role_seniority",
      fieldId: "role.seniority",
      action: { kind: "answer", value: "senior" },
    });
    expect(accepted.brief.facts.find((fact) => fact.fieldId === "role.seniority")?.value)
      .toBe("senior");
  });

  it("rejects blocked, stale, and field-mismatched questions", () => {
    expect(() =>
      answerVacancyQuestion({
        brief: brief(),
        questionId: "q_role_purpose",
        fieldId: "role.purpose",
        action: { kind: "answer", value: "Improve delivery reliability" },
      }),
    ).toThrow(/not available/);

    expect(() =>
      answerVacancyQuestion({
        brief: brief(),
        questionId: "q_role_title",
        fieldId: "role.location",
        action: { kind: "answer", value: "Berlin" },
      }),
    ).toThrow(/does not target/);
  });

  it("records declined and not-applicable decisions as null user-answer facts", () => {
    const declined = answerVacancyQuestion({
      brief: brief(),
      questionId: "q_role_title",
      fieldId: "role.title",
      action: { kind: "declined" },
    });
    const declinedFact = declined.brief.facts.find((fact) => fact.fieldId === "role.title");
    expect(declinedFact).toMatchObject({ value: null, status: "declined" });
    expect(declinedFact?.evidence.at(-1)?.sourceType).toBe("user_answer");

    const notApplicable = answerVacancyQuestion({
      brief: almostCompleteBrief("requirements.certifications"),
      questionId: "q_certifications",
      fieldId: "requirements.certifications",
      action: { kind: "not_applicable" },
    });
    const notApplicableFact = notApplicable.brief.facts.find(
      (fact) => fact.fieldId === "requirements.certifications",
    );
    expect(notApplicableFact).toMatchObject({ value: null, status: "not_applicable" });
    expect(notApplicableFact?.evidence.at(-1)?.sourceType).toBe("user_answer");
    expect(
      normalizeServerAnalysis(notApplicable, "en")?.facts.find(
        (fact) => fact.id === "requirements.certifications",
      )?.status,
    ).toBe("not_applicable");
  });

  it("rejects not-applicable for critical and operational core fields", () => {
    expect(() =>
      answerVacancyQuestion({
        brief: brief(),
        questionId: "q_role_title",
        fieldId: "role.title",
        action: { kind: "not_applicable" },
      }),
    ).toThrow(/required and cannot be marked as not applicable/i);

    expect(() =>
      editVacancyFact({
        brief: brief(),
        fieldId: "success.metrics",
        action: { kind: "not_applicable" },
      }),
    ).toThrow(/required and cannot be marked as not applicable/i);

    expect(() =>
      editVacancyFact({
        brief: brief(),
        fieldId: "company.name",
        action: { kind: "not_applicable" },
      }),
    ).toThrow(/required and cannot be marked as not applicable/i);
  });

  it("resolves an inferred or conflicting fact without discarding its source evidence", () => {
    const conflict = VacancyFactSchema.parse({
      fieldId: "role.title",
      value: "Engineer / Analyst",
      status: "conflict",
      evidence: [{
        id: "source-evidence",
        sourceId: "job-ad",
        sourceType: "pasted_text",
        quote: "Engineer / Analyst",
        locator: { start: 0, end: 18 },
        language: "en",
      }],
      confidence: 0.5,
      provenance: {
        origin: "job_ad",
        method: "structured_extraction",
        sourceIds: ["job-ad"],
        recordedAt: timestamp,
      },
      hasConflict: true,
      conflictDescription: {
        de: "Widersprüchliche Titel.",
        en: "Conflicting titles.",
      },
    });
    const response = answerVacancyQuestion({
      brief: brief([conflict]),
      questionId: "q_role_title",
      fieldId: "role.title",
      action: { kind: "answer", value: "Data Engineer" },
    });
    const fact = response.brief.facts.find((item) => item.fieldId === "role.title");

    expect(fact?.status).toBe("user_confirmed");
    expect(fact?.hasConflict).toBe(false);
    expect(fact?.conflictDescription).toBeUndefined();
    expect(fact?.evidence.map((item) => item.id)).toContain("source-evidence");
    expect(response.completeness.conflictFieldIds).not.toContain("role.title");
  });
});

describe("POST /api/answer", () => {
  it("returns a canonical response and rejects invalid strict payloads", async () => {
    const requestBody = AnswerVacancyQuestionRequestSchema.parse({
      brief: brief(),
      questionId: "q_role_title",
      fieldId: "role.title",
      action: { kind: "answer", value: "Platform Engineer" },
    });
    const response = await answerQuestionRoute(new Request("http://localhost/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }));
    expect(response.status).toBe(200);
    const payload = AnalysisResponseSchema.parse(await response.json());
    expect(payload.brief.revision).toBe(4);

    const invalidResponse = await answerQuestionRoute(new Request("http://localhost/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...requestBody, unexpected: true }),
    }));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      error: { code: "invalid_request", retryable: false },
    });
  });
});

describe("canonical final-review fact edits", () => {
  it("edits any canonical field without weakening field-specific validation", () => {
    const initial = brief();
    expect(() =>
      answerVacancyQuestion({
        brief: initial,
        questionId: "q_company_name",
        fieldId: "company.name",
        action: { kind: "answer", value: "Example GmbH" },
      }),
    ).toThrow(/not available/);

    const edited = editVacancyFact(
      {
        brief: initial,
        fieldId: "company.name",
        action: { kind: "answer", value: "Example GmbH" },
      },
      {
        now: () => new Date(answeredAt),
        idFactory: () => "edit-id",
      },
    );
    expect(edited.brief.revision).toBe(4);
    expect(edited.brief.facts.find((fact) => fact.fieldId === "company.name"))
      .toMatchObject({
        value: "Example GmbH",
        status: "user_confirmed",
        evidence: [{ sourceType: "user_answer", quote: "Example GmbH" }],
      });
    expect(edited.nextQuestions.length).toBeLessThanOrEqual(3);

    expect(() =>
      editVacancyFact({
        brief: initial,
        fieldId: "role.seniority",
        action: { kind: "answer", value: "Senior" },
      }),
    ).toThrow(/not an option/);
  });

  it("exposes the edit as a strict PATCH route returning AnalysisResponse", async () => {
    const requestBody = EditVacancyFactRequestSchema.parse({
      brief: brief(),
      fieldId: "success.metrics",
      action: {
        kind: "answer",
        value: "Time-to-productivity and quality after 90 days",
      },
    });
    const response = await editFactRoute(new Request("http://localhost/api/facts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }));
    expect(response.status).toBe(200);
    const payload = AnalysisResponseSchema.parse(await response.json());
    expect(payload.brief.facts.find((fact) => fact.fieldId === "success.metrics")?.value)
      .toBe("Time-to-productivity and quality after 90 days");

    const invalidResponse = await editFactRoute(new Request("http://localhost/api/facts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...requestBody, questionId: "not-accepted-here" }),
    }));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      error: { code: "invalid_request", retryable: false },
    });
  });
});
