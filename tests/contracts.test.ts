import { describe, expect, it } from "vitest";

import {
  AnalysisResponseSchema,
  EvidenceLocatorSchema,
  MarketScenarioResultSchema,
  QuestionDependencySchema,
  VacancyBriefSchema,
  VacancyFactSchema,
  type VacancyFact,
} from "@/lib/contracts";
import {
  createTextEvidence,
  factHasGroundedEvidence,
  getUngroundedEvidence,
  isEvidenceGrounded,
  mergeEvidence,
} from "@/lib/domain/evidence";

const recordedAt = "2026-07-16T12:00:00.000Z";

function evidenceFact(overrides: Partial<VacancyFact> = {}): VacancyFact {
  return VacancyFactSchema.parse({
    fieldId: "role.title",
    value: "Data Engineer",
    status: "explicit",
    evidence: [
      {
        id: "ev-role-title",
        sourceId: "job-ad",
        sourceType: "pasted_text",
        quote: "Data Engineer",
        locator: {},
        language: "en",
      },
    ],
    confidence: 0.98,
    provenance: {
      origin: "job_ad",
      method: "direct",
      sourceIds: ["job-ad"],
      recordedAt,
    },
    hasConflict: false,
    ...overrides,
  });
}

describe("strict canonical contracts", () => {
  it("accepts an evidence-first vacancy brief", () => {
    const brief = VacancyBriefSchema.parse({
      id: "brief-1",
      schemaVersion: "1.0",
      locale: "en",
      revision: 1,
      facts: [evidenceFact()],
      esco: { secondaryOccupations: [], skills: [] },
      createdAt: recordedAt,
      updatedAt: recordedAt,
    });

    expect(brief.facts[0]?.fieldId).toBe("role.title");
    expect(brief.facts[0]?.evidence[0]?.quote).toBe("Data Engineer");
  });

  it("rejects unknown properties and duplicate field IDs", () => {
    expect(() =>
      VacancyFactSchema.parse({
        ...evidenceFact(),
        inventedField: "not allowed",
      }),
    ).toThrow();

    expect(() =>
      VacancyBriefSchema.parse({
        id: "brief-duplicates",
        schemaVersion: "1.0",
        locale: "de",
        revision: 0,
        facts: [evidenceFact(), evidenceFact()],
        createdAt: recordedAt,
        updatedAt: recordedAt,
      }),
    ).toThrow(/at most one entry per fieldId/);
  });

  it("enforces fact status, evidence, and conflict invariants", () => {
    expect(() =>
      VacancyFactSchema.parse({
        ...evidenceFact(),
        status: "explicit",
        evidence: [],
      }),
    ).toThrow(/require supporting evidence/);

    expect(() =>
      VacancyFactSchema.parse({
        ...evidenceFact(),
        status: "missing",
        value: "invented value",
        evidence: [],
        confidence: 0,
      }),
    ).toThrow(/must have a null value/);

    expect(() =>
      VacancyFactSchema.parse({
        ...evidenceFact(),
        status: "user_confirmed",
        value: null,
        evidence: [],
        provenance: {
          origin: "user",
          method: "user_entry",
          sourceIds: [],
          recordedAt,
        },
      }),
    ).toThrow(/require a non-null value/);

    expect(() =>
      VacancyFactSchema.parse({
        ...evidenceFact(),
        status: "conflict",
        hasConflict: false,
      }),
    ).toThrow(/must set hasConflict to true/);
  });

  it("enforces dependency operands and evidence locator pairs", () => {
    expect(() =>
      QuestionDependencySchema.parse({
        fieldId: "role.workModel",
        operator: "equals",
      }),
    ).toThrow(/require a value/);

    expect(() =>
      EvidenceLocatorSchema.parse({ start: 3 }),
    ).toThrow(/provided together/);
    expect(() =>
      EvidenceLocatorSchema.parse({ start: 8, end: 4 }),
    ).toThrow(/greater than start/);
  });

  it("caps an analysis response at three questions", () => {
    const brief = VacancyBriefSchema.parse({
      id: "brief-1",
      schemaVersion: "1.0",
      locale: "en",
      revision: 1,
      facts: [],
      createdAt: recordedAt,
      updatedAt: recordedAt,
    });
    const question = {
      id: "q-role-title",
      fieldId: "role.title",
      wording: { de: "Welche Rolle?", en: "Which role?" },
      rationale: { de: "Rollenbezug.", en: "Role context." },
      answerType: "short_text",
      options: [],
      dependencies: [],
      priority: 100,
      mode: "collect",
      status: "open",
      aggSafe: true,
      sensitive: false,
    } as const;

    expect(() =>
      AnalysisResponseSchema.parse({
        analysisId: "analysis-1",
        status: "needs_input",
        brief,
        completeness: {
          score: 0,
          achievedWeight: 0,
          totalWeight: 1,
          readyForSummary: false,
          sectionScores: [],
          missingFieldIds: [],
          missingCriticalFieldIds: [],
          unconfirmedFieldIds: [],
          conflictFieldIds: [],
        },
        nextQuestions: [question, question, question, question],
        warnings: [],
      }),
    ).toThrow();
  });

  it("requires transparent non-market provenance for market scenarios", () => {
    const result = MarketScenarioResultSchema.parse({
      status: "synthetic_scenario_only",
      metric: "synthetic_scenario_reach_index",
      unit: "relative_points_0_to_100",
      reachIndex: 54.5,
      whatIfRows: [],
      provenance: {
        methodId: "synthetic_candidate_reach_v1",
        dataBasis: "scenario_inputs_only",
        formula: "clamp(relative inputs)",
        usesLiveCandidateData: false,
        usesMarketCounts: false,
        usesSalaryData: false,
        usesLlm: false,
        modelsSkillSpecificScarcity: false,
      },
      assumptions: [
        {
          de: "Nur relative Szenarioeingaben.",
          en: "Relative scenario inputs only.",
        },
      ],
      disclaimer: {
        de: "Keine Aussage über reale Kandidatenverfügbarkeit oder Kausalität.",
        en: "No claim about real candidate availability or causality.",
      },
    });

    expect(result.provenance.usesLiveCandidateData).toBe(false);
    expect(() =>
      MarketScenarioResultSchema.parse({
        ...result,
        provenance: { ...result.provenance, usesLiveCandidateData: true },
      }),
    ).toThrow();
  });
});

