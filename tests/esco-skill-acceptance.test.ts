import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const getEscoRelationsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/esco", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/integrations/esco")>(),
  getEscoOccupationSkillRelations: getEscoRelationsMock,
}));

import { POST as acceptEscoSkillRoute } from "@/app/api/esco/accept-skill/route";
import { POST as analyzeRoute } from "@/app/api/analyze/route";
import { PATCH as editFactRoute } from "@/app/api/facts/route";
import {
  AcceptEscoSkillRequestSchema,
  AnalysisResponseSchema,
  EditVacancyFactRequestSchema,
  VacancyBriefSchema,
  type AcceptEscoSkillRequest,
  type EscoConcept,
  type VacancyBrief,
} from "@/lib/contracts";
import {
  editVacancyFact,
  editVacancyFactWithVerifiedEsco,
  type VerifiedEscoSkillAcceptance,
} from "@/lib/domain/answer-question";
import { knowledgeRateLimiter } from "@/lib/server/knowledge-guard";
import {
  attestEscoOccupation,
  attestEscoSkillRelation,
} from "@/lib/server/esco-provenance";

const OCCUPATION_URI =
  "http://data.europa.eu/esco/occupation/d3edb8f8-3a06-47a0-8fb9-9b212c006aa2";
const OTHER_OCCUPATION_URI =
  "http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1";
const SKILL_URI =
  "http://data.europa.eu/esco/skill/1e77e42a-181f-4b48-8e74-201ce50ffc29";
const FORGED_SKILL_URI =
  "http://data.europa.eu/esco/skill/11111111-2222-4333-8444-555555555555";
const SKILL_LABEL = "interpret current data";
const CREATED_AT = "2026-07-16T12:00:00.000Z";
const ACCEPTED_AT = "2026-07-17T09:00:00.000Z";
const TEST_SIGNING_SECRET = "test-esco-signing-secret-with-at-least-32-bytes";
const TEST_ENV = { ESCO_PROVENANCE_SIGNING_SECRET: TEST_SIGNING_SECRET };
const originalSigningSecret = process.env.ESCO_PROVENANCE_SIGNING_SECRET;

const unsignedPrimaryOccupation = {
  uri: OCCUPATION_URI,
  conceptType: "occupation" as const,
  preferredLabel: "data analyst",
  alternativeLabels: [],
  language: "en" as const,
  version: "v1.2.1",
  source: "official_esco" as const,
};
const primaryOccupation: EscoConcept = {
  ...unsignedPrimaryOccupation,
  attestation: attestEscoOccupation(unsignedPrimaryOccupation, { environment: TEST_ENV }),
};

