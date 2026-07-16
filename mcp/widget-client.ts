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
  return String(text.en ?? text.de ?? "");
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

function render(data: ToolData | undefined) {
  const root = document.querySelector<HTMLElement>("#root");
  if (!root || !data) return;
  const kind = String(data.kind ?? "");
  root.innerHTML = kind === "analysis" ? renderAnalysis(data)
    : kind === "esco_search" ? renderEsco(data)
      : kind === "market_scenario" ? renderScenario(data)
        : `<span class="badge">GROUNDED EVIDENCE</span><h1>Source evidence</h1><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
}

const app = new App({ name: "Needly Recruitment Brief", version: "0.1.0" }, {}, { autoResize: true, strict: true });
app.ontoolresult = (result) => render(result.structuredContent);
app.onhostcontextchanged = (context) => {
  if (context.theme) document.documentElement.dataset.theme = context.theme;
};

void app.connect().catch(() => {
  const compatibility = (window as Window & { openai?: { toolOutput?: ToolData } }).openai;
  render(compatibility?.toolOutput);
});
