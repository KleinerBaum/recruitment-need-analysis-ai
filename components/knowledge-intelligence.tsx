"use client";

import { Icon } from "@/components/icons";
import type { Translator } from "@/components/recruitment-workspace";
import type {
  CorpusRetrievalStatus,
  HistoricalSalaryBenchmark,
  KnowledgeCitation,
  KnowledgeCorpus,
  KnowledgeSuggestion,
  RecruitmentKnowledgeResponse,
  VacancyFieldId,
} from "@/lib/contracts";

const CORPORA: readonly KnowledgeCorpus[] = [
  "esco",
  "job_postings",
  "market_reference",
];

const TARGET_FIELDS = new Set<VacancyFieldId>([
  "requirements.mustHaveSkills",
  "requirements.niceToHaveSkills",
]);

function corpusName(corpus: KnowledgeCorpus, tr: Translator): string {
  if (corpus === "esco") return tr("ESCO knowledge", "ESCO-Wissen");
  if (corpus === "job_postings") return tr("Comparable postings", "Vergleichbare Stellenanzeigen");
  return tr("Salary & market references", "Gehalts- & Marktreferenzen");
}

function corpusDescription(corpus: KnowledgeCorpus, tr: Translator): string {
  if (corpus === "esco") {
    return tr(
      "Occupation and skill relations retrieved from the ESCO corpus.",
      "Berufs- und Skill-Beziehungen aus dem ESCO-Korpus.",
    );
  }
  if (corpus === "job_postings") {
    return tr(
      "Recurring language and requirement patterns—not candidate availability.",
      "Wiederkehrende Formulierungen und Anforderungsmuster – keine Kandidatenverfügbarkeit.",
    );
  }
  return tr(
    "Reference material for salary context—not a salary forecast.",
    "Referenzmaterial zur Gehaltseinordnung – keine Gehaltsprognose.",
  );
}

function statusLabel(
  status: CorpusRetrievalStatus["status"] | undefined,
  count: number,
  tr: Translator,
): string {
  if (status === "available") return tr(`${count} retrieved`, `${count} abgerufen`);
  if (status === "no_results") return tr("No matches", "Keine Treffer");
  if (status === "not_configured") return tr("Not configured", "Nicht konfiguriert");
  if (status === "unavailable") return tr("Unavailable", "Nicht verfügbar");
  if (status === "filtered") return tr("Filtered", "Gefiltert");
  return tr("Waiting", "Ausstehend");
}

function statusTone(status: CorpusRetrievalStatus["status"] | undefined): string {
  if (status === "available") return "knowledge-status available";
  if (status === "no_results" || status === "filtered") return "knowledge-status quiet";
  if (status === "unavailable") return "knowledge-status unavailable";
  return "knowledge-status unconfigured";
}

function suggestionKindLabel(suggestion: KnowledgeSuggestion, tr: Translator): string {
  if (suggestion.kind === "esco_skill") return tr("ESCO skill suggestion", "ESCO-Skill-Vorschlag");
  if (suggestion.kind === "job_posting_pattern") return tr("Observed posting pattern", "Beobachtetes Anzeigenmuster");
  return tr("Market context", "Marktkontext");
}

function targetLabel(suggestion: KnowledgeSuggestion, tr: Translator): string {
  if (suggestion.kind !== "esco_skill") return tr("Context only", "Nur Kontext");
  if (suggestion.targetFieldId === "requirements.mustHaveSkills") return tr("Must-have skill", "Muss-Skill");
  if (suggestion.targetFieldId === "requirements.niceToHaveSkills") return tr("Nice-to-have skill", "Kann-Skill");
  return tr("Context only", "Nur Kontext");
}