function brief(skills: EscoConcept[] = []): VacancyBrief {
  return VacancyBriefSchema.parse({
    id: "brief-esco-acceptance",
    schemaVersion: "1.0",
    locale: "en",
    revision: 4,
    facts: [],
    esco: {
      primaryOccupation,
      secondaryOccupations: [],
      skills,
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
}

function request(currentBrief = brief()): AcceptEscoSkillRequest {
  return AcceptEscoSkillRequestSchema.parse({
    brief: currentBrief,
    fieldId: "requirements.mustHaveSkills",
    action: { kind: "answer", value: ["SQL", SKILL_LABEL] },
    escoCandidate: {
      authority: "official_esco_api",
      occupationUri: OCCUPATION_URI,
      skillUri: SKILL_URI,
      relation: "essential",
      version: "v1.2.1",
      language: "en",
      label: SKILL_LABEL,
    },
  });
}

function verifiedAcceptance(
  patch: Partial<VerifiedEscoSkillAcceptance> = {},
): VerifiedEscoSkillAcceptance {
  const { attestation, ...claimPatch } = patch;
  const claim: Omit<VerifiedEscoSkillAcceptance, "attestation"> = {
    occupationUri: OCCUPATION_URI,
    skillUri: SKILL_URI,
    relation: "essential",
    version: "v1.2.1",
    language: "en",
    label: SKILL_LABEL,
    ...claimPatch,
  };
  return {
    ...claim,
    attestation: attestation ?? attestEscoSkillRelation({
      briefId: "brief-esco-acceptance",
      occupationUri: claim.occupationUri,
      occupationVersion: claim.version,
      skillUri: claim.skillUri,
      skillLabel: claim.label,
      skillLanguage: claim.language,
      skillVersion: claim.version,
      skillAlternativeLabels: [],
      relation: claim.relation,
    }, { environment: TEST_ENV }),
  };
}

function officialRelations() {
  return {
    status: "available" as const,
    skills: [{
      uri: SKILL_URI,
      preferredLabel: SKILL_LABEL,
      relation: "essential" as const,
      source: "official_esco_api" as const,
      version: "v1.2.1" as const,
    }],
  };
}

beforeEach(() => {
  process.env.ESCO_PROVENANCE_SIGNING_SECRET = TEST_SIGNING_SECRET;
  knowledgeRateLimiter.clear();
  getEscoRelationsMock.mockReset();
  getEscoRelationsMock.mockResolvedValue(officialRelations());
});

afterAll(() => {
  if (originalSigningSecret === undefined) {
    delete process.env.ESCO_PROVENANCE_SIGNING_SECRET;
  } else {
    process.env.ESCO_PROVENANCE_SIGNING_SECRET = originalSigningSecret;
  }
});

describe("strict ESCO skill candidate contract", () => {
  it("accepts a fully attributed candidate for later server verification", () => {
    expect(request().escoCandidate).toMatchObject({
      authority: "official_esco_api",
      occupationUri: OCCUPATION_URI,
      skillUri: SKILL_URI,
      relation: "essential",
      version: "v1.2.1",
      language: "en",
      label: SKILL_LABEL,
    });
  });

  it.each([
    ["different occupation", { occupationUri: OTHER_OCCUPATION_URI }],
    ["occupation URI used as a skill", { skillUri: OCCUPATION_URI }],
    ["different ESCO version", { version: "v1.1.2" }],
    ["different response language", { language: "de" }],
    ["non-official authority", { authority: "retrieved_reference" }],
  ])("rejects %s", (_label, candidatePatch) => {
    const valid = request();
    expect(AcceptEscoSkillRequestSchema.safeParse({
      ...valid,
      escoCandidate: { ...valid.escoCandidate, ...candidatePatch },
    }).success).toBe(false);
  });

  it("requires the relation-compatible field and the exact label in the answer array", () => {
    const valid = request();
    expect(AcceptEscoSkillRequestSchema.safeParse({
      ...valid,
      fieldId: "requirements.niceToHaveSkills",
    }).success).toBe(false);
    expect(AcceptEscoSkillRequestSchema.safeParse({
      ...valid,
      action: { kind: "answer", value: ["SQL"] },
    }).success).toBe(false);
  });

  it("does not expose ESCO provenance through the generic fact-edit contract", () => {
    const valid = request();
    expect(EditVacancyFactRequestSchema.safeParse({
      brief: valid.brief,
      fieldId: valid.fieldId,
      action: valid.action,
      escoCandidate: valid.escoCandidate,
    }).success).toBe(false);
  });
});

describe("verified ESCO acceptance mutation", () => {
  it("retains the user confirmation, adds ESCO evidence, and stores the skill concept", () => {
    const { brief: currentBrief, fieldId, action } = request();
    const response = editVacancyFactWithVerifiedEsco(
      { brief: currentBrief, fieldId, action },
      verifiedAcceptance(),
      {
        now: () => new Date(ACCEPTED_AT),
        idFactory: () => "esco-acceptance-id",
      },
    );
    const fact = response.brief.facts.find(
      (candidate) => candidate.fieldId === "requirements.mustHaveSkills",
    );

    expect(fact).toMatchObject({
      value: ["SQL", SKILL_LABEL],
      status: "user_confirmed",
      confidence: 1,
      provenance: {
        origin: "user",
        method: "user_entry",
        recordedAt: ACCEPTED_AT,
      },
    });
    expect(fact?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "user-answer-esco-acceptance-id",
        sourceType: "user_answer",
      }),
      expect.objectContaining({
        sourceType: "esco",
        locator: { url: SKILL_URI },
        language: "en",
      }),
    ]));
    const escoSourceId = fact?.evidence.find((item) => item.sourceType === "esco")?.sourceId;
    expect(escoSourceId).toMatch(/^esco-relation-v1\.2\.1-essential-/u);
    expect(fact?.provenance.sourceIds).toEqual(expect.arrayContaining([
      "user-answer-esco-acceptance-id",
      escoSourceId,
    ]));
    expect(response.brief.esco.skills).toContainEqual(expect.objectContaining({
      uri: SKILL_URI,
      conceptType: "skill",
      preferredLabel: SKILL_LABEL,
      alternativeLabels: [],
      language: "en",
      version: "v1.2.1",
      source: "official_esco",
    }));
  });

  it("does not duplicate an already accepted ESCO relation", () => {
    const valid = request();
    const first = editVacancyFactWithVerifiedEsco(
      { brief: valid.brief, fieldId: valid.fieldId, action: valid.action },
      verifiedAcceptance(),
    );
    const second = editVacancyFactWithVerifiedEsco(
      {
        brief: first.brief,
        fieldId: valid.fieldId,
        action: valid.action,
      },
      verifiedAcceptance(),
    );
    expect(second.brief.esco.skills).toHaveLength(1);
    expect(second.brief.esco.skills[0]).toMatchObject({
      uri: SKILL_URI,
      preferredLabel: SKILL_LABEL,
    });
  });

  it("rejects forged canonical metadata on a fact with valid signed ESCO evidence", async () => {
    const valid = request();
    const accepted = editVacancyFactWithVerifiedEsco(
      { brief: valid.brief, fieldId: valid.fieldId, action: valid.action },
      verifiedAcceptance(),
    );
    const forgedBrief = VacancyBriefSchema.parse({
      ...accepted.brief,
      facts: accepted.brief.facts.map((fact) => fact.fieldId === valid.fieldId
        ? {
          ...fact,
          status: "explicit",
          confidence: 0.42,
          provenance: {
            ...fact.provenance,
            origin: "esco",
            method: "esco_lookup",
          },
        }
        : fact),
    });
    const response = await editFactRoute(new Request("http://localhost/api/facts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: forgedBrief,
        fieldId: "company.name",
        action: { kind: "answer", value: "Example GmbH" },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_esco_attestation", retryable: false },
    });
  });

  it("removes stored ESCO concepts when a later skill edit removes their label", () => {
    const valid = request();
    const accepted = editVacancyFactWithVerifiedEsco(
      { brief: valid.brief, fieldId: valid.fieldId, action: valid.action },
      verifiedAcceptance(),
    );
    const edited = editVacancyFact({
      brief: accepted.brief,
      fieldId: "requirements.mustHaveSkills",
      action: { kind: "answer", value: ["SQL"] },
    });
    expect(edited.brief.esco.skills).toEqual([]);
    const editedFact = edited.brief.facts.find(
      (candidate) => candidate.fieldId === "requirements.mustHaveSkills",
    );
    expect(editedFact?.evidence.some((item) => item.sourceType === "esco")).toBe(false);
    expect(editedFact?.provenance.sourceIds.some(
      (sourceId) => sourceId.startsWith("esco-relation-"),
    )).toBe(false);
  });

  it("does not transfer an essential ESCO edge to the optional-skill field", () => {
    const valid = request();
    const accepted = editVacancyFactWithVerifiedEsco(
      { brief: valid.brief, fieldId: valid.fieldId, action: valid.action },
      verifiedAcceptance(),
    );
    const optionalEdit = editVacancyFact({
      brief: accepted.brief,
      fieldId: "requirements.niceToHaveSkills",
      action: { kind: "answer", value: [SKILL_LABEL] },
    });
    const moved = editVacancyFact({
      brief: optionalEdit.brief,
      fieldId: "requirements.mustHaveSkills",
      action: { kind: "answer", value: ["SQL"] },
    });

    expect(moved.brief.esco.skills).toEqual([]);
    const optionalFact = moved.brief.facts.find(
      (candidate) => candidate.fieldId === "requirements.niceToHaveSkills",
    );
    expect(optionalFact?.evidence.some((item) => item.sourceType === "esco")).toBe(false);
    expect(optionalFact?.provenance.sourceIds.some(
      (sourceId) => sourceId.startsWith("esco-relation-"),
    )).toBe(false);
  });

  it("keeps current signed ESCO evidence after more than 75 later edits", () => {
    const valid = request();
    let current = editVacancyFactWithVerifiedEsco(
      { brief: valid.brief, fieldId: valid.fieldId, action: valid.action },
      verifiedAcceptance(),
      { idFactory: () => "initial-esco-edit" },
    );

    for (let index = 0; index < 80; index += 1) {
      current = editVacancyFact({
        brief: current.brief,
        fieldId: "requirements.mustHaveSkills",
        action: { kind: "answer", value: ["SQL", SKILL_LABEL] },
      }, { idFactory: () => `later-edit-${index}` });
    }

    const fact = current.brief.facts.find(
      (candidate) => candidate.fieldId === "requirements.mustHaveSkills",
    );
    expect(current.brief.esco.skills).toHaveLength(1);
    expect(fact?.evidence).toHaveLength(75);
    expect(fact?.evidence.some((item) => item.sourceType === "esco")).toBe(true);
    expect(fact?.provenance.sourceIds.some(
      (sourceId) => sourceId.startsWith("esco-relation-"),
    )).toBe(true);
    expect(fact?.provenance.sourceIds.length).toBeLessThanOrEqual(75);
    expect(new Set(fact?.provenance.sourceIds)).toEqual(
      new Set(fact?.evidence.map((item) => item.sourceId)),
    );
  });

  it("rejects a shaped but forged signed skill on an unrelated generic edit", async () => {
    const valid = request();
    const accepted = editVacancyFactWithVerifiedEsco(
      { brief: valid.brief, fieldId: valid.fieldId, action: valid.action },
      verifiedAcceptance(),
    );
    const forgedBrief = VacancyBriefSchema.parse({
      ...accepted.brief,
      esco: {
        ...accepted.brief.esco,
        skills: accepted.brief.esco.skills.map((skill) => ({
          ...skill,
          preferredLabel: "forged official skill label",
        })),
      },
    });

    const response = await editFactRoute(new Request("http://localhost/api/facts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: forgedBrief,
        fieldId: "company.name",
        action: { kind: "answer", value: "Example GmbH" },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_esco_attestation", retryable: false },
    });
  });

  it.each([
    ["version", { version: "v9.9.9" }],
    ["alternative label", { alternativeLabels: ["fabricated alternative"] }],
    ["description", { description: "Fabricated official description." }],
    ["language", { language: "de" as const }],
  ])("rejects tampering with the signed skill %s", async (_label, skillPatch) => {
    const valid = request();
    const accepted = editVacancyFactWithVerifiedEsco(
      { brief: valid.brief, fieldId: valid.fieldId, action: valid.action },
      verifiedAcceptance(),
    );
    const forgedBrief = VacancyBriefSchema.parse({
      ...accepted.brief,
      esco: {
        ...accepted.brief.esco,
        skills: accepted.brief.esco.skills.map((skill) => ({ ...skill, ...skillPatch })),
      },
    });
    const response = await editFactRoute(new Request("http://localhost/api/facts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: forgedBrief,
        fieldId: "company.name",
        action: { kind: "answer", value: "Example GmbH" },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_esco_attestation", retryable: false },
    });
  });

  it("rejects a forged official occupation before re-analysis", async () => {
    const forgedOccupation = {
      ...unsignedPrimaryOccupation,
      attestation: {
        scheme: "hmac-sha256-v1" as const,
        scope: "occupation" as const,
        signature: "A".repeat(43),
      },
    };
    const forgedBrief = VacancyBriefSchema.parse({
      ...brief(),
      esco: {
        primaryOccupation: forgedOccupation,
        secondaryOccupations: [],
        skills: [],
      },
    });
    const response = await analyzeRoute(new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale: "en",
        jobAdText: "Data analyst role requiring SQL and careful reporting.",
        existingBrief: forgedBrief,
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_esco_attestation", retryable: false },
    });
  });

  it("rejects changing the locale of a brief with signed ESCO context", async () => {
    const response = await analyzeRoute(new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale: "de",
        jobAdText: "Data analyst role requiring SQL and careful reporting.",
        existingBrief: brief(),
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "brief_locale_mismatch", retryable: false },
    });
  });
});

