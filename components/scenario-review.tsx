import type { Dispatch, SetStateAction } from "react";
import { Icon } from "@/components/icons";
import { FactsTable } from "@/components/facts-table";
import { ScenarioPanel } from "@/components/scenario-panel";
import type { Translator } from "@/components/recruitment-workspace";
import type { Analysis, Fact, ScenarioResult } from "@/lib/client-types";
import type { EscoConcept } from "@/lib/contracts";

export { ScenarioPanel };

export function ReviewPanel({
  tr, analysis, updateFact, artifact, setArtifact, artifactText, setArtifactText, copied, copyArtifact
}: {
  tr: Translator; analysis: Analysis; updateFact: (id: Fact["id"], value: string) => void | Promise<void>;
  artifact: "brief" | "interview" | "ad";
  setArtifact: Dispatch<SetStateAction<"brief" | "interview" | "ad">>;
  artifactText: string; setArtifactText: (value: string) => void; copied: boolean; copyArtifact: () => void;
}) {
  return <>
    <div className="section-heading">
      <div className="eyebrow"><Icon name="check" />04 · {tr("REVIEW", "PRÜFEN")}</div>
      <h1>{tr("Review the complete brief.", "Vollständiges Briefing prüfen.")}</h1>
      <p>{tr("Edit every field before generating downstream recruitment assets.", "Bearbeiten Sie jedes Feld, bevor Folgeartefakte erstellt werden.")}</p>
    </div>
    <FactsTable facts={analysis.facts} tr={tr} onUpdate={updateFact} expanded />
    <section className="artifact-card">
      <div className="artifact-head">
        <div><span>{tr("READY-TO-USE OUTPUTS", "EINSATZBEREITE ERGEBNISSE")}</span><h2>{analysis.title}</h2></div>
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
  const locale = tr("en", "de") as "en" | "de";
  return <aside className="intelligence-rail">
    <div className="rail-title"><Icon name="sparkles" />{tr("Live intelligence", "Live Intelligence")}<span /></div>
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
      <p className="esco-attribution">{tr(
        "This service uses the ESCO classification of the European Commission.",
        "Dieser Dienst verwendet die ESCO-Klassifikation der Europäischen Kommission.",
      )}</p>
    </section>
    <section className="intel-card scenario-mini">
      <div className="intel-label"><Icon name="chart" />{tr("Skill impact scenario", "Skill-Impact-Szenario")}</div>
      <span className="simulation-label">{tr("TRANSPARENT · NOT MARKET DATA", "TRANSPARENT · KEINE MARKTDATEN")}</span>
      <div className="metric"><div><strong>{scenario?.reachIndex ?? "—"}</strong><span>/100</span></div><p>{tr("relative scenario reach", "relative Szenario-Reichweite")}</p></div>
      <div className="reach-bar"><span style={{ width: `${scenario?.reachIndex ?? 0}%` }} /></div>
      <div className="metric"><div><strong>{scenario ? scenario.deltaPoints : "—"}</strong><span>{tr(" pts", " Pkt.")}</span></div><p>{tr("change from baseline", "Änderung zur Basis")}</p></div>
      <p className="scenario-foot">{scenario?.disclaimer[locale] ?? tr("The server calculation is loading.", "Die Serverberechnung wird geladen.")}</p>
    </section>
    <section className="intel-card evidence-card">
      <div className="intel-label"><Icon name="evidence" />{tr("Evidence coverage", "Evidenzabdeckung")}</div>
      <div className="evidence-score"><strong>{evidenceCount}</strong><span>/ {analysis.facts.length}</span></div>
      <p>{tr("facts backed by source or team evidence", "Fakten mit Quellen- oder Teambeleg")}</p>
    </section>
  </aside>;
}