function CitationCard({ citation, tr }: { citation: KnowledgeCitation; tr: Translator }) {
  const relevance = Math.round(citation.score * 100);
  const official = citation.authority === "official_esco_api";
  const provenance = citation.provenance;
  const provenanceLabels = [
    provenance?.dataset,
    provenance?.source,
    provenance?.snapshotPeriod,
    provenance?.language ? `${tr("Language", "Sprache")}: ${provenance.language}` : undefined,
    provenance?.documentType,
    provenance?.usagePolicy,
    provenance?.license ? `${tr("License", "Lizenz")}: ${provenance.license}` : undefined,
  ].filter((value): value is string => Boolean(value));
  return <article className="knowledge-citation">
    <div className="citation-meta">
      <span><Icon name="document" /><em>{corpusName(citation.corpus, tr)}</em>{citation.sourceName}</span>
      {official
        ? <strong className="official-source"><Icon name="check" />{tr("Official ESCO API", "Offizielle ESCO-API")}{citation.relation ? ` · ${citation.relation}` : ""}</strong>
        : <strong title={tr(
            "Retrieval relevance measures query similarity; it is not factual confidence.",
            "Retrieval-Relevanz misst die Ähnlichkeit zur Suchanfrage; sie ist keine faktische Sicherheit.",
          )}>{relevance}% {tr("retrieval relevance", "Retrieval-Relevanz")}</strong>}
    </div>
    <blockquote>“{citation.excerpt}”</blockquote>
    {(citation.conceptUri || provenanceLabels.length > 0) && <div className="citation-provenance">
      {citation.conceptUri && <a href={citation.conceptUri} target="_blank" rel="noreferrer"><Icon name="arrow" />{tr("Official concept", "Offizielles Konzept")}</a>}
      {provenanceLabels.map((label, index) => <span key={`${index}-${label}`}>{label}</span>)}
    </div>}
  </article>;
}

function SalaryBenchmarkCard({
  benchmark,
  tr,
}: {
  benchmark: HistoricalSalaryBenchmark;
  tr: Translator;
}) {
  const locale = tr("en-US", "de-DE");
  const currency = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: benchmark.currency,
    maximumFractionDigits: 0,
  });
  return <article className="salary-benchmark">
    <div className="salary-benchmark-head">
      <div><span>{tr("HISTORICAL DATASET REFERENCE", "HISTORISCHE DATENSATZ-REFERENZ")}</span><h4>{tr(
        "Observed salary distribution",
        "Beobachtete Gehaltsverteilung",
      )}</h4></div>
      <span className="salary-not-forecast">{tr("NOT A FORECAST", "KEINE PROGNOSE")}</span>
    </div>
    <div className="salary-range" aria-label={tr("Historical salary distribution", "Historische Gehaltsverteilung")}>
      <div><span>P25</span><strong>{currency.format(benchmark.p25)}</strong></div>
      <div className="median"><span>{tr("Median", "Median")}</span><strong>{currency.format(benchmark.median)}</strong></div>
      <div><span>P75</span><strong>{currency.format(benchmark.p75)}</strong></div>
    </div>
    <div className="salary-meta">
      <span><Icon name="evidence" />{benchmark.source.sourceName} · {benchmark.datasetPeriod.from}–{benchmark.datasetPeriod.to}</span>
      <span>{benchmark.sampleSize.toLocaleString(locale)} {tr("matched rows", "passende Datensätze")}</span>
    </div>
    <div className="salary-title-matches">
      {benchmark.filters.matchedJobTitles.slice(0, 5).map((title) => <span key={title}>{title}</span>)}
    </div>
    <p className="salary-filters">{tr("Applied filters", "Angewandte Filter")}: {[
      benchmark.filters.appliedFilters.experienceLevel
        ? `${tr("experience", "Erfahrung")} ${benchmark.filters.appliedFilters.experienceLevel}`
        : null,
      benchmark.filters.appliedFilters.companyLocation
        ? `${tr("location", "Standort")} ${benchmark.filters.appliedFilters.companyLocation}`
        : null,
    ].filter(Boolean).join(" · ") || tr("role-title match only", "nur Rollentitel-Match")}
    {benchmark.filters.relaxedFilters.length > 0 && ` · ${tr("relaxed for sample size", "für Stichprobengröße gelockert")}: ${benchmark.filters.relaxedFilters.join(", ")}`}</p>
    <p>{benchmark.disclaimer[tr("en", "de") as "en" | "de"]}</p>
    {benchmark.source.licenseStatus === "unverified" && <p className="salary-license"><Icon name="shield" />{tr(
      "Dataset license is currently unverified. Use internally as a reference only; do not publish or present it as an authoritative benchmark.",
      "Die Datensatzlizenz ist derzeit ungeprüft. Nur intern als Referenz verwenden; nicht veröffentlichen oder als maßgeblichen Benchmark darstellen.",
    )}</p>}
  </article>;
}

