import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import {
  AnalysisRequestSchema,
  AnalysisResponseSchema,
  VACANCY_FIELD_IDS,
  VacancyFactSchema,
  type AnalysisResponse,
  type LocalizedText,
  type VacancyBrief,
  type VacancyFact,
} from "@/lib/contracts";
import { assessCompleteness, selectNextQuestions } from "@/lib/domain/question-engine";
import {
  extractProposedVacancyFacts,
  type ProposedVacancyFact,
} from "@/lib/integrations/openai";
import {
  EscoProvenanceError,
  assertValidBriefEscoProvenance,
} from "@/lib/server/esco-provenance";

export const runtime = "nodejs";

const ARRAY_VALUE_FIELDS = new Set([
  "role.leadershipScope",
  "requirements.mustHaveSkills",
  "requirements.niceToHaveSkills",
  "compensation.benefits",
]);

const ENUM_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  "role.seniority": new Set(["entry", "junior", "mid", "senior", "lead", "executive"]),
  "role.employmentType": new Set(["permanent", "fixed_term", "contract", "internship"]),
  "role.workModel": new Set(["on_site", "hybrid", "remote"]),
};

const LEADERSHIP_VALUES = new Set(["none", "mentoring", "functional", "disciplinary"]);

const ENUM_EVIDENCE_TERMS: Readonly<Record<string, readonly string[]>> = {
  "role.seniority:entry": ["entry", "einstieg", "berufseinstieg"],
  "role.seniority:junior": ["junior"],
  "role.seniority:mid": ["mid", "professional"],
  "role.seniority:senior": ["senior"],
  "role.seniority:lead": ["lead", "leitung"],
  "role.seniority:executive": ["executive", "geschäftsleitung", "geschaeftsleitung"],
  "role.employmentType:permanent": ["permanent", "unbefristet"],
  "role.employmentType:fixed_term": ["fixed term", "fixed-term", "befristet"],
  "role.employmentType:contract": ["contract", "freelance", "freie mitarbeit"],
  "role.employmentType:internship": ["internship", "praktikum"],
  "role.workModel:on_site": ["on site", "on-site", "onsite", "vor ort"],
  "role.workModel:hybrid": ["hybrid"],
  "role.workModel:remote": ["remote"],
  "role.leadershipScope:none": ["none", "keine"],
  "role.leadershipScope:mentoring": ["mentoring", "mentor"],
  "role.leadershipScope:functional": ["functional", "fachlich"],
  "role.leadershipScope:disciplinary": ["disciplinary", "disziplinarisch"],
};

function errorResponse(status: number, code: string, message: string, retryable = false): NextResponse {
  return NextResponse.json({ error: { code, message, retryable } }, { status });
}

function redactPersonalDataPreservingOffsets(text: string): string {
  const mask = (value: string) => value.replace(/[^\r\n]/gu, "█");
  return text
    .replace(/\b(?:contact(?:\s+person)?|ansprechpartner(?:in)?|kontakt)\s*:\s*[^\r\n]+/giu, mask)
    .replace(/https?:\/\/(?:www\.)?(?:linkedin\.com|xing\.com)\/[^\s]+/giu, mask)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, mask)
    .replace(/(?:\+?\d[\d ()/.-]{6,}\d)/gu, (candidate, offset: number, source: string) => {
      const digitCount = candidate.replace(/\D/gu, "").length;
      const nearbyLabel = source.slice(Math.max(0, offset - 18), offset);
      const labelledAsPhone = /(?:tel(?:efon)?|phone|mobile|mobil)\s*:?\s*$/iu.test(nearbyLabel);
      const phoneFormatting = candidate.startsWith("+") || /[()/\s]/u.test(candidate);
      const likelySalaryRange = /^\d{2,3}(?:[.,]\d{3})?\s*-\s*\d{2,3}(?:[.,]\d{3})?$/u
        .test(candidate.trim());
      return digitCount >= 7 && !likelySalaryRange && (labelledAsPhone || phoneFormatting)
        ? mask(candidate)
        : candidate;
    });
}

