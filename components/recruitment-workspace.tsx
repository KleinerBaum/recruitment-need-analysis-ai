"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { IntakePanel } from "@/components/intake-panel";
import { KnowledgeIntelligence } from "@/components/knowledge-intelligence";
import { ClarifyPanel, SourceReview, WorkspaceNav } from "@/components/workspace-panels";
import { IntelligenceRail, ReviewPanel, ScenarioPanel } from "@/components/scenario-review";
import { answerFromText, valuesForField } from "@/lib/client-analysis";
import { normalizeServerAnalysis } from "@/lib/client-normalize";
import type { Analysis, Locale, ScenarioResult } from "@/lib/client-types";
import {
  MarketScenarioResultSchema,
  RecruitmentKnowledgeResponseSchema,
  type EscoConcept,
  type EscoSkillCandidate,
  type JsonValue,
  type KnowledgeSuggestion,
  type RecruitmentKnowledgeRequest,
  type RecruitmentKnowledgeResponse,
  type Seniority,
  type VacancyAnswerAction,
  type VacancyFieldId,
} from "@/lib/contracts";

type DemoAd = { id: string; title: string; language: Locale; location: string; text: string };
type EscoSearchPayload = {
  mode: "live" | "fallback";
  concepts: EscoConcept[];
  warning?: string;
};
type ArtifactKind = "brief" | "interview" | "ad";
type InputSource = { id: string; name?: string; type: "pasted_text" | "uploaded_file" | "source_url"; url?: string };
export type Translator = (en: string, de: string) => string;

const SENIORITY_VALUES = new Set<Seniority>(["entry", "junior", "mid", "senior", "lead", "executive"]);
const ARRAY_FIELDS = new Set<VacancyFieldId>([
  "role.leadershipScope",
  "requirements.mustHaveSkills",
  "requirements.niceToHaveSkills",
  "compensation.benefits",
]);
const NUMBER_FIELDS = new Set<VacancyFieldId>(["role.headcount", "role.remoteShare", "role.travel"]);

function Brand() {
  return <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>needly</span></div>;
}

function documentedLines(analysis: Analysis, ids: readonly VacancyFieldId[]): string[] {
  return ids.flatMap((id) => {
    const fact = analysis.facts.find((candidate) => candidate.id === id);
    return fact?.value ? [`${fact.label}: ${fact.value}`] : [];
  });
}

function generatedArtifact(analysis: Analysis, artifact: ArtifactKind, tr: Translator): string {
  if (artifact === "interview") {
    const assessable = [
      "tasks.outcomes",
      "requirements.mustHaveSkills",
      "requirements.experience",
      "role.leadershipScope",
      "success.metrics",
    ] as const;
    const targets = assessable.flatMap((id) => {
      const fact = analysis.facts.find((candidate) => candidate.id === id);
      return fact?.value ? [fact] : [];
    });
    return [
      tr(`Structured interview kit — ${analysis.title}`, `Strukturierter Interviewleitfaden — ${analysis.title}`),
      tr("Use the same core questions and anchored scoring for every candidate.", "Nutzen Sie für alle Kandidat:innen dieselben Kernfragen und Bewertungsanker."),
      "",
      ...targets.flatMap((fact, index) => [
        `${index + 1}. ${fact.label}`,
        tr(`Question: Tell us about a concrete situation that demonstrates: ${fact.value}`, `Frage: Schildern Sie eine konkrete Situation, die Folgendes belegt: ${fact.value}`),
        tr("Probe: What was your role, what did you do, and what measurable result followed?", "Vertiefung: Was war Ihre Rolle, was haben Sie getan und welches messbare Ergebnis folgte?"),
        tr("Score 1: no relevant example · 3: relevant example with clear contribution · 5: repeatable evidence with measured impact", "Bewertung 1: kein relevanter Beleg · 3: relevanter Beleg mit klarem Beitrag · 5: wiederholbarer Beleg mit messbarer Wirkung"),
        "",
      ]),
      tr("Guardrail: evaluate job evidence only; never ask about protected personal characteristics.", "Leitplanke: Nur berufliche Evidenz bewerten; nie nach geschützten persönlichen Merkmalen fragen."),
    ].join("\n");
  }

  if (artifact === "ad") {
    const sections: Array<[string, readonly VacancyFieldId[]]> = [
      [tr("Why this role", "Warum diese Rolle"), ["role.purpose", "company.context"]],
      [tr("Outcomes and responsibilities", "Ergebnisse und Verantwortung"), ["tasks.outcomes", "tasks.responsibilities"]],
      [tr("Essential profile", "Unverzichtbares Profil"), ["requirements.mustHaveSkills", "requirements.experience", "requirements.languages", "requirements.certifications"]],
      [tr("Useful, but learnable", "Hilfreich, aber erlernbar"), ["requirements.niceToHaveSkills", "requirements.education"]],
      [tr("Working conditions", "Rahmenbedingungen"), ["role.location", "role.workModel", "role.remoteShare", "role.workingHours", "role.travel", "role.employmentType"]],
      [tr("Offer and process", "Angebot und Prozess"), ["compensation.salaryRange", "compensation.benefits", "process.interviewStages", "process.timeline"]],
    ];
    return [
      analysis.title,
      "",
      ...sections.flatMap(([heading, ids]) => {
        const lines = documentedLines(analysis, ids);
        return lines.length ? [heading, ...lines.map((line) => `- ${line}`), ""] : [];
      }),
      tr("This outline contains documented information only. Confirm every item before publishing.", "Diese Outline enthält ausschließlich dokumentierte Angaben. Vor Veröffentlichung bitte alles bestätigen."),
    ].join("\n");
  }

  const sectionOrder = ["company", "role", "tasks", "requirements", "compensation", "process", "success"];
  return [
    tr(`Hiring brief — ${analysis.title}`, `Hiring Brief — ${analysis.title}`),
    analysis.summary,
    "",
    ...sectionOrder.flatMap((section) => {
      const rows = analysis.facts.filter((fact) => fact.id.startsWith(`${section}.`));
      return [
        section.toLocaleUpperCase(),
        ...rows.map((fact) => `${fact.label}: ${fact.value || tr("Not documented", "Nicht dokumentiert")} [${fact.canonicalStatus}]`),
        "",
      ];
    }),
    `ESCO: ${analysis.esco ? `${analysis.esco.title} · ${analysis.esco.uri} · ${analysis.esco.version}` : tr("Not confirmed", "Nicht bestätigt")}`,
  ].join("\n");
}

