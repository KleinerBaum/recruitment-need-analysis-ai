"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import type { Translator } from "@/components/recruitment-workspace";
import type { ScenarioResult } from "@/lib/client-types";
import type { Seniority } from "@/lib/contracts";

type RequirementPriority = "must" | "important" | "optional" | "removed";
type RoleprintZone = "skills" | "tasks" | "responsibility" | "core" | "context";

const PRIORITY_ORDER: readonly RequirementPriority[] = ["must", "important", "optional", "removed"];
const SENIORITY_VALUES: readonly Seniority[] = ["entry", "junior", "mid", "senior", "lead", "executive"];

function unique(values: readonly string[]): string[] {
  return [...new Map(values.map((value) => [value.toLocaleLowerCase(), value])).values()];
}

export function ScenarioPanel({
  tr,
  skills,
  mustHaveSkills,
  tasks,
  benefits,
  evidenceCount,
  factCount,
  selected,
  setSelected,
  scenario,
  loading,
  error,
  searchRadiusKm,
  setSearchRadiusKm,
  remoteSharePercent,
  setRemoteSharePercent,
  seniority,
  setSeniority,
  onNext,
}: {
  tr: Translator;
  skills: string[];
  mustHaveSkills: string[];
  tasks: string[];
  benefits: string[];
  evidenceCount: number;
  factCount: number;
  selected: string[];
  setSelected: (value: string[]) => void;
  scenario: ScenarioResult | null;
  loading: boolean;
  error: string | null;
  searchRadiusKm: number;
  setSearchRadiusKm: (value: number) => void;
  remoteSharePercent: number;
  setRemoteSharePercent: (value: number) => void;
  seniority: Seniority;
  setSeniority: (value: Seniority) => void;
  onNext: () => void;
}) {
  const initialScenario = useRef({ searchRadiusKm, remoteSharePercent, seniority });
  const [customSkill, setCustomSkill] = useState("");
  const [priorityBySkill, setPriorityBySkill] = useState<Record<string, RequirementPriority>>({});
  const [activeZone, setActiveZone] = useState<RoleprintZone>("skills");

  const baselineSkillKeys = new Set(mustHaveSkills.map((skill) => skill.toLocaleLowerCase()));
  const experimentSkills = unique(skills).filter((skill) => !baselineSkillKeys.has(skill.toLocaleLowerCase()));
  const baseline = scenario?.baselineReachIndex ?? 0;
  const reach = scenario?.reachIndex ?? 0;
  const delta = scenario?.deltaPoints ?? 0;
  const locale = tr("en", "de") as "en" | "de";

  function priorityFor(skill: string): RequirementPriority {
    if (selected.includes(skill)) return "must";
    return priorityBySkill[skill] ?? "important";
  }

  function priorityLabel(priority: RequirementPriority): string {
    return ({
      must: tr("Must", "Muss"),
      important: tr("Important", "Wichtig"),
      optional: tr("Optional", "Optional"),
      removed: tr("Removed", "Entfernt"),
    })[priority];
  }

  function cyclePriority(skill: string) {
    const current = priorityFor(skill);
    const next = PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(current) + 1) % PRIORITY_ORDER.length] ?? "must";
    setPriorityBySkill((priorities) => ({ ...priorities, [skill]: next }));
    setSelected(next === "must"
      ? unique([...selected, skill])
      : selected.filter((item) => item !== skill));
    setActiveZone("skills");
  }

  function addCustomSkill() {
    const value = customSkill.trim();
    if (!value || [...mustHaveSkills, ...experimentSkills].some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    setPriorityBySkill((priorities) => ({ ...priorities, [value]: "must" }));
    setSelected(unique([...selected, value]));
    setCustomSkill("");
    setActiveZone("skills");
  }

  function resetLab() {
    setSelected([]);
    setPriorityBySkill({});
    setSearchRadiusKm(initialScenario.current.searchRadiusKm);
    setRemoteSharePercent(initialScenario.current.remoteSharePercent);
    setSeniority(initialScenario.current.seniority);
    setActiveZone("skills");
  }

  return <>
    <div className="section-heading role-lab-heading">
      <div className="eyebrow"><Icon name="chart" />03 · {tr("SIMULATE", "SIMULIEREN")}</div>
      <h1>{tr("Test the role before the market does.", "Die Rolle testen, bevor es der Markt tut.")}</h1>
      <p>{tr("Change one assumption at a time. Needly shows modeled impact immediately and keeps observed, modeled, and unknown data visibly separate.", "Jeweils eine Annahme verändern. Needly zeigt die modellierte Wirkung sofort und trennt beobachtete, modellierte und unbekannte Daten sichtbar.")}</p>
    </div>

    <section className="scenario-lab role-lab" aria-labelledby="role-lab-title">
      <header className="role-lab-bar">
        <div><span className="lab-live"><i />{tr("ROLE LAB · LIVE", "ROLE LAB · LIVE")}</span><h2 id="role-lab-title">{tr("Recruitment decision experiment", "Recruitment-Entscheidungsexperiment")}</h2></div>
        <div className="role-lab-bar-actions"><span className="evidence-pill modeled">{tr("MODELED · SCENARIO V2", "MODELLIERT · SZENARIO V2")}</span><button type="button" className="reset-lab" onClick={resetLab}><Icon name="refresh" />{tr("Reset", "Zurücksetzen")}</button></div>
      </header>

      <div className="scenario-warning"><Icon name="shield" /><div><strong>{tr("TRANSPARENT SCENARIO — NOT OBSERVED MARKET DATA", "TRANSPARENTES SZENARIO — KEINE BEOBACHTETEN MARKTDATEN")}</strong><p>{tr("The index uses disclosed deterministic weights. It is not a candidate count, salary forecast, or skill-specific scarcity claim.", "Der Index nutzt offengelegte deterministische Gewichte. Er ist weder Kandidatenzahl noch Gehaltsprognose oder skill-spezifische Knappheitsaussage.")}</p></div></div>

      <div className="role-lab-grid">
        <section className="requirements-panel" aria-labelledby="requirements-title">
          <div className="lab-column-head"><span>01</span><div><strong id="requirements-title">{tr("Requirements", "Anforderungen")}</strong><p>{tr("Prioritize the experiment layer", "Experimentebene priorisieren")}</p></div></div>

          <div className="requirement-group">
            <div className="requirement-group-label"><span>{tr("DOCUMENTED MUST-HAVES", "DOKUMENTIERTE MUSS-KRITERIEN")}</span><small>{tr("Change in Sharpen", "In Schärfen ändern")}</small></div>
            {mustHaveSkills.length > 0 ? mustHaveSkills.map((skill) => <div className="requirement-row locked" key={skill}><span className="requirement-signal"><Icon name="check" /></span><div><strong>{skill}</strong><small>{tr("Part of the approved baseline", "Teil der dokumentierten Basis")}</small></div><span className="priority-chip priority-must">{priorityLabel("must")}</span></div>) : <p className="empty-requirements">{tr("No must-have is documented yet.", "Noch kein Muss-Kriterium dokumentiert.")}</p>}
          </div>

          <div className="requirement-group">
            <div className="requirement-group-label"><span>{tr("EXPERIMENT CRITERIA", "EXPERIMENT-KRITERIEN")}</span><small>{tr("Click to reprioritize", "Zum Priorisieren klicken")}</small></div>
            <div className="custom-skill"><input value={customSkill} onChange={(event) => setCustomSkill(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addCustomSkill(); }} placeholder={tr("Add a test criterion…", "Testkriterium ergänzen…")} /><button type="button" onClick={addCustomSkill} aria-label={tr("Add test criterion", "Testkriterium hinzufügen")}><Icon name="plus" /></button></div>
            {experimentSkills.length === 0 && <p className="empty-requirements">{tr("Add or accept a skill to test it as an additional must-have.", "Skill ergänzen oder übernehmen, um ihn als zusätzliches Muss-Kriterium zu testen.")}</p>}
            {experimentSkills.map((skill) => {
              const priority = priorityFor(skill);
              return <button type="button" key={skill} className={`requirement-row priority-${priority}`} onClick={() => cyclePriority(skill)} aria-label={`${skill}: ${priorityLabel(priority)}`}>
                <span className="requirement-signal">{priority === "removed" ? <Icon name="close" /> : priority === "must" ? <Icon name="check" /> : <i />}</span>
                <div><strong>{skill}</strong><small>{priority === "must" ? tr("Adds the disclosed −4 point step", "Aktiviert den offengelegten −4-Punkte-Schritt") : tr("No modeled reach effect in this state", "In diesem Status kein modellierter Reach-Effekt")}</small></div>
                <span className={`priority-chip priority-${priority}`}>{priorityLabel(priority)}</span>
              </button>;
            })}
          </div>

          <div className="unmodeled-signals">
            <div className="requirement-group-label"><span>{tr("VISIBLE · EFFECT UNKNOWN", "SICHTBAR · WIRKUNG UNBEKANNT")}</span></div>
            <button type="button" onClick={() => setActiveZone("tasks")}><span>{tr("Tasks", "Aufgaben")}</span><strong>{tasks.length || "—"}</strong><em>{tr("unknown", "unbekannt")}</em></button>
            <button type="button" onClick={() => setActiveZone("core")}><span>{tr("Benefits", "Benefits")}</span><strong>{benefits.length || "—"}</strong><em>{tr("unknown", "unbekannt")}</em></button>
          </div>
        </section>

        <section className="roleprint-panel" aria-labelledby="roleprint-title">
          <div className="lab-column-head"><span>02</span><div><strong id="roleprint-title">Roleprint</strong><p>{tr("A map of the role—not a person", "Eine Karte der Rolle – nicht einer Person")}</p></div></div>

          <div className="roleprint-visual" data-active-zone={activeZone}>
            <div className="roleprint-axis axis-x" /><div className="roleprint-axis axis-y" />
            <div className="roleprint-zone zone-skills"><i /><span>{tr("Knowledge", "Wissen")}</span><strong>Skills</strong></div>
            <div className="roleprint-zone zone-tasks"><i /><span>{tr("Tasks", "Aufgaben")}</span><strong>{tr("Tools", "Werkzeuge")}</strong></div>
            <div className="roleprint-zone zone-responsibility"><i /><span>{tr("Responsibility", "Verantwortung")}</span><strong>{tr("Outcomes", "Ergebnisse")}</strong></div>
            <div className="roleprint-zone zone-core"><i /><span>{tr("Motivation", "Motivation")}</span><strong>{tr("Benefits", "Benefits")}</strong></div>
            <div className="roleprint-zone zone-context"><i /><span>{tr("Location", "Standort")}</span><strong>{tr("Mobility", "Mobilität")}</strong></div>
            <div className="roleprint-center"><span>ROLE</span><strong>PRINT</strong><small>{selected.length} {tr("active tests", "aktive Tests")}</small></div>
          </div>

          <div className="scenario-controls roleprint-controls">
            <label>{tr("Search radius", "Suchradius")}<strong>{searchRadiusKm} km</strong><input type="range" min="0" max="200" step="10" value={searchRadiusKm} onChange={(event) => { setSearchRadiusKm(Number(event.target.value)); setActiveZone("context"); }} /></label>
            <label>{tr("Remote share", "Remote-Anteil")}<strong>{remoteSharePercent}%</strong><input type="range" min="0" max="100" step="10" value={remoteSharePercent} onChange={(event) => { setRemoteSharePercent(Number(event.target.value)); setActiveZone("context"); }} /></label>
            <label>{tr("Seniority", "Seniorität")}<select value={seniority} onChange={(event) => { setSeniority(event.target.value as Seniority); setActiveZone("responsibility"); }}>{SENIORITY_VALUES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>
        </section>

        <aside className="role-impact" aria-labelledby="impact-title">
          <div className="lab-column-head"><span>03</span><div><strong id="impact-title">{tr("Impact", "Wirkung")}</strong><p>{tr("Immediate, status-labeled feedback", "Sofortiges Feedback mit Datenstatus")}</p></div>{loading && <span className="spinner dark" />}</div>
          {error && <p className="inline-error" role="alert">{error}</p>}

          <div className="impact-metric primary-impact">
            <div className="impact-metric-head"><span>{tr("Talent reach", "Talent-Reichweite")}</span><em className="evidence-pill modeled">{tr("MODELED", "MODELLIERT")}</em></div>
            <div className="impact-value"><strong>{scenario ? reach : "—"}</strong><span>/100</span></div>
            <div className="impact-delta"><span>{scenario ? `${baseline} → ${reach}` : tr("Calculating…", "Berechnung läuft…")}</span>{scenario && <b className={delta < 0 ? "negative" : delta > 0 ? "positive" : "neutral"}>{delta > 0 ? "+" : ""}{delta} {tr("pts", "Pkt.")}</b>}</div>
          </div>

          <div className="impact-metric">
            <div className="impact-metric-head"><span>{tr("Salary corridor", "Gehaltskorridor")}</span><em className="evidence-pill unknown">{tr("UNKNOWN", "UNBEKANNT")}</em></div>
            <div className="impact-unknown">—</div><p>{tr("No salary delta in the scenario contract.", "Kein Gehaltsdelta im Szenario-Contract.")}</p>
          </div>

          <div className="impact-metric">
            <div className="impact-metric-head"><span>{tr("Hiring risk", "Besetzungsrisiko")}</span><em className="evidence-pill unknown">{tr("UNKNOWN", "UNBEKANNT")}</em></div>
            <div className="impact-unknown">{tr("Not inferred", "Nicht abgeleitet")}</div><p>{tr("Reach is not silently converted into risk.", "Reach wird nicht stillschweigend in Risiko übersetzt.")}</p>
          </div>

          <div className="impact-metric evidence-impact">
            <div className="impact-metric-head"><span>{tr("Evidence coverage", "Evidenzabdeckung")}</span><em className="evidence-pill observed">{tr("OBSERVED", "BEOBACHTET")}</em></div>
            <div className="impact-value compact-value"><strong>{evidenceCount}</strong><span>/{factCount}</span></div><p>{tr("Facts with source or team evidence.", "Fakten mit Quellen- oder Teambeleg.")}</p>
          </div>

          <details className="model-disclosure"><summary><Icon name="evidence" />{tr("Data basis & formula", "Datenbasis & Formel")}<Icon name="chevron" /></summary><div><p>{scenario?.disclaimer[locale] ?? tr("Waiting for a validated server calculation.", "Warte auf eine validierte Serverberechnung.")}</p>{scenario && <code>{scenario.provenance.formula}</code>}</div></details>
        </aside>
      </div>

      {scenario && scenario.whatIfRows.length > 0 && <div className="scenario-rows role-lab-rows">
        {scenario.whatIfRows.map((row) => <div key={row.addedSkill}><strong>{row.addedSkill}</strong><span>{row.deltaPoints} {tr("points", "Punkte")} · {row.reachIndex}/100</span><p>{row.explanation[locale]}</p></div>)}
      </div>}

      {scenario && <div className="market-references">
        <strong>{tr("Official references — opened separately", "Amtliche Referenzen – separat geöffnet")}</strong>
        {scenario.references.map((reference) => <a key={reference.id} href={reference.url} target="_blank" rel="noreferrer"><Icon name="evidence" /><span>{reference.label[locale]}<small>{reference.note[locale]}</small></span><Icon name="arrow" /></a>)}
      </div>}

      <div className="scenario-actions">
        <p>{scenario?.disclaimer[locale] ?? tr("Waiting for a validated server calculation.", "Warte auf eine validierte Serverberechnung.")}</p>
        <button className="primary-button compact" onClick={onNext}>{tr("Make the decision", "Entscheidung vorbereiten")}<Icon name="arrow" /></button>
      </div>
    </section>
  </>;
}
