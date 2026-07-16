import { describe, expect, it } from "vitest";

import { POST as answerQuestionRoute } from "@/app/api/answer/route";
import {
  VacancyBriefSchema,
  VacancyFactSchema,
  type VacancyAnswerValue,
  type VacancyBrief,
  type VacancyFieldId,
} from "@/lib/contracts";
import {
  AnswerQuestionError,
  editVacancyFact,
} from "@/lib/domain/answer-question";
import { calculateMarketScenario } from "@/lib/market/scenario";

const createdAt = "2026-07-16T12:00:00.000Z";
const editedAt = "2026-07-17T08:30:00.000Z";
const invalidTypedAnswers: Array<[VacancyFieldId, VacancyAnswerValue]> = [
  ["role.startDate", "2025-02-30"],
  ["role.headcount", 1.5],
  ["role.headcount", 0],
  ["role.remoteShare", 101],
  ["role.travel", -1],
  ["role.leadershipScope", ["mentoring", "Mentoring"]],
  ["role.leadershipScope", ["manager"]],
  ["role.leadershipScope", ["none", "mentoring"]],
];

function briefWithFacts(
  facts: VacancyBrief["facts"] = [],
  revision = 2,
): VacancyBrief {
  return VacancyBriefSchema.parse({
    id: "brief-boundary-test",
    schemaVersion: "1.0",
    locale: "en",
    revision,
    facts,
    createdAt,
    updatedAt: createdAt,
  });
}

describe("answer API mutation boundaries", () => {
  it("returns a conflict for a question that is stale for the supplied brief revision", async () => {
    const titleFact = VacancyFactSchema.parse({
      fieldId: "role.title",
      value: "Data Engineer",
      status: "user_confirmed",
      evidence: [],
      confidence: 1,
      provenance: {
        origin: "user",
        method: "user_entry",
        sourceIds: ["prior-answer"],
        recordedAt: createdAt,
      },
      hasConflict: false,
    });

    const response = await answerQuestionRoute(new Request("http://localhost/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: briefWithFacts([titleFact], 7),
        questionId: "q_role_title",
        fieldId: "role.title",
        action: { kind: "answer", value: "Platform Engineer" },
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "question_not_available",
        retryable: false,
      },
    });
  });

  it("does not let a valid question identifier write to another canonical field", async () => {
    const response = await answerQuestionRoute(new Request("http://localhost/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: briefWithFacts(),
        questionId: "q_role_title",
        fieldId: "role.location",
        action: { kind: "answer", value: "Berlin" },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "question_field_mismatch",
        retryable: false,
      },
    });
  });
});

describe("canonical fact edit invariants", () => {
  it("keeps prior evidence and provenance source IDs when a user confirms a fact", () => {
    const sourceFact = VacancyFactSchema.parse({
      fieldId: "role.title",
      value: "Engineer",
      status: "inferred",
      evidence: [{
        id: "job-ad-evidence",
        sourceId: "job-ad",
        sourceType: "pasted_text",
        quote: "Join our engineering team",
        locator: { start: 0, end: 25 },
        language: "en",
      }],
      confidence: 0.6,
      provenance: {
        origin: "job_ad",
        method: "structured_extraction",
        sourceIds: ["job-ad", "retrieved-context"],
        recordedAt: createdAt,
      },
      hasConflict: false,
    });

    const result = editVacancyFact(
      {
        brief: briefWithFacts([sourceFact]),
        fieldId: "role.title",
        action: { kind: "answer", value: "Platform Engineer" },
      },
      {
        now: () => new Date(editedAt),
        idFactory: () => "confirmation-id",
      },
    );
    const fact = result.brief.facts.find((item) => item.fieldId === "role.title");

    expect(fact?.evidence.map((item) => item.id)).toEqual([
      "job-ad-evidence",
      "evidence-confirmation-id",
    ]);
    expect(fact?.provenance).toEqual({
      origin: "user",
      method: "user_entry",
      sourceIds: ["job-ad", "retrieved-context", "user-answer-confirmation-id"],
      recordedAt: editedAt,
    });
  });

  it.each(invalidTypedAnswers)("rejects an invalid typed value for %s", (fieldId, value) => {
    expect(() => editVacancyFact({
      brief: briefWithFacts(),
      fieldId,
      action: { kind: "answer", value },
    })).toThrow(AnswerQuestionError);
  });
});

describe("cumulative market scenario semantics", () => {
  it("applies added must-haves in order and reconciles every total deterministically", () => {
    const input = {
      briefId: "brief-1",
      searchRadiusKm: 50,
      remoteSharePercent: 25,
      seniority: "senior" as const,
      mustHaveSkills: ["Python", "SQL"],
      addedMustHaveSkills: ["Kubernetes", "Terraform"],
    };

    const first = calculateMarketScenario(input);
    const second = calculateMarketScenario(input);

    expect(second).toEqual(first);
    expect(first.baselineReachIndex).toBe(70);
    expect(first.whatIfRows.map((row) => ({
      skill: row.addedSkill,
      count: row.resultingMustHaveSkillCount,
      reach: row.reachIndex,
      delta: row.deltaPoints,
    }))).toEqual([
      { skill: "Kubernetes", count: 3, reach: 66, delta: -4 },
      { skill: "Terraform", count: 4, reach: 62, delta: -4 },
    ]);
    expect(first.reachIndex).toBe(first.whatIfRows.at(-1)?.reachIndex);
    expect(first.deltaPoints).toBe(first.reachIndex - first.baselineReachIndex);
  });

  it("uses the baseline as the final result when no new skill is added", () => {
    const result = calculateMarketScenario({
      briefId: "brief-1",
      searchRadiusKm: 50,
      remoteSharePercent: 25,
      seniority: "senior",
      mustHaveSkills: ["Python", "SQL"],
      addedMustHaveSkills: [],
    });

    expect(result.whatIfRows).toEqual([]);
    expect(result.reachIndex).toBe(result.baselineReachIndex);
    expect(result.deltaPoints).toBe(0);
  });

  it("keeps the cumulative count contract-valid at the maximum request size", () => {
    const result = calculateMarketScenario({
      briefId: "brief-maximum",
      searchRadiusKm: 50,
      remoteSharePercent: 25,
      seniority: "senior",
      mustHaveSkills: Array.from({ length: 50 }, (_, index) => `Existing ${index}`),
      addedMustHaveSkills: Array.from({ length: 50 }, (_, index) => `Added ${index}`),
    });

    expect(result.whatIfRows).toHaveLength(50);
    expect(result.whatIfRows.at(-1)?.resultingMustHaveSkillCount).toBe(100);
  });
});