function evidenceId(sourceId: string, fieldId: string, start: number, end: number): string {
  return `ev-${createHash("sha256")
    .update(`${sourceId}:${fieldId}:${start}:${end}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function hasDeterministicallyValidValueShape(proposal: ProposedVacancyFact): boolean {
  const { fieldId, value } = proposal;
  if (fieldId === "role.headcount") {
    return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10_000;
  }
  if (fieldId === "role.remoteShare" || fieldId === "role.travel") {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
  }
  if (ARRAY_VALUE_FIELDS.has(fieldId)) {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => !item.trim())) return false;
    return fieldId !== "role.leadershipScope" || value.every((item) => LEADERSHIP_VALUES.has(item));
  }
  if (typeof value !== "string" || !value.trim()) return false;
  return ENUM_VALUES[fieldId]?.has(value) ?? true;
}

function normalizedEvidenceText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}+#.-]+/gu, " ")
    .trim();
}

function containsNormalizedPhrase(haystack: string, needle: string): boolean {
  return Boolean(needle) && ` ${haystack} `.includes(` ${needle} `);
}

function textSupportsValue(fieldId: string, value: string, evidenceText: string): boolean {
  const canonicalTerms = ENUM_EVIDENCE_TERMS[`${fieldId}:${value}`];
  if (canonicalTerms) {
    return canonicalTerms.some((term) =>
      containsNormalizedPhrase(evidenceText, normalizedEvidenceText(term)),
    );
  }
  const normalizedValue = normalizedEvidenceText(value);
  if (!normalizedValue) return false;
  if (containsNormalizedPhrase(evidenceText, normalizedValue)) return true;
  const evidenceTerms = new Set(normalizedEvidenceText(evidenceText).split(" "));
  const valueTerms = normalizedValue.split(" ").filter((term) => term.length >= 2);
  return valueTerms.some((term) => evidenceTerms.has(term));
}

function evidenceSupportsProposedValue(
  proposal: ProposedVacancyFact,
  groundedQuotes: readonly string[],
): boolean {
  const evidenceText = normalizedEvidenceText(groundedQuotes.join(" "));
  if (typeof proposal.value === "number") {
    return evidenceText.split(" ").includes(String(proposal.value));
  }
  if (Array.isArray(proposal.value)) {
    return proposal.value.every((item) => textSupportsValue(proposal.fieldId, item, evidenceText));
  }
  return typeof proposal.value === "string" &&
    textSupportsValue(proposal.fieldId, proposal.value, evidenceText);
}

function proposalToFact(
  proposal: ProposedVacancyFact,
  options: {
    sourceId: string;
    sourceText: string;
    locale: "de" | "en";
    model: string | null;
    recordedAt: string;
  },
): VacancyFact | null {
  if (!hasDeterministicallyValidValueShape(proposal)) return null;
  const groundedProposalEvidence = proposal.evidence.filter(
    (item) =>
      item.sourceId === options.sourceId &&
      Number.isInteger(item.start) &&
      Number.isInteger(item.end) &&
      item.start >= 0 &&
      item.end > item.start &&
      item.end <= options.sourceText.length &&
      options.sourceText.slice(item.start, item.end) === item.quote,
  );
  if (
    groundedProposalEvidence.length === 0 ||
    !evidenceSupportsProposedValue(
      proposal,
      groundedProposalEvidence.map((item) => item.quote),
    )
  ) return null;
  const evidence = groundedProposalEvidence.map((item) => ({
    id: evidenceId(options.sourceId, proposal.fieldId, item.start, item.end),
    sourceId: options.sourceId,
    sourceType: "pasted_text" as const,
    quote: options.sourceText.slice(item.start, item.end),
    locator: { start: item.start, end: item.end },
    language: options.locale,
  }));
  const parsed = VacancyFactSchema.safeParse({
    fieldId: proposal.fieldId,
    value: proposal.value,
    // Exact grounding proves that text exists, not that the model interpreted it
    // correctly. AI proposals therefore always require deterministic user confirmation.
    status: "inferred",
    evidence,
    confidence: proposal.confidence,
    provenance: {
      origin: "job_ad",
      method: "structured_extraction",
      sourceIds: [options.sourceId],
      ...(options.model ? { model: options.model } : {}),
      promptVersion: "job_ad_fact_proposals_v2",
      recordedAt: options.recordedAt,
    },
    hasConflict: false,
  });
  return parsed.success ? parsed.data : null;
}