function editorValue(fieldId: VacancyFieldId, value: string): string | number | string[] {
  const trimmed = value.trim();
  if (ARRAY_FIELDS.has(fieldId)) {
    return trimmed.split(/[\n,;]+/u).map((item) => item.trim()).filter(Boolean);
  }
  if (NUMBER_FIELDS.has(fieldId)) return Number(trimmed.replace(",", "."));
  return trimmed;
}

function roleTitleForEsco(analysis: Analysis | null): string {
  const value = analysis?.facts.find((fact) => fact.id === "role.title")?.rawValue;
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function regionForKnowledge(value: JsonValue): string {
  if (typeof value !== "string") return "";
  const segments = value
    .replace(/\s+/gu, " ")
    .split(/[,;|]/u)
    .map((segment) => segment.trim())
    .filter((segment) => (
      segment.length > 0
      && segment.length <= 80
      && !/\d/u.test(segment)
      && !/(?:avenue|road|street|strasse|straße|\bweg\b)/iu.test(segment)
    ));
  return segments.slice(-2).join(", ").slice(0, 160);
}

function companyLocationCodeForKnowledge(value: JsonValue): string | undefined {
  if (typeof value !== "string") return undefined;
  const lastSegment = value
    .split(/[,;|]/u)
    .at(-1)
    ?.replace(/[()]/gu, "")
    .trim();
  if (lastSegment && /^[A-Z]{2}$/u.test(lastSegment)) return lastSegment;
  const normalized = value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}]+/gu, " ")
    .trim();
  const aliases: ReadonlyArray<readonly [RegExp, string]> = [
    [/\b(?:deutschland|germany)\b/u, "DE"],
    [/\b(?:osterreich|austria)\b/u, "AT"],
    [/\b(?:schweiz|switzerland)\b/u, "CH"],
    [/\b(?:vereinigtes konigreich|united kingdom|great britain)\b/u, "GB"],
    [/\b(?:vereinigte staaten|united states|usa)\b/u, "US"],
    [/\b(?:kanada|canada)\b/u, "CA"],
    [/\b(?:spanien|spain)\b/u, "ES"],
    [/\b(?:frankreich|france)\b/u, "FR"],
    [/\b(?:niederlande|netherlands)\b/u, "NL"],
  ];
  return aliases.find(([pattern]) => pattern.test(normalized))?.[1];
}

