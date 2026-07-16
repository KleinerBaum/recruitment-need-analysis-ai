import { describe, expect, it } from "vitest";

import {
  VacancyBriefSchema,
  VacancyFactSchema,
  type JsonValue,
  type VacancyBrief,
  type VacancyFact,
  type VacancyFieldId,
} from "@/lib/contracts";
import {
  QUESTION_CATALOG,
  assessCompleteness,
  getLocalizedQuestionText,
  selectNextQuestions,
} from "@/lib/domain/question-engine";

const timestamp = "2026-07-16T12:00:00.000Z";

function brief(facts: VacancyFact[] = []): VacancyBrief {
  return VacancyBriefSchema.parse({
    id: "brief-test",
    schemaVersion: "1.0",
    locale: "de",
    revision: 1,
    facts,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function userFact(
  fieldId: VacancyFieldId,
  value: JsonValue,
  overrides: Partial<VacancyFact> = {},
): VacancyFact {
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
    ...overrides,
  });
}

function sourceFact(
  fieldId: VacancyFieldId,
  value: JsonValue,
  status: "explicit" | "inferred" | "conflict" = "explicit",
): VacancyFact {
  return VacancyFactSchema.parse({
    fieldId,
    value,
    status,
    evidence: [
      {
        id: `evidence-${fieldId}`,
        sourceId: "job-ad",
        sourceType: "pasted_text",
        quote: String(value),
        locator: {},
      },
    ],
    confidence: status === "explicit" ? 0.95 : 0.6,
    provenance: {
      origin: "job_ad",
      method: "structured_extraction",
      sourceIds: ["job-ad"],
      recordedAt: timestamp,
    },
    hasConflict: status === "conflict",
    ...(status === "conflict"
      ? {
          conflictDescription: {
            de: "Zwei Quellen widersprechen sich.",
            en: "Two sources conflict.",
          },
        }
      : {}),
  });
}

describe("deterministic completeness", () => {
  it("is deterministic, bounded, and reports critical gaps", () => {
    const first = assessCompleteness(brief());
    const second = assessCompleteness(brief());

    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(100);
    expect(first.readyForSummary).toBe(false);
    expect(first.missingCriticalFieldIds).toContain("role.title");
    expect(first.missingCriticalFieldIds).toContain("tasks.outcomes");
  });

  it("gives inferred facts partial credit and flags them for confirmation", () => {
    const inferred = assessCompleteness(
      brief([sourceFact("role.title", "Data Engineer", "inferred")]),
    );
    const confirmed = assessCompleteness(
      brief([userFact("role.title", "Data Engineer")]),
    );

    expect(inferred.score).toBeGreaterThan(0);
    expect(inferred.score).toBeLessThan(confirmed.score);
    expect(inferred.unconfirmedFieldIds).toContain("role.title");
    expect(inferred.readyForSummary).toBe(false);
  });

  it("flags conflicts with zero completeness credit", () => {
    const assessment = assessCompleteness(
      brief([sourceFact("role.title", "Engineer / Analyst", "conflict")]),
    );

    expect(assessment.conflictFieldIds).toEqual(["role.title"]);
    expect(assessment.missingCriticalFieldIds).toContain("role.title");
    expect(assessment.readyForSummary).toBe(false);
  });

  it("treats an explicit missing-status fact as a missing field", () => {
    const assessment = assessCompleteness(
      brief([
        userFact("role.title", null, {
          status: "missing",
          confidence: 0,
        }),
      ]),
    );

    expect(assessment.missingFieldIds).toContain("role.title");
  });

  it("excludes remote-share completeness when the confirmed model is on-site", () => {
    const onSite = assessCompleteness(
      brief([
        userFact("role.location", "Düsseldorf"),
        userFact("role.workModel", "on_site"),
      ]),
    );
    const hybrid = assessCompleteness(
      brief([
        userFact("role.location", "Düsseldorf"),
        userFact("role.workModel", "hybrid"),
      ]),
    );

    expect(onSite.totalWeight).toBeLessThan(hybrid.totalWeight);
    expect(onSite.missingFieldIds).not.toContain("role.remoteShare");
    expect(hybrid.missingFieldIds).toContain("role.remoteShare");
  });
});

describe("adaptive question selection", () => {
  it("returns at most three stable, highest-value questions", () => {
    const first = selectNextQuestions(brief(), { limit: 20 });
    const second = selectNextQuestions(brief(), { limit: 20 });

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.map(({ fieldId }) => fieldId)).toEqual([
      "role.title",
      "role.location",
      "process.interviewStages",
    ]);
  });

  it("unlocks dependent questions only after prerequisite answers", () => {
    const initial = selectNextQuestions(brief());
    expect(initial.map(({ fieldId }) => fieldId)).not.toContain("role.purpose");
    expect(initial.map(({ fieldId }) => fieldId)).not.toContain("role.workModel");

    const unlocked = selectNextQuestions(
      brief([
        userFact("role.title", "Data Engineer"),
        userFact("role.location", "Düsseldorf"),
      ]),
    );
    expect(unlocked.map(({ fieldId }) => fieldId)).toContain("role.purpose");
    expect(unlocked.map(({ fieldId }) => fieldId)).toContain("role.workModel");
  });

  it("never asks remote share for a confirmed on-site role", () => {
    const questions = selectNextQuestions(
      brief([
        userFact("role.title", "Data Engineer"),
        userFact("role.location", "Düsseldorf"),
        userFact("role.workModel", "on_site"),
      ]),
      { limit: 3 },
    );

    expect(questions.map(({ fieldId }) => fieldId)).not.toContain(
      "role.remoteShare",
    );
  });

  it("prioritises conflicts and marks their resolution mode", () => {
    const questions = selectNextQuestions(
      brief([
        sourceFact("role.title", "Engineer / Analyst", "conflict"),
        userFact("role.location", "Berlin"),
      ]),
    );

    expect(questions[0]?.fieldId).toBe("role.title");
    expect(questions[0]?.mode).toBe("resolve_conflict");
    expect(questions[0]?.wording.de).toMatch(/widersprüchliche Angaben/i);
    expect(questions[0]?.wording.en).toMatch(/conflicts/i);
  });

  it("marks inferred values for confirmation rather than treating them as final", () => {
    const questions = selectNextQuestions(
      brief([sourceFact("role.title", "Data Engineer", "inferred")]),
    );

    expect(questions[0]?.fieldId).toBe("role.title");
    expect(questions[0]?.mode).toBe("confirm");
    expect(questions[0]?.wording.de).toMatch(/bestätigen oder korrigieren/i);
  });

  it("serves complete German and English wording", () => {
    for (const definition of QUESTION_CATALOG) {
      expect(definition.wording.de.trim()).not.toBe("");
      expect(definition.wording.en.trim()).not.toBe("");
      expect(definition.rationale.de.trim()).not.toBe("");
      expect(definition.rationale.en.trim()).not.toBe("");
      expect(definition.aggSafe).toBe(true);
    }

    const [question] = selectNextQuestions(brief());
    expect(question).toBeDefined();
    expect(getLocalizedQuestionText(question!, "de").text).toBe(
      question!.wording.de,
    );
    expect(getLocalizedQuestionText(question!, "en").text).toBe(
      question!.wording.en,
    );
  });

  it("contains no private or AGG-protected personal-data questions", () => {
    const allWording = QUESTION_CATALOG.flatMap((question) => [
      question.wording.de,
      question.wording.en,
    ])
      .join(" ")
      .toLowerCase();
    const prohibitedPersonalTopics = [
      "geburtsdatum",
      "familienstand",
      "kinderwunsch",
      "schwanger",
      "religion",
      "ethnische herkunft",
      "sexual orientation",
      "marital status",
      "date of birth",
      "pregnant",
      "disability status",
    ];

    for (const topic of prohibitedPersonalTopics) {
      expect(allWording).not.toContain(topic);
    }
  });
});
