import { clientFieldIds, clientLabels, deterministicAnalysis, questionsFor } from "@/lib/client-analysis";
import type { Analysis, Fact, FactStatus, Locale } from "@/lib/client-types";

const canonicalToClient: Record<string, string> = {
  "role.title": "role_title",
  "role.purpose": "purpose",
  "tasks.outcomes": "responsibilities",
  "tasks.responsibilities": "responsibilities",
  "role.seniority": "seniority",
  "requirements.mustHaveSkills": "skills",
  "role.location": "location",
  "role.workModel": "work_model",
  "role.remoteShare": "work_model",
  "role.employmentType": "employment",
  "role.workingHours": "employment",
  "compensation.salaryRange": "salary",
  "role.leadershipScope": "leadership",
  "requirements.languages": "languages",
  "process.interviewStages": "process"
};

function uiFieldId(value: unknown): string {
  const id = String(value ?? "");
  return canonicalToClient[id] ?? id;
}

function fieldLabel(id: string, locale: Locale): string {
  const known = clientLabels[locale][id];
  if (known) return known;
  const leaf = id.split(".").at(-1) ?? id;
  return leaf.replace(/([a-z])([A-Z])/gu, "$1 $2").replace(/^./u, (letter) => letter.toUpperCase());
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (value && typeof value === "object" && "value" in value) {
    return asText((value as { value: unknown }).value);
  }
  return "";
}

function localized(value: unknown, locale: Locale): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return asText(record[locale] ?? record.en ?? record.de ?? record.value);
  }
  return asText(value);
}

export function normalizeServerAnalysis(raw: unknown, source: string, locale: Locale): Analysis {
  const base = deterministicAnalysis(source, locale);
  if (!raw || typeof raw !== "object") return base;
  const payload = raw as Record<string, unknown>;
  const brief = payload.brief && typeof payload.brief === "object"
    ? payload.brief as Record<string, unknown>
    : payload;
  const inputFacts = Array.isArray(brief.facts)
    ? brief.facts as Array<Record<string, unknown>>
    : [];
  const apiFacts = inputFacts.map((item, index): Fact => {
    const id = uiFieldId(item.fieldId ?? item.field_id ?? item.id ?? clientFieldIds[index] ?? "");
    const value = asText(item.value);
    const rawStatus = String(item.status ?? (value ? "proposed" : "missing"));
    const status: FactStatus = rawStatus === "user_confirmed" || rawStatus === "confirmed"
      ? "confirmed"
      : rawStatus === "conflict"
        ? "conflict"
        : ["explicit", "inferred", "proposed"].includes(rawStatus)
          ? "proposed"
          : "missing";
    const evidenceItem = Array.isArray(item.evidence) ? item.evidence[0] : item.evidence;
    const evidenceObject = evidenceItem && typeof evidenceItem === "object"
      ? evidenceItem as Record<string, unknown>
      : undefined;
    return {
      id,
      label: fieldLabel(id, locale),
      value,
      status,
      confidence: typeof item.confidence === "number" ? item.confidence : undefined,
      evidence: asText(evidenceObject?.quote ?? evidenceItem)
    };
  }).filter((fact) => fact.id);
  const facts = base.facts.map((fact) => apiFacts.find((candidate) => candidate.id === fact.id) ?? fact);
  for (const fact of apiFacts) {
    if (!facts.some((current) => current.id === fact.id)) facts.push(fact);
  }

  const questionPayload = payload.nextQuestions ?? payload.questions;
  const rawQuestions = Array.isArray(questionPayload)
    ? questionPayload as Array<Record<string, unknown>>
    : [];
  const questions = rawQuestions.map((item, index) => ({
    id: String(item.id ?? `api-${index}`),
    factId: uiFieldId(item.fieldId ?? item.field_id ?? item.factId ?? ""),
    text: localized(item.wording ?? item.text ?? item.prompt ?? item.title, locale),
    rationale: localized(item.rationale ?? item.why, locale),
    options: Array.isArray(item.options)
      ? item.options.map((option) => localized(option && typeof option === "object" ? (option as Record<string, unknown>).label ?? option : option, locale))
      : undefined
  })).filter((item) => item.factId && item.text);
  for (const question of questions) {
    if (!facts.some((fact) => fact.id === question.factId)) {
      facts.push({ id: question.factId, label: fieldLabel(question.factId, locale), value: "", status: "missing" });
    }
  }

  const briefEsco = brief.esco && typeof brief.esco === "object" ? brief.esco as Record<string, unknown> : undefined;
  const rawEsco = (Array.isArray(payload.escoSuggestions)
    ? payload.escoSuggestions[0]
    : payload.esco ?? briefEsco?.primaryOccupation) as Record<string, unknown> | undefined;
  const esco = rawEsco && asText(rawEsco.uri) ? {
    title: asText(rawEsco.preferredLabel ?? rawEsco.label ?? rawEsco.title),
    uri: asText(rawEsco.uri),
    confidence: typeof rawEsco.confidence === "number" ? rawEsco.confidence : null,
    skills: Array.isArray(rawEsco.skills) ? rawEsco.skills.map(asText) : []
  } : base.esco;

  return {
    title: asText(brief.title) || base.title,
    summary: asText(payload.summary) || base.summary,
    facts,
    questions: questions.length ? questions : questionsFor(facts, locale),
    esco,
    mode: apiFacts.length > 0 ? "ai" : "deterministic"
  };
}
