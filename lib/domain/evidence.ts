import {
  EvidenceSchema,
  type Evidence,
  type EvidenceSourceType,
  type VacancyFact,
} from "../contracts";

export interface CreateTextEvidenceInput {
  id: string;
  sourceId: string;
  sourceType: EvidenceSourceType;
  sourceText: string;
  start: number;
  end: number;
  page?: number;
  language?: "de" | "en";
}

export function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function createTextEvidence(input: CreateTextEvidenceInput): Evidence {
  if (!Number.isInteger(input.start) || !Number.isInteger(input.end)) {
    throw new TypeError("Evidence offsets must be integers");
  }
  if (input.start < 0 || input.end <= input.start) {
    throw new RangeError("Evidence offsets must define a non-empty range");
  }
  if (input.end > input.sourceText.length) {
    throw new RangeError("Evidence end offset exceeds source text length");
  }

  return EvidenceSchema.parse({
    id: input.id,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    quote: input.sourceText.slice(input.start, input.end),
    locator: {
      start: input.start,
      end: input.end,
      ...(input.page === undefined ? {} : { page: input.page }),
    },
    ...(input.language === undefined ? {} : { language: input.language }),
  });
}

export function isEvidenceGrounded(
  evidence: Evidence,
  sourceText: string,
): boolean {
  const { start, end } = evidence.locator;
  if (start !== undefined && end !== undefined) {
    if (start < 0 || end > sourceText.length || end <= start) {
      return false;
    }
    return (
      normalizeEvidenceText(sourceText.slice(start, end)) ===
      normalizeEvidenceText(evidence.quote)
    );
  }

  return normalizeEvidenceText(sourceText).includes(
    normalizeEvidenceText(evidence.quote),
  );
}

export function getUngroundedEvidence(
  fact: VacancyFact,
  sources: Readonly<Record<string, string>>,
): Evidence[] {
  return fact.evidence.filter((evidence) => {
    const sourceText = sources[evidence.sourceId];
    return sourceText === undefined || !isEvidenceGrounded(evidence, sourceText);
  });
}

export function factHasGroundedEvidence(
  fact: VacancyFact,
  sources: Readonly<Record<string, string>>,
): boolean {
  if (fact.status === "user_confirmed") {
    return true;
  }
  if (fact.evidence.length === 0) {
    return false;
  }
  return fact.evidence.some((evidence) => {
    const sourceText = sources[evidence.sourceId];
    return sourceText !== undefined && isEvidenceGrounded(evidence, sourceText);
  });
}

export function mergeEvidence(
  current: readonly Evidence[],
  additions: readonly Evidence[],
): Evidence[] {
  const merged = new Map<string, Evidence>();
  for (const evidence of [...current, ...additions]) {
    const parsed = EvidenceSchema.parse(evidence);
    const existing = merged.get(parsed.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(parsed)) {
      throw new Error(`Evidence id ${parsed.id} refers to different evidence`);
    }
    merged.set(parsed.id, parsed);
  }
  return [...merged.values()];
}