function SuggestionCard({
  suggestion,
  tr,
  accepted,
  accepting,
  disabled,
  onAcceptSkill,
}: {
  suggestion: KnowledgeSuggestion;
  tr: Translator;
  accepted: boolean;
  accepting: boolean;
  disabled: boolean;
  onAcceptSkill: (suggestion: KnowledgeSuggestion) => void | Promise<void>;
}) {
  const isAcceptableSkill = suggestion.kind === "esco_skill"
    && suggestion.targetFieldId !== undefined
    && TARGET_FIELDS.has(suggestion.targetFieldId);

  return <article className="knowledge-suggestion">
    <div className="suggestion-heading">
      <div>
        <span className="suggestion-kind">{suggestionKindLabel(suggestion, tr)}</span>
        <h4>{suggestion.label}</h4>
      </div>
      <div className="suggestion-badges">
        {suggestion.sourceAuthority === "official_esco_api" && <span className="suggestion-authority"><Icon name="check" />{tr("OFFICIAL ESCO RELATION", "OFFIZIELLE ESCO-RELATION")}</span>}
        <span className="suggestion-only">{tr("SUGGESTION · NOT A FACT", "VORSCHLAG · KEIN FAKT")}</span>
      </div>
    </div>
    <p>{suggestion.rationale[tr("en", "de") as "en" | "de"]}</p>
    <div className="suggestion-target"><Icon name="arrow" />{targetLabel(suggestion, tr)}</div>
    <div className="citation-stack">
      {suggestion.citations.map((citation) => <CitationCard key={citation.id} citation={citation} tr={tr} />)}
    </div>
    {isAcceptableSkill && <div className="suggestion-action">
      <p>{tr(
        "Only your explicit acceptance sends this skill through the validated brief editor.",
        "Nur Ihre ausdrückliche Übernahme sendet diesen Skill durch den validierten Briefing-Editor.",
      )}</p>
      <button
        type="button"
        className="outline-button"
        disabled={accepted || accepting || disabled}
        onClick={() => onAcceptSkill(suggestion)}
      >
        {accepting ? <span className="spinner dark" /> : <Icon name={accepted ? "check" : "plus"} />}
        {accepted
          ? tr("Already in brief", "Bereits im Briefing")
          : accepting
            ? tr("Validating…", "Wird validiert…")
            : tr("Accept into brief", "Ins Briefing übernehmen")}
      </button>
    </div>}
  </article>;
}

function LoadingKnowledge({ tr }: { tr: Translator }) {
  return <div className="knowledge-loading" role="status">
    <span className="spinner dark" />
    <div><strong>{tr("Retrieving grounded context…", "Quellengestützten Kontext abrufen…")}</strong><p>{tr(
      "Searching each corpus separately and preserving source citations.",
      "Die Korpora werden getrennt durchsucht und Quellenangaben erhalten.",
    )}</p></div>
  </div>;
}

