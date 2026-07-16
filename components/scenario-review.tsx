import type { Dispatch, SetStateAction } from "react";
import { Icon } from "@/components/icons";
import { FactsTable } from "@/components/facts-table";
import { ScenarioPanel } from "@/components/scenario-panel";
import type { Translator } from "@/components/recruitment-workspace";
import type { Analysis } from "@/lib/client-types";

export { ScenarioPanel };

export function ReviewPanel({
  tr, analysis, updateFact, artifact, setArtifact, artifactText, copied, copyArtifact
}: {
  tr: Translator; analysis: Analysis; updateFact: (id: string, value: string) => void;
  artifact: "brief" | "interview" | "ad";
  setArtifact: Dispatch<SetStateAction<"brief" | "interview" | "ad">>;
  artifactText: string; copied: boolean; copyArtifact: () => void;
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
      <pre>{artifactText}</pre>
    </section>
  </>;
}

export function IntelligenceRail({ tr, analysis, reach, pressure }: {
  tr: Translator; analysis: Analysis; reach: number; pressure: number;
}) {
  const evidenceCount = analysis.facts.filter((fact) => fact.evidence).length;
  return <aside className="intelligence-rail">
    <div className="rail-title"><Icon name="sparkles" />{tr("Live intelligence", "Live Intelligence")}<span /></div>
    <section className="intel-card">
      <div className="intel-label"><Icon name="search" />{tr("ESCO occupation match", "ESCO-Berufsmatch")}</div>
      {analysis.esco ? <>
        <h3>{analysis.esco.title}</h3>
        <p className="uri-text">{analysis.esco.uri.replace("http://data.europa.eu/esco/occupation/", "ESCO · …")}</p>
        {analysis.esco.confidence !== null ? (
          <div className="confidence"><span style={{ width: `${Math.round(analysis.esco.confidence * 100)}%` }} /><small>{Math.round(analysis.esco.confidence * 100)}% match</small></div>
        ) : (
          <div className="official-uri"><Icon name="check" />{tr("Official ESCO identifier", "Offizielle ESCO-ID")}</div>
        )}
        <div className="verify-note"><Icon name="shield" />{tr("Suggested · confirm before use", "Vorschlag · vor Nutzung bestätigen")}</div>
      </> : <>
        <h3>{tr("Not confirmed", "Nicht bestätigt")}</h3>
        <p className="muted">{tr("Confirm via the official ESCO search.", "Über die offizielle ESCO-Suche bestätigen.")}</p>
      </>}
    </section>
    <section className="intel-card scenario-mini">
      <div className="intel-label"><Icon name="chart" />{tr("Skill impact scenario", "Skill-Impact-Szenario")}</div>
      <span className="simulation-label">{tr("SYNTHETIC DEMO — NOT MARKET DATA", "SYNTHETISCHE DEMO — KEINE MARKTDATEN")}</span>
      <div className="metric"><div><strong>{reach}</strong><span>/100</span></div><p>{tr("relative candidate reach", "relative Kandidatenreichweite")}</p></div>
      <div className="reach-bar"><span style={{ width: `${reach}%` }} /></div>
      <div className="metric"><div><strong>+{pressure.toFixed(1)}</strong><span>%</span></div><p>{tr("illustrative salary pressure", "illustrativer Gehaltsdruck")}</p></div>
      <p className="scenario-foot">{tr("Directional scenario only. No candidate counts or observed salaries are claimed.", "Nur ein Richtungsszenario. Keine Kandidatenzahlen oder beobachteten Gehälter werden behauptet.")}</p>
    </section>
    <section className="intel-card evidence-card">
      <div className="intel-label"><Icon name="evidence" />{tr("Evidence coverage", "Evidenzabdeckung")}</div>
      <div className="evidence-score"><strong>{evidenceCount}</strong><span>/ {analysis.facts.length}</span></div>
      <p>{tr("facts backed by source or team evidence", "Fakten mit Quellen- oder Teambeleg")}</p>
    </section>
  </aside>;
}
