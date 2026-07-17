import { createHash } from "node:crypto";

import {
  KnowledgeCitationSchema,
  KnowledgeSuggestionSchema,
  RecruitmentKnowledgeResponseSchema,
  type CorpusRetrievalStatus,
  type HistoricalSalaryBenchmark,
  type KnowledgeCitation,
  type KnowledgeCorpus,
  type KnowledgeSourceProvenance,
  type KnowledgeSuggestion,
  type LocalizedText,
  type RecruitmentKnowledgeRequest,
  type RecruitmentKnowledgeResponse,
} from "@/lib/contracts";
import {
  ESCO_VERSION,
  getEscoOccupationSkillRelations,
  type EscoOccupationSkillRelation,
} from "@/lib/integrations/esco";
import {
  safeVectorStoreError,
  retrieveHistoricalSalaryBenchmark,
  searchRecruitmentCorpus,
  type CorpusSearchResult,
} from "@/lib/integrations/vector-store";

const MAX_SUGGESTIONS = 12;

type CorpusSearcher = typeof searchRecruitmentCorpus;

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 24)}`;
}

function queryForCorpus(
  request: RecruitmentKnowledgeRequest,
  corpus: KnowledgeCorpus,
): string {
  const redactSensitiveQueryData = (value: string): string => value
    .replace(/https?:\/\/[^\s]+/giu, "[redacted-url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted-email]")
    .replace(/(?:\+?\d[\d ()/.-]{6,}\d)/gu, "[redacted-phone]");
  const context = [
    request.roleTitle,
    request.currentSkills.length > 0 ? request.currentSkills.join(", ") : undefined,
    request.seniority,
    request.companyLocationCode,
    request.locale,
  ]
    .filter((value): value is string => Boolean(value))
    .map(redactSensitiveQueryData);
  const intent = corpus === "esco"
    ? "ESCO occupation skill relations essential optional skills"
    : corpus === "job_postings"
      ? "job description responsibilities requirements qualifications skills"
      : "hiring trends salary labour market reference";
  return `${context.join("\n")}\n${intent}`.slice(0, 4_000);
}

function citationFrom(
  corpus: KnowledgeCorpus,
  sourceName: string,
  excerpt: string,
  score: number,
  provenance?: KnowledgeSourceProvenance,
): KnowledgeCitation {
  return KnowledgeCitationSchema.parse({
    id: stableId("citation", corpus, sourceName, excerpt, JSON.stringify(provenance ?? {})),
    corpus,
    sourceName,
    excerpt,
    score,
    ...(provenance ? { provenance } : {}),
  });
}

function localizedRationale(
  kind: KnowledgeSuggestion["kind"],
): LocalizedText {
  if (kind === "esco_skill") {
    return {
      de: "Offizielle ESCO-Beziehung zur bestätigten Occupation. Vor der Übernahme in den Bedarf trotzdem fachlich prüfen und ausdrücklich bestätigen.",
      en: "Official ESCO relation for the confirmed occupation. Still review its vacancy relevance and explicitly confirm it before acceptance.",
    };
  }
  if (kind === "job_posting_pattern") {
    return {
      de: "Semantisch ähnliches Stellenbeschreibungs-Muster. Nur als Formulierungs- und Prüfhilfe verwenden; es belegt keinen Bedarf dieser Vakanz.",
      en: "Semantically related job-description pattern. Use it only as a review and wording aid; it does not prove a requirement for this vacancy.",
    };
  }
  return {
    de: "Kontext aus einer gekennzeichneten Marktreferenz. Keine Live-Verfügbarkeit, Kandidatenzahl oder kausale Gehaltswirkung ableiten.",
    en: "Context from an attributed market reference. Do not infer live availability, candidate counts, or a causal salary effect.",
  };
}

function suggestionsFromReferences(
  request: RecruitmentKnowledgeRequest,
  references: readonly KnowledgeCitation[],
): KnowledgeSuggestion[] {
  const suggestions: KnowledgeSuggestion[] = [];

  const jobCitations = references
    .filter((item) => item.corpus === "job_postings")
    .slice(0, 3);
  if (jobCitations.length > 0) {
    const label = request.locale === "de"
      ? `Stellenbeschreibungs-Muster${request.roleTitle ? ` für ${request.roleTitle}` : ""} prüfen`
      : `Review job-description pattern${request.roleTitle ? ` for ${request.roleTitle}` : ""}`;
    suggestions.push(KnowledgeSuggestionSchema.parse({
      id: stableId("suggestion", "job_posting_pattern", ...jobCitations.map((item) => item.id)),
      kind: "job_posting_pattern",
      status: "suggestion_only",
      label,
      targetFieldId: "requirements.niceToHaveSkills",
      rationale: localizedRationale("job_posting_pattern"),
      citations: jobCitations,
    }));
  }

  const marketCitations = references
    .filter((item) => item.corpus === "market_reference")
    .slice(0, 3);
  if (marketCitations.length > 0) {
    const label = request.locale === "de"
      ? `Marktkontext${request.roleTitle ? ` für ${request.roleTitle}` : ""} prüfen`
      : `Review market context${request.roleTitle ? ` for ${request.roleTitle}` : ""}`;
    suggestions.push(KnowledgeSuggestionSchema.parse({
      id: stableId("suggestion", "market_context", ...marketCitations.map((item) => item.id)),
      kind: "market_context",
      status: "suggestion_only",
      label,
      rationale: localizedRationale("market_context"),
      citations: marketCitations,
    }));
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

function officialEscoSuggestions(
  request: RecruitmentKnowledgeRequest,
  skills: readonly EscoOccupationSkillRelation[],
): { suggestions: KnowledgeSuggestion[]; citations: KnowledgeCitation[] } {
  const existing = new Set(
    request.currentSkills.map((skill) => skill.toLocaleLowerCase().trim()),
  );
  const suggestions: KnowledgeSuggestion[] = [];
  const citations: KnowledgeCitation[] = [];
  for (const skill of skills) {
    if (existing.has(skill.preferredLabel.toLocaleLowerCase().trim())) continue;
    const relationLabel = skill.relation === "essential"
      ? request.locale === "de" ? "wesentliche Skill-Beziehung" : "essential skill relation"
      : request.locale === "de" ? "optionale Skill-Beziehung" : "optional skill relation";
    const citation = KnowledgeCitationSchema.parse({
      id: stableId("citation", "official_esco_api", skill.uri, skill.relation),
      corpus: "esco",
      sourceName: `ESCO ${ESCO_VERSION} Web Service API`,
      excerpt: `${relationLabel}: ${skill.preferredLabel}`,
      score: 1,
      authority: "official_esco_api",
      conceptUri: skill.uri,
      relation: skill.relation,
      provenance: {
        dataset: `ESCO ${ESCO_VERSION}`,
        source: "European Commission",
        language: request.locale,
        usagePolicy: "suggestion_only",
      },
    });
    citations.push(citation);
    suggestions.push(KnowledgeSuggestionSchema.parse({
      id: stableId("suggestion", "official_esco_api", skill.uri, skill.relation),
      kind: "esco_skill",
      status: "suggestion_only",
      label: skill.preferredLabel,
      targetFieldId: skill.relation === "essential"
        ? "requirements.mustHaveSkills"
        : "requirements.niceToHaveSkills",
      conceptUri: skill.uri,
      relation: skill.relation,
      sourceAuthority: "official_esco_api",
      rationale: localizedRationale("esco_skill"),
      citations: [citation],
    }));
    if (suggestions.length >= 10) break;
  }
  return { suggestions, citations };
}

function warningFor(
  corpus: KnowledgeCorpus,
  status: CorpusRetrievalStatus["status"],
): LocalizedText | null {
  const names: Record<KnowledgeCorpus, LocalizedText> = {
    esco: { de: "ESCO-Wissensbasis", en: "ESCO knowledge base" },
    job_postings: { de: "Stellenanzeigen-Referenzen", en: "job-posting references" },
    market_reference: { de: "Marktreferenzen", en: "market references" },
  };
  if (status === "not_configured") {
    return {
      de: `${names[corpus].de} ist nicht konfiguriert.`,
      en: `${names[corpus].en} is not configured.`,
    };
  }
  if (status === "unavailable") {
    return {
      de: `${names[corpus].de} ist vorübergehend nicht verfügbar.`,
      en: `${names[corpus].en} is temporarily unavailable.`,
    };
  }
  if (status === "filtered") {
    return {
      de: `Treffer aus ${names[corpus].de} wurden verworfen, weil die Quellenzuordnung nicht eindeutig war.`,
      en: `Results from ${names[corpus].en} were discarded because their corpus provenance was not explicit.`,
    };
  }
  return null;
}

/**
 * Retrieve independent corpora concurrently. The result contains references
 * and suggestion-only candidates; it has no path that mutates or promotes a
 * canonical vacancy fact.
 */
export async function enrichRecruitmentKnowledge(
  request: RecruitmentKnowledgeRequest,
  options: {
    search?: CorpusSearcher;
    getEscoRelations?: typeof getEscoOccupationSkillRelations;
    signal?: AbortSignal;
  } = {},
): Promise<RecruitmentKnowledgeResponse> {
  const search = options.search ?? searchRecruitmentCorpus;
  const getEscoRelations = options.getEscoRelations ?? getEscoOccupationSkillRelations;
  const salaryPromise = request.corpora.includes("market_reference")
    ? retrieveHistoricalSalaryBenchmark(
      {
        roleTitle: request.roleTitle,
        seniority: request.seniority,
        companyLocationCode: request.companyLocationCode,
      },
      { signal: options.signal },
    )
    : Promise.resolve({ status: "no_match" as const });
  const relationRequested = request.corpora.includes("esco") && Boolean(request.occupationUri);
  const escoRelationPromise = relationRequested && request.occupationUri
    ? getEscoRelations(
      { occupationUri: request.occupationUri, locale: request.locale },
      { signal: options.signal },
    )
    : Promise.resolve({ status: "available" as const, skills: [], warning: undefined });
  const [settled, salarySettled, relationSettled] = await Promise.all([
    Promise.allSettled(
      request.corpora.map((corpus) => search(
        {
          corpus,
          query: queryForCorpus(request, corpus),
          locale: request.locale,
          maxResults: request.maxResultsPerCorpus,
        },
        { signal: options.signal },
      )),
    ),
    Promise.allSettled([salaryPromise]),
    Promise.allSettled([escoRelationPromise]),
  ]);

  const statuses: CorpusRetrievalStatus[] = [];
  const references: KnowledgeCitation[] = [];
  const warnings: LocalizedText[] = [];
  let salaryBenchmark: HistoricalSalaryBenchmark | undefined;
  let salaryDegraded = false;
  let relationDegraded = false;
  let relationSuggestions: KnowledgeSuggestion[] = [];

  settled.forEach((result, index) => {
    const corpus = request.corpora[index];
    if (!corpus) return;
    if (result.status === "rejected") {
      // Map first so provider messages, IDs, and credentials can never cross
      // the public route boundary.
      safeVectorStoreError(result.reason);
      statuses.push({ corpus, status: "unavailable", resultCount: 0 });
      const warning = warningFor(corpus, "unavailable");
      if (warning) warnings.push(warning);
      return;
    }

    const retrieval: CorpusSearchResult = result.value;
    statuses.push({
      corpus,
      status: retrieval.status,
      resultCount: retrieval.chunks.length,
    });
    for (const chunk of retrieval.chunks) {
      references.push(citationFrom(
        chunk.corpus,
        chunk.sourceName,
        chunk.excerpt,
        chunk.score,
        chunk.provenance,
      ));
    }
    if (
      corpus === "job_postings" &&
      retrieval.chunks.some((chunk) =>
        !chunk.provenance?.rightsStatus || !chunk.provenance.privacyStatus
      )
    ) {
      warnings.push({
        de: "Bei diesen lizenzierten Stellenanzeigen fehlen noch explizite Rights-/Privacy-Freigaben. Nur im Owner-Demo-Kontext verwenden.",
        en: "These licensed job postings still lack explicit rights/privacy approvals. Use them only in the owner-demo context.",
      });
    }
    const warning = warningFor(corpus, retrieval.status);
    if (warning) warnings.push(warning);
  });

  const salaryResult = salarySettled[0];
  if (salaryResult?.status === "fulfilled") {
    if (salaryResult.value.status === "available") {
      salaryBenchmark = salaryResult.value.benchmark;
    }
    if (
      request.corpora.includes("market_reference") &&
      salaryResult.value.status === "not_configured"
    ) {
      salaryDegraded = true;
      warnings.push({
        de: "Die historische Gehaltsreferenz ist nicht konfiguriert.",
        en: "The historical salary reference is not configured.",
      });
    }
  } else if (salaryResult?.status === "rejected") {
    salaryDegraded = true;
    safeVectorStoreError(salaryResult.reason);
    warnings.push({
      de: "Die historische Gehaltsreferenz ist vorübergehend nicht verfügbar.",
      en: "The historical salary reference is temporarily unavailable.",
    });
  }

  const relationResult = relationSettled[0];
  if (relationRequested && relationResult?.status === "fulfilled") {
    relationDegraded = relationResult.value.status !== "available";
    const official = officialEscoSuggestions(request, relationResult.value.skills);
    relationSuggestions = official.suggestions;
    references.push(...official.citations);
    if (relationResult.value.warning) {
      warnings.push(relationResult.value.warning);
    }
  } else if (relationRequested && relationResult?.status === "rejected") {
    relationDegraded = true;
    warnings.push({
      de: "Offizielle ESCO-Skill-Beziehungen sind vorübergehend nicht verfügbar.",
      en: "Official ESCO skill relations are temporarily unavailable.",
    });
  } else if (request.corpora.includes("esco")) {
    warnings.push({
      de: "ESCO-Vector-Treffer dienen nur als Hintergrundreferenz. Für offizielle Skill-Beziehungen zuerst eine ESCO-Occupation bestätigen.",
      en: "ESCO vector matches are background references only. Confirm an ESCO occupation before retrieving official skill relations.",
    });
  }

  const suggestions = [
    ...relationSuggestions,
    ...suggestionsFromReferences(request, references),
  ].slice(0, MAX_SUGGESTIONS);
  const allNotConfigured = statuses.every((item) => item.status === "not_configured") &&
    relationSuggestions.length === 0;
  const degraded = statuses.some((item) =>
    ["not_configured", "unavailable", "filtered"].includes(item.status),
  ) || relationDegraded || salaryDegraded;
  const status: RecruitmentKnowledgeResponse["status"] = allNotConfigured
    ? "not_configured"
    : degraded
      ? "partial"
      : suggestions.length > 0
        ? "suggestions_available"
        : "no_suggestions";

  return RecruitmentKnowledgeResponseSchema.parse({
    status,
    mode: "suggestion_only",
    suggestions,
    references: references.slice(0, 24),
    ...(salaryBenchmark ? { salaryBenchmark } : {}),
    corpora: statuses,
    warnings,
  });
}
