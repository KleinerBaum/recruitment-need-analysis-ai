import type { Dispatch, SetStateAction } from "react";
import { Icon } from "@/components/icons";
import { FactsTable } from "@/components/facts-table";
import { ScenarioPanel } from "@/components/scenario-panel";
import type { Translator } from "@/components/recruitment-workspace";
import type { Analysis, Fact, ScenarioResult } from "@/lib/client-types";
import type { EscoConcept } from "@/lib/contracts";

export { ScenarioPanel };

export function ReviewPanel({
  tr, analysis, updateFact, artifact, setArtifact, artifactText, setArtifactText, copied, copyArtifact,
}: {
  tr: Translator;
  analysis: Analysis;
  updateFact: (id: Fact["id"], value: string) => void | Promise<void>;
  artifact: "brief" | "interview" | "ad";
  setArtifact: Dispatch<SetStateAction<"brief" | "interview" | "ad">>;
  artifactText: string;
  setArtifactText: (value: string) => void;
  copied: boolean;
  copyArtifact: () => void;
}) {
  const locale = tr("en", "de") as "en" | "de";
  const evidenceCount = analysis.facts.filter((fact) => fact.evidence.length > 0).length;
  const openFacts = analysis.facts.filter((fact) => fact.status === "missing" || fact.status === "conflict");
  const conflictCount = analysis.facts.filter((fact) => fact.status === "conflict").length;
  const nextDecision = analysis.questions[0]?.text
    ?? openFacts[0]?.label
    ?? tr("No critical decision is open.", "Keine kritische Entscheidung ist offen.");
  const mustHave = analysis.facts.find((fact) => fact.id === "requirements.mustHaveSkills")?.value;
  const outcomes = analysis.facts.find((fact) => fact.id === "tasks.outcomes")?.value;
  const salary = analysis.facts.find((fact) => fact.id === "compensation.salaryRange")?.value;
  const workModel = analysis.facts.find((fact) => fact.id === "role.workModel")?.value;
  const updatedAt = new Date(analysis.brief.updatedAt).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return <>
    <div className="section-heading decision-heading">
      <div className="eyebrow"><Icon name="check" />04 · {tr("DECIDE", "ENTSCHEIDEN")}</div>
      <h1>{tr("Turn analysis into a hiring decision.", "Aus Analyse wird eine Hiring-Entscheidung.")}</h1>
      <p>{tr("Review readiness, open conflicts, approved requirements, and evidence lineage before activating downstream recruiting work.", "Readiness, offene Konflikte, freigegebene Anforderungen und Evidenzherkunft prüfen, bevor die operative Recruiting-Arbeit startet.")}</p>
    </div>

    <section className="decision-board" aria-labelledby="decision-title">
      <header className="decision-board-head">
        <div><span>{tr("ROLE DECISION", "ROLLENENTSCHEIDUNG")}</span><h2 id="decision-title">{analysis.title}</h2><p>{analysis.summary}</p></div>
        <div className={`decision-readiness ${analysis.completeness.readyForSummary ? "ready" : "open"}`}><span>{tr("READINESS", "READINESS")}</span><strong>{analysis.completeness.score}%</strong><small>{analysis.completeness.readyForSummary ? tr("Ready for review", "Bereit zur Prüfung") : tr("Decision work remains", "Entscheidungen offen")}</small></div>
      </header>

      <div className="decision-focus"><Icon name="questions" /><div><span>{tr("MOST IMPORTANT OPEN DECISION", "WICHTIGSTE OFFENE ENTSCHEIDUNG")}</span><strong>{nextDecision}</strong></div><em className={openFacts.length > 0 ? "open" : "ready"}>{openFacts.length > 0 ? tr("OPEN", "OFFEN") : tr("CLEAR", "GEKLÄRT")}</em></div>

      <div className="decision-kpis">
        <div><span>{tr("Brief readiness", "Briefing-Readiness")}</span><strong>{analysis.completeness.score}%</strong><small className="evidence-pill observed">{tr("BRIEF STATUS", "BRIEF-STATUS")}</small></div>
        <div><span>{tr("Evidence coverage", "Evidenzabdeckung")}</span><strong>{evidenceCount}<em>/{analysis.facts.length}</em></strong><small className="evidence-pill observed">{tr("OBSERVED", "BEOBACHTET")}</small></div>
        <div><span>{tr("Open decisions", "Offene Entscheidungen")}</span><strong>{openFacts.length}</strong><small className="evidence-pill unknown">{tr("TO RESOLVE", "ZU KLÄREN")}</small></div>
        <div><span>{tr("Conflicts", "Konflikte")}</span><strong>{conflictCount}</strong><small className={conflictCount ? "evidence-pill unknown" : "evidence-pill observed"}>{conflictCount ? tr("ATTENTION", "ACHTUNG") : tr("CLEAR", "GEKLÄRT")}</small></div>
      </div>

      <div className="decision-columns">
        <section className="decision-issues">
          <div className="decision-column-head"><span>01</span><div><strong>{tr("Requirements & conflicts", "Anforderungen & Konflikte")}</strong><p>{tr("What still needs a decision", "Was noch entschieden werden muss")}</p></div></div>
          {openFacts.length > 0 ? openFacts.slice(0, 6).map((fact) => <div className={`decision-issue ${fact.status}`} key={fact.id}><span /><div><strong>{fact.label}</strong><p>{fact.status === "conflict" ? fact.conflictDescription || tr("Conflicting evidence", "Widersprüchliche Evidenz") : tr("Not documented", "Nicht dokumentiert")}</p></div><em>{fact.status === "conflict" ? tr("Conflict", "Konflikt") : tr("Open", "Offen")}</em></div>) : <div className="decision-clear"><Icon name="check" /><strong>{tr("No critical gaps in the current question set.", "Keine kritischen Lücken im aktuellen Fragenset.")}</strong></div>}
        </section>

        <section className="decision-brief-preview">
          <div className="decision-column-head"><span>02</span><div><strong>{tr("Approved hiring brief", "Freigegebenes Hiring Briefing")}</strong><p>{tr("The role, not an idealized person", "Die Rolle, nicht eine idealisierte Person")}</p></div></div>
          <dl>
            <div><dt>{tr("Outcomes", "Ergebnisse")}</dt><dd>{outcomes || tr("Not documented", "Nicht dokumentiert")}</dd></div>
            <div><dt>{tr("Must-haves", "Muss-Kriterien")}</dt><dd>{mustHave || tr("Not documented", "Nicht dokumentiert")}</dd></div>
            <div><dt>{tr("Working model", "Arbeitsmodell")}</dt><dd>{workModel || tr("Not documented", "Nicht dokumentiert")}</dd></div>
            <div><dt>{tr("Salary context", "Gehaltskontext")}</dt><dd>{salary || tr("Unknown — no approved range", "Unbekannt – kein freigegebener Korridor")}</dd></div>
          </dl>
        </section>

        <aside className="decision-evidence">
          <div className="decision-column-head"><span>03</span><div><strong>{tr("Evidence & next action", "Evidenz & nächste Aktion")}</strong><p>{tr("Lineage, freshness, governance", "Herkunft, Aktualität, Governance")}</p></div></div>
          <div className="lineage-row"><span className="evidence-pill observed">{tr("OBSERVED", "BEOBACHTET")}</span><div><strong>{evidenceCount} {tr("supported facts", "belegte Fakten")}</strong><p>{tr("Source or confirmed team evidence", "Quellen- oder bestätigte Team-Evidenz")}</p></div></div>
          <div className="lineage-row"><span className="evidence-pill modeled">{tr("MODELED", "MODELLIERT")}</span><div><strong>{tr("Scenario kept separate", "Szenario separat geführt")}</strong><p>{tr("No silent conversion into salary or risk", "Keine stille Ableitung von Gehalt oder Risiko")}</p></div></div>
          <div className="lineage-row"><span className="evidence-pill unknown">{tr("UNKNOWN", "UNBEKANNT")}</span><div><strong>{openFacts.length} {tr("open or conflicting", "offen oder widersprüchlich")}</strong><p>{tr("Remains visible in every output", "Bleibt in jedem Ergebnis sichtbar")}</p></div></div>
          <div className="freshness"><Icon name="refresh" /><span><strong>{tr("Brief updated", "Briefing aktualisiert")}</strong>{updatedAt} · Revision {analysis.brief.revision}</span></div>
        </aside>
      </div>
    </section>

    <FactsTable facts={analysis.facts} tr={tr} onUpdate={updateFact} expanded />

    <section className="artifact-card decision-artifacts">
      <div className="artifact-head">
        <div><span>{tr("DECISION-READY OUTPUTS", "ENTSCHEIDUNGSBEREITE ERGEBNISSE")}</span><h2>{analysis.title}</h2></div>
        <button className="outline-button" onClick={copyArtifact}><Icon name={copied ? "check" : "copy"} />{copied ? tr("Copied", "Kopiert") : tr("Copy output", "Text kopieren")}</button>
      </div>
      <div className="artifact-tabs">
        <button className={artifact === "brief" ? "active" : ""} onClick={() => setArtifact("brief")}>{tr("Hiring brief", "Hiring Brief")}</button>
        <button className={artifact === "interview" ? "active" : ""} onClick={() => setArtifact("interview")}>{tr("Interview plan", "Interviewleitfaden")}</button>
        <button className={artifact === "ad" ? "active" : ""} onClick={() => setArtifact("ad")}>{tr("Job ad outline", "Stellenanzeigen-Outline")}</button>
      </div>
      <textarea className="artifact-editor" aria-label={tr("Editable generated output", "Editierbares Ergebnis")} value={artifactText} onChange={(event) => setArtifactText(event.target.value)} />
    </section>
  </>;
}