export function KnowledgeIntelligence({
  tr,
  data,
  loading,
  error,
  acceptingSuggestionId,
  acceptedSkillIds,
  onRetry,
  onAcceptSkill,
}: {
  tr: Translator;
  data: RecruitmentKnowledgeResponse | null;
  loading: boolean;
  error: string | null;
  acceptingSuggestionId: string | null;
  acceptedSkillIds: ReadonlySet<string>;
  onRetry: () => void;
  onAcceptSkill: (suggestion: KnowledgeSuggestion) => void | Promise<void>;
}) {
  const allAttachedCitationIds = new Set(
    data?.suggestions.flatMap((suggestion) => suggestion.citations.map((citation) => citation.id)) ?? [],
  );

  return <section className="knowledge-intelligence" aria-labelledby="knowledge-heading">
    <header className="knowledge-head">
      <div>
        <div className="eyebrow"><Icon name="sparkles" />{tr("GROUNDED KNOWLEDGE LAYER", "QUELLENGESTÜTZTE WISSENSSCHICHT")}</div>
        <h2 id="knowledge-heading">{tr("Evidence before assumptions.", "Belege vor Annahmen.")}</h2>
        <p>{tr(
          "Retrieved context can sharpen your questions, but remains outside the canonical vacancy brief until you explicitly accept an eligible skill.",
          "Abgerufener Kontext kann Ihre Fragen schärfen, bleibt aber außerhalb des kanonischen Vakanz-Briefings, bis Sie einen geeigneten Skill ausdrücklich übernehmen.",
        )}</p>
      </div>
      <button type="button" className="outline-button" disabled={loading} onClick={onRetry}>
        <Icon name="refresh" />{loading ? tr("Retrieving…", "Wird abgerufen…") : tr("Refresh evidence", "Evidenz aktualisieren")}
      </button>
    </header>

    <div className="knowledge-guardrail"><Icon name="shield" /><div><strong>{tr(
      "SUGGESTION-ONLY MODE",
      "NUR-VORSCHLÄGE-MODUS",
    )}</strong><p>{tr(
      "Nothing retrieved here changes completeness, salary, availability, or brief facts automatically. Search uses only minimal role context—never the full job ad.",
      "Kein Treffer verändert automatisch Vollständigkeit, Gehalt, Verfügbarkeit oder Briefing-Fakten. Die Suche nutzt nur minimalen Rollenkontext – nie die vollständige Stellenanzeige.",
    )}</p></div></div>

    {loading && !data && <LoadingKnowledge tr={tr} />}
    {error && !data && <div className="knowledge-message error" role="alert">
      <Icon name="shield" /><div><strong>{tr("Knowledge retrieval unavailable", "Wissensabruf nicht verfügbar")}</strong><p>{error}</p></div>
      <button type="button" className="outline-button" onClick={onRetry}><Icon name="refresh" />{tr("Retry", "Erneut versuchen")}</button>
    </div>}

    {data && <>
      {(data.status === "partial" || error) && <div className="knowledge-message partial" role="status">
        <Icon name="evidence" /><div><strong>{tr("Partial evidence", "Teilweise Evidenz")}</strong><p>{error ?? tr(
          "At least one corpus could not provide results. Available, cited results are still shown.",
          "Mindestens ein Korpus konnte keine Treffer liefern. Verfügbare, belegte Ergebnisse werden weiterhin angezeigt.",
        )}</p></div>
      </div>}
      {data.status === "not_configured" && <div className="knowledge-message neutral" role="status">
        <Icon name="search" /><div><strong>{tr("Knowledge sources not configured", "Wissensquellen nicht konfiguriert")}</strong><p>{tr(
          "The recruitment workflow remains available without enrichment.",
          "Der Recruiting-Workflow bleibt ohne Anreicherung verfügbar.",
        )}</p></div>
      </div>}
      {data.warnings.map((warning, index) => <p className="knowledge-warning" key={`${warning.en}-${index}`}><Icon name="shield" />{warning[tr("en", "de") as "en" | "de"]}</p>)}
      <div className={`knowledge-corpora${loading ? " refreshing" : ""}`} aria-busy={loading}>
        {CORPORA.map((corpus) => {
          const corpusStatus = data.corpora.find((item) => item.corpus === corpus);
          const suggestions = data.suggestions.filter((suggestion) => (
            corpus === "esco" ? suggestion.kind === "esco_skill"
              : corpus === "job_postings" ? suggestion.kind === "job_posting_pattern"
                : suggestion.kind === "market_context"
          ));
          const references = data.references.filter((reference) => (
            reference.corpus === corpus && !allAttachedCitationIds.has(reference.id)
          ));
          const salaryBenchmark = corpus === "market_reference" ? data.salaryBenchmark : undefined;
          const hasResults = suggestions.length > 0 || references.length > 0 || salaryBenchmark !== undefined;
          return <section className={`knowledge-corpus corpus-${corpus}`} key={corpus}>
            <div className="corpus-head">
              <div className="corpus-icon"><Icon name={corpus === "market_reference" ? "chart" : corpus === "esco" ? "sparkles" : "document"} /></div>
              <div><h3>{corpusName(corpus, tr)}</h3><p>{corpusDescription(corpus, tr)}</p></div>
              <span className={statusTone(corpusStatus?.status)}>{statusLabel(corpusStatus?.status, corpusStatus?.resultCount ?? 0, tr)}</span>
            </div>
            {!hasResults && <div className="corpus-empty"><Icon name="search" /><p>{tr(
              "No citation-backed suggestion is available from this corpus for the current brief.",
              "Für das aktuelle Briefing liegt aus diesem Korpus kein belegter Vorschlag vor.",
            )}</p></div>}
            {salaryBenchmark && <SalaryBenchmarkCard benchmark={salaryBenchmark} tr={tr} />}
            <div className="suggestion-stack">
              {suggestions.map((suggestion) => <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                tr={tr}
                accepted={acceptedSkillIds.has(suggestion.id)}
                accepting={acceptingSuggestionId === suggestion.id}
                disabled={loading}
                onAcceptSkill={onAcceptSkill}
              />)}
            </div>
            {references.length > 0 && <div className="standalone-references">
              <strong>{tr("Additional retrieved references", "Weitere abgerufene Referenzen")}</strong>
              {references.map((reference) => <CitationCard key={reference.id} citation={reference} tr={tr} />)}
            </div>}
          </section>;
        })}
      </div>
      {data.status === "no_suggestions" && data.references.length === 0 && <p className="knowledge-footnote">{tr(
        "No grounded suggestions matched this vacancy. The canonical analysis is unchanged.",
        "Keine belegten Vorschläge passten zu dieser Vakanz. Die kanonische Analyse bleibt unverändert.",
      )}</p>}
    </>}
  </section>;
}
