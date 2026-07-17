import { AnalysisResponseSchema, VACANCY_FIELD_IDS, type VacancyFact } from "@/lib/contracts";
import { fieldLabel, valueAsText } from "@/lib/client-analysis";
import type { Analysis, Fact, FactStatus, Locale } from "@/lib/client-types";

function localized(value: { de: string; en: string }, locale: Locale): string {
  return value[locale];
}

function uiStatus(fact: VacancyFact | undefined): FactStatus {
  if (!fact || fact.status === "missing") return "missing";
  if (fact.status === "conflict" || fact.hasConflict) return "conflict";
  if (fact.status === "user_confirmed") return "confirmed";
  if (fact.status === "not_applicable") return "not_applicable";
  if (fact.status === "declined") return "declined";
  return "proposed";
}

export function normalizeServerAnalysis(raw: unknown, locale: Locale): Analysis | null {
  const parsed = AnalysisResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const payload = parsed.data;
  const canonicalFacts = new Map(payload.brief.facts.map((fact) => [fact.fieldId, fact]));
  const facts: Fact[] = VACANCY_FIELD_IDS.map((fieldId) => {
    const canonical = canonicalFacts.get(fieldId);
    return {
      id: fieldId,
      label: fieldLabel(fieldId, locale),
      value: valueAsText(canonical?.value ?? null),
      rawValue: canonical?.value ?? null,
      status: uiStatus(canonical),
      canonicalStatus: canonical?.status ?? "missing",
      ...(canonical ? { confidence: canonical.confidence } : {}),
      evidence: canonical?.evidence ?? [],
      ...(canonical ? { provenance: canonical.provenance } : {}),
      ...(canonical?.conflictDescription
        ? { conflictDescription: localized(canonical.conflictDescription, locale) }
        : {}),
    };
  });
  const questions = payload.nextQuestions.map((question) => ({
    id: question.id,
    factId: question.fieldId,
    text: localized(question.wording, locale),
    rationale: localized(question.rationale, locale),
    answerType: question.answerType,
    mode: question.mode,
    priority: question.priority,
    allowNotApplicable: question.allowNotApplicable,
    options: question.options.map((option) => ({
      value: option.value,
      label: localized(option.label, locale),
    })),
  }));
  const titleFact = canonicalFacts.get("role.title");
  const title = payload.brief.title
    ?? (typeof titleFact?.value === "string" ? titleFact.value : undefined)
    ?? (locale === "de" ? "Unbenannte Vakanz" : "Untitled vacancy");
  const documented = facts.filter((fact) => fact.status !== "missing" && fact.status !== "declined").length;
  const escoOccupation = payload.brief.esco.primaryOccupation;
  const usesAi = payload.brief.facts.some((fact) => fact.provenance.method === "structured_extraction");

  return {
    analysisId: payload.analysisId,
    status: payload.status,
    title,
    summary: locale === "de"
      ? `${documented} von ${facts.length} Feldern dokumentiert · ${payload.completeness.score.toFixed(0)} % gewichtete Vollständigkeit.`
      : `${documented} of ${facts.length} fields documented · ${payload.completeness.score.toFixed(0)}% weighted completeness.`,
    facts,
    questions,
    canonicalQuestions: payload.nextQuestions,
    esco: escoOccupation ? {
      title: escoOccupation.preferredLabel,
      uri: escoOccupation.uri,
      version: escoOccupation.version,
      skills: payload.brief.esco.skills.map((skill) => skill.preferredLabel),
    } : null,
    mode: usesAi ? "ai" : "deterministic",
    brief: payload.brief,
    completeness: payload.completeness,
    warnings: payload.warnings,
  };
}
