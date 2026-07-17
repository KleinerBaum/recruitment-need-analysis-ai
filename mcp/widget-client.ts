import { App } from "@modelcontextprotocol/ext-apps";

type ToolData = Record<string, unknown>;

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function localized(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const text = value as Record<string, unknown>;
  const german = document.documentElement.lang.toLocaleLowerCase().startsWith("de");
  return String(german ? text.de ?? text.en ?? "" : text.en ?? text.de ?? "");
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function boundedInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function usd(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(document.documentElement.lang || "en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function renderAnalysis(data: ToolData): string {
  const brief = data.brief as Record<string, unknown> | undefined;
  const completeness = data.completeness as Record<string, unknown> | undefined;
  const facts = Array.isArray(brief?.facts) ? brief.facts as Array<Record<string, unknown>> : [];
  const questions = Array.isArray(data.nextQuestions) ? data.nextQuestions as Array<Record<string, unknown>> : [];
  const score = Number(completeness?.score ?? 0);
  return `
    <div class="hero-line"><span class="badge">EVIDENCE-FIRST</span><span class="score">${score.toFixed(0)}%</span></div>
    <h1>${escapeHtml(brief?.title ?? "Recruitment brief")}</h1>
    <p class="sub">${facts.length} grounded fact proposals · ${questions.length} next-best questions</p>
    <div class="meter"><i style="width:${Math.max(0, Math.min(100, score))}%"></i></div>
    <div class="grid">
      ${facts.slice(0, 6).map((fact) => `<article><span>${escapeHtml(fact.fieldId)}</span><strong>${escapeHtml(Array.isArray(fact.value) ? fact.value.join(", ") : fact.value)}</strong><small>${escapeHtml(fact.status)}</small></article>`).join("")}
    </div>
    ${questions.length ? `<section class="next"><span>NEXT BEST QUESTION</span><h2>${escapeHtml(localized(questions[0]?.wording))}</h2><p>${escapeHtml(localized(questions[0]?.rationale))}</p></section>` : ""}
  `;
}

function renderEsco(data: ToolData): string {
  const concepts = Array.isArray(data.concepts) ? data.concepts as Array<Record<string, unknown>> : [];
  return `<span class="badge">OFFICIAL ESCO</span><h1>Verified occupation matches</h1><div class="list">${concepts.map((concept) => `<article><strong>${escapeHtml(concept.preferredLabel)}</strong><small>${escapeHtml(concept.uri)}</small></article>`).join("") || "<p>No verified match found.</p>"}</div>`;
}

function renderScenario(data: ToolData): string {
  const rows = Array.isArray(data.whatIfRows) ? data.whatIfRows as Array<Record<string, unknown>> : [];
  const baselineReachIndex = Number(data.baselineReachIndex ?? 0);
  const reachIndex = Number(data.reachIndex ?? 0);
  const deltaPoints = Number(data.deltaPoints ?? 0);
  const signedDelta = deltaPoints > 0 ? `+${deltaPoints}` : String(deltaPoints);
  return `<span class="badge warning">SYNTHETIC · NOT MARKET DATA</span><h1>Relative reach scenario</h1><div class="reach"><strong>${escapeHtml(baselineReachIndex)} → ${escapeHtml(reachIndex)}</strong><span>/100 · ${escapeHtml(signedDelta)} points</span></div><div class="meter"><i style="width:${Math.max(0, Math.min(100, reachIndex))}%"></i></div><div class="list">${rows.map((row) => `<article><strong>${escapeHtml(row.addedSkill)}</strong><small>Reach ${escapeHtml(row.reachIndex)}/100 · ${escapeHtml(row.deltaPoints)} points from prior step</small></article>`).join("")}</div><p class="sub">Relative scenario only. Official BA references are provided separately; no salary or candidate data is imported.</p>`;
}

const corpusNames: Readonly<Record<string, string>> = {
  esco: "ESCO",
  job_postings: "Job postings",
  market_reference: "Market references",
};

const corpusStatusNames: Readonly<Record<string, string>> = {
  available: "Available",
  no_results: "No result",
  not_configured: "Not configured",
  unavailable: "Unavailable",
  filtered: "Filtered for provenance",
};

const suggestionKindNames: Readonly<Record<string, string>> = {
  esco_skill: "ESCO skill",
  job_posting_pattern: "Job-posting pattern",
  market_context: "Market context",
};

function renderSalaryBenchmark(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const salary = value as Record<string, unknown>;
  const period = salary.datasetPeriod && typeof salary.datasetPeriod === "object"
    ? salary.datasetPeriod as Record<string, unknown>
    : {};
  const filters = salary.filters && typeof salary.filters === "object"
    ? salary.filters as Record<string, unknown>
    : {};
  const source = salary.source && typeof salary.source === "object"
    ? salary.source as Record<string, unknown>
    : {};
  const relaxedValue = Array.isArray(filters.relaxedFilters)
    ? filters.relaxedFilters
    : salary.relaxedFilters;
  const relaxed = Array.isArray(relaxedValue)
    ? relaxedValue.map(String).slice(0, 2)
    : [];
  const licenseStatus = String(source.licenseStatus ?? salary.licenseStatus ?? "unknown");
  const periodText = `${boundedInteger(period.from)}–${boundedInteger(period.to)}`;
  const sampleSize = boundedInteger(salary.sampleSize);
  return `
    <section class="knowledge-section salary-card">
      <div class="hero-line"><span class="badge warning">HISTORICAL · NOT A FORECAST</span><span class="score">n=${escapeHtml(sampleSize)}</span></div>
      <h2>Salary reference</h2>
      <p class="sub">Aggregated ${escapeHtml(periodText)} records · ${escapeHtml(salary.currency)} · license ${escapeHtml(licenseStatus)}</p>
      <div class="salary-grid">
        <article><span>P25</span><strong>${escapeHtml(usd(salary.p25))}</strong></article>
        <article><span>Median</span><strong>${escapeHtml(usd(salary.median))}</strong></article>
        <article><span>P75</span><strong>${escapeHtml(usd(salary.p75))}</strong></article>
      </div>
      ${relaxed.length ? `<p class="caution">Filters relaxed for sample size: ${escapeHtml(relaxed.join(", "))}.</p>` : ""}
      ${licenseStatus === "unverified" ? '<p class="caution">Unverified dataset license · owner-only internal reference.</p>' : ""}
      <p class="sub">${escapeHtml(localized(salary.disclaimer) || "Historical aggregate only. It does not model a skill premium or candidate availability.")}</p>
    </section>`;
}

function renderKnowledge(data: ToolData): string {
  const suggestions = recordList(data.suggestions);
  const corpora = recordList(data.corpora);
  const warnings = recordList(data.warnings);
  return `
    <div class="hero-line"><span class="badge">ATTRIBUTED · SUGGESTION ONLY</span><span class="score">${escapeHtml(boundedInteger(data.suggestionCount ?? suggestions.length))}</span></div>
    <h1>Recruitment knowledge</h1>
    <p class="sub">Review every suggestion before it becomes part of the vacancy brief. Retrieved sources never update facts automatically.</p>
    <section class="knowledge-section">
      <h2>Corpus status</h2>
      <div class="corpus-grid">
        ${corpora.map((corpus) => {
          const status = String(corpus.status ?? "unavailable");
          return `<article><span>${escapeHtml(corpusNames[String(corpus.corpus)] ?? corpus.corpus)}</span><strong>${escapeHtml(corpusStatusNames[status] ?? status)}</strong><small>${escapeHtml(boundedInteger(corpus.resultCount))} attributed result(s)</small></article>`;
        }).join("") || "<p class=\"sub\">No corpus status was returned.</p>"}
      </div>
    </section>
    <section class="knowledge-section">
      <h2>Suggestions</h2>
      <div class="list suggestion-list">
        ${suggestions.map((suggestion) => {
          const citations = recordList(suggestion.citations);
          const firstCitation = citations[0];
          const relation = suggestion.relation ? ` · ${String(suggestion.relation)}` : "";
          const authority = suggestion.sourceAuthority === "official_esco_api" ? "official ESCO API" : "retrieved reference";
          const sourceName = firstCitation?.sourceName ? ` · ${String(firstCitation.sourceName)}` : "";
          const label = suggestion.label ?? localized(suggestion.summary) ?? suggestionKindNames[String(suggestion.kind)] ?? suggestion.kind;
          const rationale = localized(suggestion.rationale);
          const citationText = citations.length > 0 ? ` · ${citations.length} citation(s)` : "";
          return `<article><span>${escapeHtml(suggestionKindNames[String(suggestion.kind)] ?? suggestion.kind)}</span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(`${authority}${relation}${sourceName}${citationText}`)}</small>${rationale ? `<p>${escapeHtml(rationale)}</p>` : ""}</article>`;
        }).join("") || "<p class=\"sub\">No grounded suggestion is available for this query.</p>"}
      </div>
    </section>
    ${renderSalaryBenchmark(data.salaryBenchmark)}
    ${warnings.length ? `<section class="next warning-panel"><span>LIMITATIONS</span>${warnings.slice(0, 3).map((warning) => `<p>${escapeHtml(localized(warning))}</p>`).join("")}</section>` : ""}
  `;
}

function render(data: ToolData | undefined) {
  const root = document.querySelector<HTMLElement>("#root");
  if (!root || !data) return;
  const kind = String(data.kind ?? "");
  root.innerHTML = kind === "analysis" ? renderAnalysis(data)
    : kind === "esco_search" ? renderEsco(data)
      : kind === "market_scenario" ? renderScenario(data)
        : kind === "recruitment_knowledge" ? renderKnowledge(data)
        : `<span class="badge">GROUNDED EVIDENCE</span><h1>Source evidence</h1><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
}

const app = new App({ name: "Needly Recruitment Brief", version: "0.1.0" }, {}, { autoResize: true, strict: true });
app.ontoolresult = (result) => {
  const metadata = result._meta && typeof result._meta === "object"
    ? result._meta as Record<string, unknown>
    : undefined;
  const knowledgeUi = metadata?.knowledgeUi && typeof metadata.knowledgeUi === "object"
    ? metadata.knowledgeUi as ToolData
    : undefined;
  render(knowledgeUi?.kind === "recruitment_knowledge"
    ? knowledgeUi
    : result.structuredContent);
};
app.onhostcontextchanged = (context) => {
  if (context.theme) document.documentElement.dataset.theme = context.theme;
  if (context.locale) document.documentElement.lang = context.locale;
};

void app.connect().catch(() => {
  const compatibility = (window as Window & { openai?: { toolOutput?: ToolData } }).openai;
  render(compatibility?.toolOutput);
});