describe("evidence helpers", () => {
  const sourceText = "We are hiring a Data Engineer for our climate platform.";

  it("creates exact offset-backed evidence", () => {
    const start = sourceText.indexOf("Data Engineer");
    const evidence = createTextEvidence({
      id: "ev-1",
      sourceId: "job-ad",
      sourceType: "pasted_text",
      sourceText,
      start,
      end: start + "Data Engineer".length,
      language: "en",
    });

    expect(evidence.quote).toBe("Data Engineer");
    expect(isEvidenceGrounded(evidence, sourceText)).toBe(true);
    expect(isEvidenceGrounded(evidence, sourceText.replace("Data", "Cloud"))).toBe(
      false,
    );
  });

  it("reports ungrounded evidence without exposing or changing source text", () => {
    const fact = evidenceFact();
    expect(factHasGroundedEvidence(fact, { "job-ad": sourceText })).toBe(true);
    expect(getUngroundedEvidence(fact, { "job-ad": "Different source" })).toHaveLength(
      1,
    );
  });

  it("deduplicates identical evidence and rejects reused conflicting IDs", () => {
    const fact = evidenceFact();
    const evidence = fact.evidence[0]!;
    expect(mergeEvidence([evidence], [evidence])).toEqual([evidence]);
    expect(() =>
      mergeEvidence([evidence], [{ ...evidence, quote: "Different" }]),
    ).toThrow(/refers to different evidence/);
  });
});