function valuesEqual(left: VacancyFact["value"], right: VacancyFact["value"]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueEvidence(facts: readonly VacancyFact[]): VacancyFact["evidence"] {
  const evidence = new Map<string, VacancyFact["evidence"][number]>();
  for (const fact of facts) {
    for (const item of fact.evidence) evidence.set(item.id, item);
  }
  return [...evidence.values()];
}

function mergeProvenance(
  current: VacancyFact["provenance"],
  proposed: VacancyFact["provenance"],
): VacancyFact["provenance"] {
  const sourceIds = [...new Set([...current.sourceIds, ...proposed.sourceIds])];
  if (
    current.origin === proposed.origin &&
    current.method === proposed.method &&
    current.model === proposed.model
  ) {
    return { ...current, sourceIds, recordedAt: proposed.recordedAt };
  }
  return {
    origin: "derived",
    method: "deterministic_rule",
    sourceIds,
    promptVersion: "fact_merge_v1",
    recordedAt: proposed.recordedAt,
  };
}

function mergeFact(current: VacancyFact | undefined, proposed: VacancyFact): VacancyFact {
  if (!current || current.status === "missing") return proposed;
  if (["user_confirmed", "not_applicable", "declined"].includes(current.status)) return current;

  if (valuesEqual(current.value, proposed.value)) {
    return VacancyFactSchema.parse({
      ...current,
      evidence: uniqueEvidence([current, proposed]),
      confidence: Math.max(current.confidence, proposed.confidence),
      status: current.status === "inferred" && proposed.status === "explicit" ? "explicit" : current.status,
      provenance: mergeProvenance(current.provenance, proposed.provenance),
    });
  }

  return VacancyFactSchema.parse({
    ...current,
    status: "conflict",
    evidence: uniqueEvidence([current, proposed]),
    confidence: Math.min(current.confidence, proposed.confidence),
    provenance: mergeProvenance(current.provenance, proposed.provenance),
    hasConflict: true,
    conflictDescription: {
      de: "Die vorhandene Angabe und die neue Stellenanzeigen-Evidenz widersprechen sich. Bitte prüfen und bestätigen.",
      en: "The existing value conflicts with new job-ad evidence. Please review and confirm.",
    },
  });
}

function mergeFacts(existing: readonly VacancyFact[], proposals: readonly VacancyFact[]): VacancyFact[] {
  const merged = new Map(existing.map((fact) => [fact.fieldId, fact]));
  for (const proposal of proposals) {
    merged.set(proposal.fieldId, mergeFact(merged.get(proposal.fieldId), proposal));
  }
  return [...merged.values()];
}

function createBrief(
  existingBrief: VacancyBrief | undefined,
  options: {
    locale: "de" | "en";
    facts: VacancyFact[];
    recordedAt: string;
  },
): VacancyBrief {
  const titleFact = options.facts.find(
    (fact) => fact.fieldId === "role.title" && typeof fact.value === "string",
  );
  return {
    id: existingBrief?.id ?? `vacancy-${randomUUID()}`,
    schemaVersion: "1.0",
    locale: options.locale,
    revision: (existingBrief?.revision ?? -1) + 1,
    ...(typeof titleFact?.value === "string" && titleFact.value.trim()
      ? { title: titleFact.value.trim() }
      : existingBrief?.title
        ? { title: existingBrief.title }
        : {}),
    facts: options.facts,
    esco: existingBrief?.esco ?? { secondaryOccupations: [], skills: [] },
    createdAt: existingBrief?.createdAt ?? options.recordedAt,
    updatedAt: options.recordedAt,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsedRequest = AnalysisRequestSchema.safeParse(rawBody);
  if (!parsedRequest.success) {
    return errorResponse(400, "invalid_request", "The analysis request is invalid.");
  }
  const input = parsedRequest.data;
  if (input.existingBrief && input.existingBrief.locale !== input.locale) {
    return errorResponse(
      400,
      "brief_locale_mismatch",
      "The existing brief locale must match the requested analysis locale.",
    );
  }
  if (input.existingBrief) {
    try {
      assertValidBriefEscoProvenance(input.existingBrief);
    } catch (error) {
      if (error instanceof EscoProvenanceError) {
        return errorResponse(error.status, error.code, error.message, error.retryable);
      }
      return errorResponse(400, "invalid_esco_attestation", "The ESCO provenance is invalid.");
    }
  }
  const recordedAt = new Date().toISOString();
  const warnings: LocalizedText[] = [];
  const sourceText = input.redactPersonalData
    ? redactPersonalDataPreservingOffsets(input.jobAdText)
    : input.jobAdText;
  if (input.redactPersonalData) {
    warnings.push({
      de: "Typische Kontaktzeilen, Profil-URLs, E-Mail-Adressen und Telefonnummern wurden vor der KI-Analyse maskiert. Bitte entfernen Sie weitere personenbezogene Angaben wie Namen oder Adressen vor dem Einfügen.",
      en: "Common contact lines, profile URLs, email addresses, and phone numbers were masked before AI analysis. Please remove other personal data such as names or addresses before pasting.",
    });
  }

  let extraction: Awaited<ReturnType<typeof extractProposedVacancyFacts>>;
  let extractionUnavailable = false;
  try {
    extraction = await extractProposedVacancyFacts({
      jobAdText: sourceText,
      locale: input.locale,
      allowedFieldIds: VACANCY_FIELD_IDS,
      sourceId: input.sourceId,
    });
  } catch {
    extractionUnavailable = true;
    extraction = { status: "not_configured", proposedFacts: [], model: null };
    warnings.push({
      de: "Die KI-Extraktion war vorübergehend nicht verfügbar. Der deterministische Fragenprozess bleibt vollständig nutzbar.",
      en: "AI extraction was temporarily unavailable. The deterministic question flow remains fully usable.",
    });
  }

  if (extraction.status === "not_configured" && !extractionUnavailable) {
    warnings.push({
      de: "Keine serverseitige OpenAI-Konfiguration gefunden. Es wurden keine KI-Fakten übernommen.",
      en: "No server-side OpenAI configuration was found. No AI facts were accepted.",
    });
  }

  const proposals: VacancyFact[] = [];
  let rejectedProposalCount = 0;
  for (const proposal of extraction.proposedFacts) {
    const fact = proposalToFact(proposal, {
      sourceId: input.sourceId,
      sourceText,
      locale: input.locale,
      model: extraction.model,
      recordedAt,
    });
    if (fact) proposals.push(fact);
    else rejectedProposalCount += 1;
  }
  if (rejectedProposalCount > 0) {
    warnings.push({
      de: `${rejectedProposalCount} KI-Vorschlag/-Vorschläge erfüllten den Faktenvertrag nicht und wurden verworfen.`,
      en: `${rejectedProposalCount} AI proposal(s) did not satisfy the fact contract and were discarded.`,
    });
  }

  const facts = mergeFacts(input.existingBrief?.facts ?? [], proposals);
  const brief = createBrief(input.existingBrief, {
    locale: input.locale,
    facts,
    recordedAt,
  });
  const completeness = assessCompleteness(brief);
  const nextQuestions = selectNextQuestions(brief, { locale: input.locale, limit: 3 });
  const status: AnalysisResponse["status"] = completeness.conflictFieldIds.length > 0
    ? "conflict"
    : completeness.readyForSummary
      ? "completed"
      : "needs_input";

  const response = AnalysisResponseSchema.parse({
    analysisId: `analysis-${randomUUID()}`,
    status,
    brief,
    completeness,
    nextQuestions,
    warnings,
  });
  return NextResponse.json(response, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
