/**
 * Small, deterministic grounding utilities for untrusted vacancy text.
 *
 * This module never interprets source content as instructions. It only returns
 * exact character spans from a caller-provided document.
 */

export type GroundingSource = {
  sourceId: string;
  text: string;
};

export type EvidenceCandidate = {
  sourceId?: string;
  quote: string;
  start?: number;
  end?: number;
};

export type GroundedEvidence = {
  sourceId: string;
  quote: string;
  start: number;
  end: number;
};

export type RetrievedSpan = GroundedEvidence & {
  score: number;
  matchedTerms: string[];
};

const MAX_EVIDENCE_LENGTH = 700;
const MIN_EVIDENCE_LENGTH = 3;
const MAX_CHUNK_LENGTH = 1_000;

const STOP_WORDS = new Set([
  "aber",
  "also",
  "and",
  "are",
  "auf",
  "aus",
  "bei",
  "das",
  "dem",
  "den",
  "der",
  "die",
  "ein",
  "eine",
  "for",
  "from",
  "für",
  "ist",
  "mit",
  "oder",
  "that",
  "the",
  "this",
  "und",
  "von",
  "was",
  "werden",
  "with",
  "you",
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function tokenize(value: string): string[] {
  const matches = value.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{1,}/gu) ?? [];
  return [...new Set(matches.filter((term) => term.length > 2 && !STOP_WORDS.has(term)))];
}

function exactSpan(source: GroundingSource, candidate: EvidenceCandidate): GroundedEvidence | null {
  const quote = candidate.quote.trim();
  if (quote.length < MIN_EVIDENCE_LENGTH || quote.length > MAX_EVIDENCE_LENGTH) return null;
  if (candidate.sourceId && candidate.sourceId !== source.sourceId) return null;

  if (
    Number.isInteger(candidate.start) &&
    Number.isInteger(candidate.end) &&
    (candidate.start ?? -1) >= 0 &&
    (candidate.end ?? 0) > (candidate.start ?? 0) &&
    (candidate.end ?? 0) <= source.text.length
  ) {
    const start = candidate.start as number;
    const end = candidate.end as number;
    if (source.text.slice(start, end) === quote) {
      return { sourceId: source.sourceId, quote, start, end };
    }
  }

  const start = source.text.indexOf(quote);
  if (start < 0) return null;
  if (source.text.indexOf(quote, start + quote.length) >= 0) return null;
  return {
    sourceId: source.sourceId,
    quote,
    start,
    end: start + quote.length,
  };
}

/**
 * Accept evidence only when the quote is an exact span of the source document.
 * Model-authored paraphrases and fabricated quotes are discarded.
 */
export function groundEvidence(
  candidate: EvidenceCandidate,
  sources: readonly GroundingSource[],
): GroundedEvidence | null {
  if (candidate.sourceId) {
    const source = sources.find((item) => item.sourceId === candidate.sourceId);
    return source ? exactSpan(source, candidate) : null;
  }

  for (const source of sources) {
    const grounded = exactSpan(source, candidate);
    if (grounded) return grounded;
  }
  return null;
}

export function groundEvidenceList(
  candidates: readonly EvidenceCandidate[],
  sources: readonly GroundingSource[],
): GroundedEvidence[] {
  const seen = new Set<string>();
  const grounded: GroundedEvidence[] = [];
  for (const candidate of candidates) {
    const result = groundEvidence(candidate, sources);
    if (!result) continue;
    const key = `${result.sourceId}:${result.start}:${result.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    grounded.push(result);
  }
  return grounded;
}

type RawChunk = {
  quote: string;
  start: number;
  end: number;
};

function splitLongChunk(sourceText: string, start: number, end: number): RawChunk[] {
  const chunks: RawChunk[] = [];
  let cursor = start;
  while (cursor < end) {
    let chunkEnd = Math.min(cursor + MAX_CHUNK_LENGTH, end);
    if (chunkEnd < end) {
      const whitespace = sourceText.lastIndexOf(" ", chunkEnd);
      if (whitespace > cursor + Math.floor(MAX_CHUNK_LENGTH * 0.6)) chunkEnd = whitespace;
    }
    const raw = sourceText.slice(cursor, chunkEnd);
    const leading = raw.search(/\S/u);
    const trailing = raw.length - raw.trimEnd().length;
    if (leading >= 0) {
      const exactStart = cursor + leading;
      const exactEnd = chunkEnd - trailing;
      chunks.push({
        quote: sourceText.slice(exactStart, exactEnd),
        start: exactStart,
        end: exactEnd,
      });
    }
    cursor = Math.max(chunkEnd, cursor + 1);
    while (cursor < end && /\s/u.test(sourceText[cursor] ?? "")) cursor += 1;
  }
  return chunks;
}

function chunkSource(source: GroundingSource): RawChunk[] {
  const chunks: RawChunk[] = [];
  const paragraphPattern = /[^\n]+(?:\n|$)/gu;
  for (const match of source.text.matchAll(paragraphPattern)) {
    const raw = match[0];
    const rawStart = match.index ?? 0;
    const leading = raw.search(/\S/u);
    if (leading < 0) continue;
    const trailing = raw.length - raw.trimEnd().length;
    const start = rawStart + leading;
    const end = rawStart + raw.length - trailing;
    chunks.push(...splitLongChunk(source.text, start, end));
  }
  return chunks;
}

/** Return the most relevant exact source spans using transparent lexical scoring. */
export function retrieveGroundedSpans(
  query: string,
  sources: readonly GroundingSource[],
  options: { limit?: number } = {},
): RetrievedSpan[] {
  const queryTerms = tokenize(query);
  const normalizedQuery = normalizeWhitespace(query).toLocaleLowerCase();
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 12);
  const results: RetrievedSpan[] = [];

  for (const source of sources) {
    for (const chunk of chunkSource(source)) {
      const normalizedChunk = normalizeWhitespace(chunk.quote).toLocaleLowerCase();
      const matchedTerms = queryTerms.filter((term) => normalizedChunk.includes(term));
      const phraseBoost = normalizedQuery.length > 4 && normalizedChunk.includes(normalizedQuery) ? 2 : 0;
      const score = matchedTerms.length + phraseBoost;
      if (score <= 0) continue;
      results.push({
        sourceId: source.sourceId,
        quote: chunk.quote,
        start: chunk.start,
        end: chunk.end,
        score,
        matchedTerms,
      });
    }
  }

  return results
    .sort((left, right) => right.score - left.score || left.start - right.start)
    .slice(0, limit);
}

/**
 * Delimit untrusted text for a model prompt without allowing source-authored
 * closing tags to escape the data boundary.
 */
export function wrapUntrustedSource(source: GroundingSource): string {
  const safeSourceId = source.sourceId.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? "");
  const safeText = source.text.replace(
    /<\s*\/\s*untrusted_job_ad\s*>/giu,
    "&lt;/untrusted_job_ad&gt;",
  );
  return `<untrusted_job_ad source_id="${safeSourceId}">\n${safeText}\n</untrusted_job_ad>`;
}