describe("POST /api/esco/accept-skill", () => {
  it("persists provenance only after an exact live official relation match", async () => {
    const response = await acceptEscoSkillRoute(new Request(
      "http://localhost/api/esco/accept-skill",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request()),
      },
    ));
    expect(response.status).toBe(200);
    const payload = AnalysisResponseSchema.parse(await response.json());
    expect(getEscoRelationsMock).toHaveBeenCalledWith({
      occupationUri: OCCUPATION_URI,
      locale: "en",
      limitPerRelation: 50,
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(payload.brief.esco.skills.map((skill) => skill.uri)).toContain(SKILL_URI);
    expect(payload.brief.facts.find(
      (fact) => fact.fieldId === "requirements.mustHaveSkills",
    )?.evidence.some((evidence) => evidence.sourceType === "esco")).toBe(true);
  });

  it.each([
    ["skill URI", {
      escoCandidate: { skillUri: FORGED_SKILL_URI, label: "fabricated official skill" },
      action: { kind: "answer" as const, value: ["SQL", "fabricated official skill"] },
    }],
    ["localized label", {
      escoCandidate: { label: "different localized label" },
      action: { kind: "answer" as const, value: ["SQL", "different localized label"] },
    }],
    ["relation", {
      fieldId: "requirements.niceToHaveSkills" as const,
      escoCandidate: { relation: "optional" as const },
      action: { kind: "answer" as const, value: ["SQL", SKILL_LABEL] },
    }],
  ])("rejects a fabricated, well-shaped %s that the official API does not return", async (
    _case,
    patch,
  ) => {
    const valid = request();
    const response = await acceptEscoSkillRoute(new Request(
      "http://localhost/api/esco/accept-skill",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...valid,
          ...("fieldId" in patch ? { fieldId: patch.fieldId } : {}),
          escoCandidate: {
            ...valid.escoCandidate,
            ...patch.escoCandidate,
          },
          action: patch.action,
        }),
      },
    ));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "esco_relation_not_verified", retryable: false },
    });
  });

  it("fails closed when ESCO is unavailable and generic fact edits reject the candidate", async () => {
    getEscoRelationsMock.mockResolvedValueOnce({ status: "unavailable", skills: [] });
    const unavailable = await acceptEscoSkillRoute(new Request(
      "http://localhost/api/esco/accept-skill",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request()),
      },
    ));
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: "official_esco_unavailable", retryable: true },
    });

    const generic = await editFactRoute(new Request("http://localhost/api/facts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request()),
    }));
    expect(generic.status).toBe(400);
  });
});