function knowledgeRequestFor(
  analysis: Analysis | null,
  locale: Locale,
): RecruitmentKnowledgeRequest | null {
  if (!analysis) return null;
  const roleTitle = roleTitleForEsco(analysis) || analysis.esco?.title || analysis.title.trim();
  const seniorityValue = analysis.facts.find((fact) => fact.id === "role.seniority")?.rawValue;
  const locationValue = analysis.facts.find((fact) => fact.id === "role.location")?.rawValue;
  const region = regionForKnowledge(locationValue ?? null);
  const companyLocationCode = companyLocationCodeForKnowledge(locationValue ?? null);
  const skillsByKey = new Map<string, string>();
  for (const skill of [
    ...valuesForField(analysis.facts, "requirements.mustHaveSkills"),
    ...valuesForField(analysis.facts, "requirements.niceToHaveSkills"),
  ]) {
    const normalized = skill.toLocaleLowerCase().trim();
    if (normalized && !skillsByKey.has(normalized)) skillsByKey.set(normalized, skill.trim());
  }
  const currentSkills = [...skillsByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, skill]) => skill)
    .slice(0, 50);
  const context = [
    roleTitle ? `${locale === "de" ? "Rolle" : "Role"}: ${roleTitle}` : "",
    analysis.esco
      ? `ESCO: ${analysis.esco.title} · ${analysis.esco.uri}`
      : "",
    currentSkills.length > 0
      ? `${locale === "de" ? "Dokumentierte Skills" : "Documented skills"}: ${currentSkills.join(", ")}`
      : "",
    typeof seniorityValue === "string"
      ? `${locale === "de" ? "Seniorität" : "Seniority"}: ${seniorityValue}`
      : "",
    region ? `Region: ${region}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 4_000);

  if (context.length < 3) return null;
  return {
    locale,
    query: context,
    ...(roleTitle ? { roleTitle } : {}),
    ...(analysis.esco?.uri ? { occupationUri: analysis.esco.uri } : {}),
    ...(typeof seniorityValue === "string" && SENIORITY_VALUES.has(seniorityValue as Seniority)
      ? { seniority: seniorityValue as Seniority }
      : {}),
    ...(companyLocationCode ? { companyLocationCode } : {}),
    currentSkills,
    corpora: ["esco", "job_postings", "market_reference"],
    maxResultsPerCorpus: 4,
  };
}

function titlesMatch(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function invalidateEscoAfterTitleChange(previous: Analysis, next: Analysis): Analysis {
  const previousTitle = roleTitleForEsco(previous);
  const nextTitle = roleTitleForEsco(next);
  if (!previous.esco || !next.esco || titlesMatch(previousTitle, nextTitle)) return next;

  return {
    ...next,
    esco: null,
    brief: {
      ...next.brief,
      revision: next.brief.revision + 1,
      updatedAt: new Date().toISOString(),
      esco: { secondaryOccupations: [], skills: [] },
    },
  };
}

function relocalizeAnalysis(current: Analysis, nextLocale: Locale): Analysis {
  const localeChanged = current.brief.locale !== nextLocale;
  const brief = localeChanged
    ? {
        ...current.brief,
        locale: nextLocale,
        revision: current.brief.revision + 1,
        updatedAt: new Date().toISOString(),
      }
    : current.brief;
  return normalizeServerAnalysis({
    analysisId: current.analysisId,
    status: current.status,
    brief,
    completeness: current.completeness,
    nextQuestions: current.canonicalQuestions,
    warnings: current.warnings,
  }, nextLocale) ?? current;
}

export function RecruitmentWorkspace({ demoAds }: { demoAds: readonly DemoAd[] }) {
  const [locale, setLocale] = useState<Locale>("en");
  const localeRef = useRef<Locale>("en");
  const [jobAd, setJobAd] = useState("");
  const [inputSource, setInputSource] = useState<InputSource>({ id: "job-ad", type: "pasted_text" });
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const analysisRef = useRef<Analysis | null>(null);
  const analysisGenerationRef = useRef(0);
  const briefMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [loading, setLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<RecruitmentKnowledgeResponse | null>(null);
  const [knowledgeSignature, setKnowledgeSignature] = useState<string | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeRefresh, setKnowledgeRefresh] = useState(0);
  const [acceptingSuggestionId, setAcceptingSuggestionId] = useState<string | null>(null);
  const knowledgeGenerationRef = useRef(0);
  const [searchRadiusKm, setSearchRadiusKm] = useState(50);
  const [remoteSharePercent, setRemoteSharePercent] = useState(0);
  const [seniority, setSeniority] = useState<Seniority>("mid");
  const [escoCandidates, setEscoCandidates] = useState<EscoConcept[]>([]);
  const [escoWarning, setEscoWarning] = useState<string | null>(null);
  const escoCandidateTitleRef = useRef<string | null>(null);
  const [artifact, setArtifact] = useState<ArtifactKind>("brief");
  const [artifactDrafts, setArtifactDrafts] = useState<Partial<Record<ArtifactKind, string>>>({});
  const [copied, setCopied] = useState(false);
  const tr: Translator = useCallback((en, de) => locale === "de" ? de : en, [locale]);

  useEffect(() => {
    localeRef.current = locale;
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  const facts = useMemo(() => analysis?.facts ?? [], [analysis?.facts]);
  const completion = analysis?.completeness.score ?? 0;
  const question = analysis?.questions[questionIndex];
  const canonicalRoleTitle = useMemo(() => roleTitleForEsco(analysis), [analysis]);
  const analysisReady = analysis !== null;
  const escoConfirmed = Boolean(analysis?.esco);
  const mustHaveSkills = useMemo(
    () => valuesForField(facts, "requirements.mustHaveSkills"),
    [facts],
  );
  const skills = useMemo(() => [...new Set([
    ...valuesForField(facts, "requirements.niceToHaveSkills"),
    ...(analysis?.esco?.skills ?? []),
    ...selectedSkills,
  ])].slice(0, 12), [analysis?.esco?.skills, facts, selectedSkills]);
  const defaultArtifactText = useMemo(
    () => analysis ? generatedArtifact(analysis, artifact, tr) : "",
    [analysis, artifact, tr],
  );
  const artifactText = artifactDrafts[artifact] ?? defaultArtifactText;
  const knowledgeRequestJson = useMemo(
    () => {
      const request = knowledgeRequestFor(analysis, locale);
      return request ? JSON.stringify(request) : null;
    },
    [analysis, locale],
  );
  const visibleKnowledge = knowledgeSignature === knowledgeRequestJson ? knowledge : null;
  const acceptedKnowledgeSkillIds = useMemo(() => {
    const accepted = new Set<string>();
    if (!visibleKnowledge || !analysis) return accepted;
    for (const suggestion of visibleKnowledge.suggestions) {
      if (suggestion.kind !== "esco_skill" || !suggestion.targetFieldId) continue;
      if (
        suggestion.targetFieldId !== "requirements.mustHaveSkills"
        && suggestion.targetFieldId !== "requirements.niceToHaveSkills"
      ) continue;
      const values = valuesForField(analysis.facts, suggestion.targetFieldId);
      if (values.some((value) => value.toLocaleLowerCase() === suggestion.label.toLocaleLowerCase())) {
        accepted.add(suggestion.id);
      }
    }
    return accepted;
  }, [analysis, visibleKnowledge]);

  useEffect(() => {
    if (!knowledgeRequestJson) {
      queueMicrotask(() => {
        setKnowledge(null);
        setKnowledgeSignature(null);
        setKnowledgeLoading(false);
        setKnowledgeError(null);
      });
      return;
    }
    const request = JSON.parse(knowledgeRequestJson) as RecruitmentKnowledgeRequest;
    const controller = new AbortController();
    const requestGeneration = knowledgeGenerationRef.current + 1;
    knowledgeGenerationRef.current = requestGeneration;
    const analysisGeneration = analysisGenerationRef.current;
    const activeLocale = request.locale;
    let active = true;
    queueMicrotask(() => {
      if (!active || controller.signal.aborted) return;
      setKnowledge(null);
      setKnowledgeSignature(null);
      setKnowledgeLoading(true);
      setKnowledgeError(null);
    });

    const debounce = window.setTimeout(() => {
      fetch("/api/knowledge/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: knowledgeRequestJson,
      })
      .then(async (response) => {
        const payload: unknown = await response.json();
        const parsed = RecruitmentKnowledgeResponseSchema.safeParse(payload);
        if (!response.ok || !parsed.success) throw new Error("invalid_knowledge_response");
        return parsed.data;
      })
      .then((payload) => {
        if (
          !active
          || controller.signal.aborted
          || knowledgeGenerationRef.current !== requestGeneration
          || analysisGenerationRef.current !== analysisGeneration
        ) return;
        setKnowledge(payload);
        setKnowledgeSignature(knowledgeRequestJson);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (
          !active
          || controller.signal.aborted
          || knowledgeGenerationRef.current !== requestGeneration
          || analysisGenerationRef.current !== analysisGeneration
        ) return;
        setKnowledgeError(activeLocale === "de"
          ? "Die Wissensquellen konnten vorübergehend nicht abgerufen werden. Das Briefing bleibt unverändert."
          : "Knowledge sources could not be retrieved temporarily. The brief remains unchanged.");
      })
      .finally(() => {
        if (
          active
          && !controller.signal.aborted
          && knowledgeGenerationRef.current === requestGeneration
          && analysisGenerationRef.current === analysisGeneration
        ) setKnowledgeLoading(false);
      });
    }, 450);

    return () => {
      active = false;
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [knowledgeRefresh, knowledgeRequestJson]);

  useEffect(() => {
    let active = true;
    escoCandidateTitleRef.current = null;
    queueMicrotask(() => {
      if (!active) return;
      setEscoCandidates([]);
      setEscoWarning(null);
    });
    if (!analysisReady || escoConfirmed || !canonicalRoleTitle) {
      return () => {
        active = false;
      };
    }

    const controller = new AbortController();
    const activeLocale = locale;
    const requestedTitle = canonicalRoleTitle;
    const debounce = window.setTimeout(() => {
      fetch(`/api/esco/search?q=${encodeURIComponent(requestedTitle)}&locale=${activeLocale}&type=occupation&limit=3`, {
        signal: controller.signal,
      })
        .then(async (response) => response.ok ? await response.json() as EscoSearchPayload : null)
        .then((payload) => {
          if (!active || !payload || controller.signal.aborted) return;
          escoCandidateTitleRef.current = requestedTitle;
          setEscoCandidates(payload.concepts ?? []);
          setEscoWarning(payload.warning ?? null);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (!active || controller.signal.aborted) return;
          setEscoWarning(activeLocale === "de"
            ? "Die offizielle ESCO-Suche ist vorübergehend nicht verfügbar."
            : "Official ESCO search is temporarily unavailable.");
        });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [analysisReady, canonicalRoleTitle, escoConfirmed, locale]);

  useEffect(() => {
    if (!analysis) return;
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setScenarioLoading(true);
      setScenarioError(null);
    });
    fetch("/api/scenario", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        briefId: analysis.brief.id,
        searchRadiusKm,
        remoteSharePercent,
        seniority,
        mustHaveSkills,
        addedMustHaveSkills: selectedSkills,
      }),
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        const parsed = MarketScenarioResultSchema.safeParse(payload);
        if (!response.ok || !parsed.success) throw new Error("invalid_scenario");
        setScenario(parsed.data);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setScenario(null);
        setScenarioError(tr("The transparent scenario is temporarily unavailable.", "Das transparente Szenario ist vorübergehend nicht verfügbar."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setScenarioLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [analysis, mustHaveSkills, remoteSharePercent, searchRadiusKm, selectedSkills, seniority, tr]);

  function chooseDemo(id: string) {
    const demo = demoAds.find((item) => item.id === id);
    if (!demo) return;
    setSelectedDemo(id);
    localeRef.current = demo.language;
    setLocale(demo.language);
    setJobAd(demo.text);
    setInputSource({ id: `demo-${demo.id}`, name: demo.title, type: "pasted_text" });
    setAnalysisError(null);
  }

  function updateJobAd(value: string) {
    setJobAd(value);
    setSelectedDemo(null);
    setInputSource({ id: "job-ad", type: "pasted_text" });
    setAnalysisError(null);
  }

  function resolveInputSource(text: string, source: InputSource) {
    setJobAd(text);
    setInputSource(source);
    setSelectedDemo(null);
    setAnalysisError(null);
  }

  function switchLocale() {
    const nextLocale = locale === "en" ? "de" : "en";
    localeRef.current = nextLocale;
    setLocale(nextLocale);
    setAnalysis((current) => {
      if (!current) return current;
      const relocalized = relocalizeAnalysis(current, nextLocale);
      analysisRef.current = relocalized;
      return relocalized;
    });
  }

  async function analyse() {
    if (jobAd.trim().length < 40) return;
    const generation = analysisGenerationRef.current + 1;
    analysisGenerationRef.current = generation;
    const analysisLocale = localeRef.current;
    setLoading(true);
    setAnalysisError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobAdText: jobAd,
          locale: analysisLocale,
          sourceId: inputSource.id,
          ...(inputSource.name ? { sourceName: inputSource.name } : {}),
          sourceType: inputSource.type,
          ...(inputSource.url ? { sourceUrl: inputSource.url } : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (analysisGenerationRef.current !== generation) return;
      const parsed = response.ok ? normalizeServerAnalysis(payload, analysisLocale) : null;
      if (!parsed) throw new Error("invalid_analysis");
      const normalized = relocalizeAnalysis(parsed, localeRef.current);
      analysisRef.current = normalized;
      setAnalysis(normalized);
      setStep(1);
      setQuestionIndex(0);
      setSelectedSkills([]);
      setKnowledge(null);
      setKnowledgeSignature(null);
      setKnowledgeError(null);
      setAcceptingSuggestionId(null);
      setArtifactDrafts({});
      escoCandidateTitleRef.current = null;
      const remoteValue = normalized.facts.find((fact) => fact.id === "role.remoteShare")?.rawValue;
      const workModel = normalized.facts.find((fact) => fact.id === "role.workModel")?.rawValue;
      setRemoteSharePercent(typeof remoteValue === "number"
        ? Math.round(remoteValue)
        : workModel === "remote" ? 100 : workModel === "hybrid" ? 40 : 0);
      const seniorityValue = normalized.facts.find((fact) => fact.id === "role.seniority")?.rawValue;
      setSeniority(typeof seniorityValue === "string" && SENIORITY_VALUES.has(seniorityValue as Seniority)
        ? seniorityValue as Seniority
        : "mid");
    } catch {
      if (analysisGenerationRef.current !== generation) return;
      analysisRef.current = null;
      setAnalysis(null);
      setAnalysisError(tr(
        "The analysis could not be completed. No heuristic facts were substituted; please retry.",
        "Die Analyse konnte nicht abgeschlossen werden. Es wurden keine heuristischen Fakten eingesetzt; bitte erneut versuchen.",
      ));
    } finally {
      if (analysisGenerationRef.current === generation) setLoading(false);
    }
  }

  async function saveAnswer(kind: "answer" | "declined" | "not_applicable" = "answer") {
    if (!analysis || !question || answerLoading) return;
    const generation = analysisGenerationRef.current;
    const requestedQuestion = question;
    const action = kind === "answer"
      ? { kind, value: answerFromText(requestedQuestion, answer) }
      : { kind };
    setAnswerLoading(true);
    setAnswerError(null);
    const queuedMutation = briefMutationQueueRef.current.then(async () => {
      let current = analysisRef.current;
      if (!current || analysisGenerationRef.current !== generation) return;
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await fetch("/api/answer", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              brief: current.brief,
              questionId: requestedQuestion.id,
              fieldId: requestedQuestion.factId,
              action,
            }),
          });
          const payload: unknown = await response.json();
          if (analysisGenerationRef.current !== generation) return;
          const latest = analysisRef.current;
          if (!latest || latest.brief.id !== current.brief.id) return;
          if (latest.brief.revision !== current.brief.revision) {
            current = latest;
            continue;
          }

          const normalized = response.ok
            ? normalizeServerAnalysis(payload, localeRef.current)
            : null;
          if (!normalized) throw new Error("invalid_answer");
          normalized.warnings = [...current.warnings, ...normalized.warnings];
          const reconciled = invalidateEscoAfterTitleChange(current, normalized);
          analysisRef.current = reconciled;
          setAnalysis(reconciled);
          setAnswer("");
          setWhyOpen(false);
          setQuestionIndex(0);
          if (normalized.questions.length === 0) setStep(3);
          return;
        }
        throw new Error("concurrent_answer");
      } catch {
        if (analysisGenerationRef.current !== generation) return;
        setAnswerError(tr("The answer could not be saved. Please check its format and retry.", "Die Antwort konnte nicht gespeichert werden. Bitte Format prüfen und erneut versuchen."));
      }
    });
    briefMutationQueueRef.current = queuedMutation.catch(() => undefined);
    await queuedMutation;
    if (analysisGenerationRef.current === generation) setAnswerLoading(false);
  }

  function updateFact(id: VacancyFieldId, value: string): Promise<void> {
    return editFact(id, value.trim()
      ? { kind: "answer", value: editorValue(id, value) }
      : { kind: "declined" });
  }

  function editFact(
    id: VacancyFieldId,
    action: VacancyAnswerAction,
    escoCandidate?: EscoSkillCandidate,
  ): Promise<void> {
    const generation = analysisGenerationRef.current;
    const queuedMutation = briefMutationQueueRef.current.then(async () => {
      let current = analysisRef.current;
      if (!current || analysisGenerationRef.current !== generation) return;
      setAnswerError(null);

      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await fetch(escoCandidate ? "/api/esco/accept-skill" : "/api/facts", {
            method: escoCandidate ? "POST" : "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              brief: current.brief,
              fieldId: id,
              action,
              ...(escoCandidate ? { escoCandidate } : {}),
            }),
          });
          const payload: unknown = await response.json();
          if (analysisGenerationRef.current !== generation) return;
          const normalized = response.ok
            ? normalizeServerAnalysis(payload, localeRef.current)
            : null;
          if (!normalized) throw new Error("invalid_fact_edit");

          const latest = analysisRef.current;
          if (!latest || latest.brief.id !== current.brief.id) return;
          if (latest.brief.revision !== current.brief.revision) {
            current = latest;
            continue;
          }

          normalized.warnings = current.warnings;
          const reconciled = invalidateEscoAfterTitleChange(current, normalized);
          analysisRef.current = reconciled;
          setAnalysis(reconciled);
          setArtifactDrafts({});
          return;
        }
        throw new Error("concurrent_fact_edit");
      } catch {
        if (analysisGenerationRef.current !== generation) return;
        setAnswerError(tr("This edit could not be validated.", "Diese Änderung konnte nicht validiert werden."));
      }
    });

    briefMutationQueueRef.current = queuedMutation.catch(() => undefined);
    return queuedMutation;
  }

  async function acceptKnowledgeSkill(suggestion: KnowledgeSuggestion) {
    if (
      suggestion.kind !== "esco_skill"
      || (
        suggestion.targetFieldId !== "requirements.mustHaveSkills"
        && suggestion.targetFieldId !== "requirements.niceToHaveSkills"
      )
      || knowledgeLoading
      || knowledgeSignature !== knowledgeRequestJson
      || !visibleKnowledge?.suggestions.some((current) => current.id === suggestion.id)
      || acceptingSuggestionId
    ) return;

    const generation = analysisGenerationRef.current;
    const targetFieldId = suggestion.targetFieldId;
    const current = analysisRef.current;
    if (!current) return;
    const existingValues = valuesForField(current.facts, targetFieldId);
    if (existingValues.some((value) => value.toLocaleLowerCase() === suggestion.label.toLocaleLowerCase())) return;
    const primaryOccupation = current.brief.esco.primaryOccupation;
    const escoCandidate: EscoSkillCandidate | undefined =
      suggestion.sourceAuthority === "official_esco_api"
      && suggestion.conceptUri
      && suggestion.relation
      && primaryOccupation
        ? {
          authority: "official_esco_api",
          occupationUri: primaryOccupation.uri,
          skillUri: suggestion.conceptUri,
          relation: suggestion.relation,
          version: primaryOccupation.version,
          language: current.brief.locale,
          label: suggestion.label,
        }
        : undefined;
    if (suggestion.sourceAuthority === "official_esco_api" && !escoCandidate) return;

    setAcceptingSuggestionId(suggestion.id);
    try {
      await editFact(targetFieldId, {
        kind: "answer",
        value: [...existingValues, suggestion.label],
      }, escoCandidate);
    } finally {
      if (analysisGenerationRef.current === generation) setAcceptingSuggestionId(null);
    }
  }

  function refreshKnowledge() {
    setKnowledge(null);
    setKnowledgeSignature(null);
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    setKnowledgeRefresh((current) => current + 1);
  }

  function confirmEsco(candidate: EscoConcept) {
    if (!canonicalRoleTitle || escoCandidateTitleRef.current !== canonicalRoleTitle) {
      setEscoCandidates([]);
      return;
    }
    const requestedTitle = canonicalRoleTitle;
    const generation = analysisGenerationRef.current;
    escoCandidateTitleRef.current = null;
    setEscoCandidates([]);
    const queuedMutation = briefMutationQueueRef.current.then(() => {
      const current = analysisRef.current;
      if (
        !current ||
        analysisGenerationRef.current !== generation ||
        !titlesMatch(roleTitleForEsco(current), requestedTitle)
      ) return;
      const updatedAt = new Date().toISOString();
      const confirmed = {
        ...current,
        esco: {
          title: candidate.preferredLabel,
          uri: candidate.uri,
          version: candidate.version,
          skills: current.brief.esco.skills.map((skill) => skill.preferredLabel),
        },
        brief: {
          ...current.brief,
          revision: current.brief.revision + 1,
          updatedAt,
          esco: { ...current.brief.esco, primaryOccupation: candidate },
        },
      };
      analysisRef.current = confirmed;
      setAnalysis(confirmed);
    });
    briefMutationQueueRef.current = queuedMutation.catch(() => undefined);
  }

  async function copyArtifact() {
    await navigator.clipboard.writeText(artifactText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function reset() {
    analysisGenerationRef.current += 1;
    knowledgeGenerationRef.current += 1;
    analysisRef.current = null;
    setAnalysis(null);
    setLoading(false);
    setAnswerLoading(false);
    setJobAd("");
    setInputSource({ id: "job-ad", type: "pasted_text" });
    setSelectedDemo(null);
    setStep(1);
    setQuestionIndex(0);
    setSelectedSkills([]);
    setScenario(null);
    setScenarioLoading(false);
    setScenarioError(null);
    setKnowledge(null);
    setKnowledgeSignature(null);
    setKnowledgeLoading(false);
    setKnowledgeError(null);
    setKnowledgeRefresh(0);
    setAcceptingSuggestionId(null);
    setEscoCandidates([]);
    setEscoWarning(null);
    escoCandidateTitleRef.current = null;
    setArtifactDrafts({});
    setAnalysisError(null);
    setAnswerError(null);
  }

  return (
    <main lang={locale} className={analysis ? "app app-workspace" : "app"}>
      <header className="topbar">
        <Brand />
        <nav className="topnav" aria-label={tr("Primary navigation", "Hauptnavigation")}>
          {analysis
            ? <span className="project-title"><i />{analysis.title}</span>
            : <><a href="#how">{tr("How it works", "So funktioniert's")}</a><a href="#trust">{tr("Trust & privacy", "Vertrauen & Datenschutz")}</a></>}
        </nav>
        <div className="top-actions">
          <button className="language-switch" onClick={switchLocale}><Icon name="language" />{locale.toUpperCase()}</button>
          {analysis && <button className="quiet-button" onClick={reset}>{tr("New analysis", "Neue Analyse")}</button>}
        </div>
      </header>

      {!analysis ? (
        <IntakePanel locale={locale} tr={tr} jobAd={jobAd} setJobAd={updateJobAd} resolveSource={resolveInputSource} demoAds={demoAds} selectedDemo={selectedDemo} chooseDemo={chooseDemo} analyse={analyse} loading={loading} error={analysisError} />
      ) : (
        <div className="workspace-shell">
          <WorkspaceNav tr={tr} title={analysis.title} completion={completion} step={step} setStep={setStep} mode={analysis.mode} />
          <section className="workspace-main">
            {analysis.warnings.length > 0 && <div className="warning-stack" role="status">
              {analysis.warnings.map((warning, index) => <p key={`${warning.en}-${index}`}><Icon name="shield" />{warning[locale]}</p>)}
            </div>}
            {answerError && <p className="inline-error" role="alert">{answerError}</p>}
            {step === 1 && <SourceReview tr={tr} jobAd={jobAd} facts={facts} onNext={() => setStep(2)} />}
            {step === 2 && <ClarifyPanel tr={tr} analysis={analysis} question={question} questionIndex={questionIndex} answer={answer} setAnswer={setAnswer} whyOpen={whyOpen} setWhyOpen={setWhyOpen} saveAnswer={saveAnswer} answerLoading={answerLoading} updateFact={updateFact} onNext={() => setStep(3)} />}
            {step === 3 && <>
              <KnowledgeIntelligence
                tr={tr}
                data={visibleKnowledge}
                loading={knowledgeLoading}
                error={knowledgeError}
                acceptingSuggestionId={acceptingSuggestionId}
                acceptedSkillIds={acceptedKnowledgeSkillIds}
                onRetry={refreshKnowledge}
                onAcceptSkill={acceptKnowledgeSkill}
              />
              <ScenarioPanel tr={tr} skills={skills} selected={selectedSkills} setSelected={setSelectedSkills} scenario={scenario} loading={scenarioLoading} error={scenarioError} searchRadiusKm={searchRadiusKm} setSearchRadiusKm={setSearchRadiusKm} remoteSharePercent={remoteSharePercent} setRemoteSharePercent={setRemoteSharePercent} seniority={seniority} setSeniority={setSeniority} onNext={() => setStep(4)} />
            </>}
            {step === 4 && <ReviewPanel tr={tr} analysis={analysis} updateFact={updateFact} artifact={artifact} setArtifact={setArtifact} artifactText={artifactText} setArtifactText={(value) => setArtifactDrafts((current) => ({ ...current, [artifact]: value }))} copied={copied} copyArtifact={copyArtifact} />}
          </section>
          <IntelligenceRail tr={tr} analysis={analysis} scenario={scenario} escoCandidates={escoCandidates} escoWarning={escoWarning} confirmEsco={confirmEsco} />
        </div>
      )}
    </main>
  );
}