export function IntelligenceRail({ tr, analysis, scenario, escoCandidates, escoWarning, confirmEsco }: {
  tr: Translator;
  analysis: Analysis;
  scenario: ScenarioResult | null;
  escoCandidates: EscoConcept[];
  escoWarning: string | null;
  confirmEsco: (candidate: EscoConcept) => void;
}) {
  const evidenceCount = analysis.facts.filter((fact) => fact.evidence.length > 0).length;
  const unknownCount = analysis.facts.filter((fact) => fact.status === "missing" || fact.status === "conflict").length;
  const locale = tr("en", "de") as "en" | "de";
  return <aside className="intelligence-rail">
    <div className="rail-title"><Icon name="sparkles" />{tr("Decision intelligence", "Decision Intelligence")}<span /></div>
    <section className="intel-card">
      <div className="intel-label"><Icon name="search" />{tr("ESCO occupation match", "ESCO-Berufsmatch")}</div>
      {analysis.esco ? <>
        <h3>{analysis.esco.title}</h3>
        <p className="uri-text">{analysis.esco.uri.replace("http://data.europa.eu/esco/occupation/", "ESCO · …")}</p>
        <div className="official-uri"><Icon name="check" />{tr("Confirmed official identifier", "Bestätigte offizielle ID")} · {analysis.esco.version}</div>
      </> : <>
        <h3>{tr("Not confirmed", "Nicht bestätigt")}</h3>
        <p className="muted">{tr("Choose an official ESCO occupation; the first search result is never selected silently.", "Wählen Sie einen offiziellen ESCO-Beruf; der erste Treffer wird nie stillschweigend übernommen.")}</p>
        {escoCandidates.map((candidate) => <button className="esco-candidate" key={candidate.uri} onClick={() => confirmEsco(candidate)}><span>{candidate.preferredLabel}</span><small>{candidate.version}</small><Icon name="check" /></button>)}
        {escoWarning && <p className="esco-warning">{escoWarning}</p>}
      </>}
      <p className="esco-attribution">{tr("This service uses the ESCO classification of the European Commission.", "Dieser Dienst verwendet die ESCO-Klassifikation der Europäischen Kommission.")}</p>
    </section>

    <section className="intel-card scenario-mini">
      <div className="intel-label"><Icon name="chart" />{tr("Talent reach", "Talent-Reichweite")}</div>
      <span className="evidence-pill modeled">{tr("MODELED · NOT MARKET DATA", "MODELLIERT · KEINE MARKTDATEN")}</span>
      <div className="metric"><div><strong>{scenario?.reachIndex ?? "—"}</strong><span>/100</span></div><p>{tr("relative scenario reach", "relative Szenario-Reichweite")}</p></div>
      <div className="reach-bar"><span style={{ width: `${scenario?.reachIndex ?? 0}%` }} /></div>
      <div className="metric"><div><strong>{scenario ? scenario.deltaPoints : "—"}</strong><span>{tr(" pts", " Pkt.")}</span></div><p>{tr("change from baseline", "Änderung zur Basis")}</p></div>
      <p className="scenario-foot">{scenario?.disclaimer[locale] ?? tr("The server calculation is loading.", "Die Serverberechnung wird geladen.")}</p>
    </section>

    <section className="intel-card evidence-card">
      <div className="intel-label"><Icon name="evidence" />{tr("Data status", "Datenstatus")}</div>
      <div className="rail-status-grid">
        <div><span className="evidence-pill observed">{tr("OBSERVED", "BEOBACHTET")}</span><strong>{evidenceCount}</strong><small>{tr("supported facts", "belegte Fakten")}</small></div>
        <div><span className="evidence-pill modeled">{tr("MODELED", "MODELLIERT")}</span><strong>{scenario ? 1 : 0}</strong><small>{tr("transparent scenario", "transparentes Szenario")}</small></div>
        <div><span className="evidence-pill unknown">{tr("UNKNOWN", "UNBEKANNT")}</span><strong>{unknownCount}</strong><small>{tr("open decisions", "offene Entscheidungen")}</small></div>
      </div>
    </section>
  </aside>;
}
