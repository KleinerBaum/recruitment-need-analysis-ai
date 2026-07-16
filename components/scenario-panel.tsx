"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import type { Translator } from "@/components/recruitment-workspace";
import type { ScenarioResult } from "@/lib/client-types";
import type { Seniority } from "@/lib/contracts";

export function ScenarioPanel({
  tr,
  skills,
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
  const [customSkill, setCustomSkill] = useState("");

  function toggle(skill: string) {
    setSelected(selected.includes(skill) ? selected.filter((item) => item !== skill) : [...selected, skill]);
  }

  function addCustomSkill() {
    const value = customSkill.trim();
    if (!value || selected.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    setSelected([...selected, value]);
    setCustomSkill("");
  }

  const baseline = scenario?.baselineReachIndex ?? 0;
  const reach = scenario?.reachIndex ?? 0;
  const delta = scenario?.deltaPoints ?? 0;

  return <>
    <div className="section-heading">
      <div className="eyebrow"><Icon name="chart" />03 · {tr("SCENARIO", "SZENARIO")}</div>
      <h1>{tr("Make trade-offs visible.", "Trade-offs sichtbar machen.")}</h1>
      <p>{tr("Change one assumption at a time. The server returns a versioned, transparent calculation—never a fabricated candidate count.", "Ändern Sie jeweils eine Annahme. Der Server liefert eine versionierte, transparente Berechnung – niemals eine erfundene Kandidatenzahl.")}</p>
    </div>
    <section className="scenario-lab">
      <div className="scenario-warning"><Icon name="shield" /><div><strong>{tr("TRANSPARENT SCENARIO — NOT OBSERVED MARKET DATA", "TRANSPARENTES SZENARIO — KEINE BEOBACHTETEN MARKTDATEN")}</strong><p>{tr("Salary and labour-market sources are linked separately and are not mixed into this index.", "Gehalts- und Arbeitsmarktquellen werden separat verlinkt und nicht in diesen Index vermischt.")}</p></div></div>
      <div className="scenario-controls">
        <label>{tr("Search radius", "Suchradius")}<input type="range" min="0" max="200" step="10" value={searchRadiusKm} onChange={(event) => setSearchRadiusKm(Number(event.target.value))} /><strong>{searchRadiusKm} km</strong></label>
        <label>{tr("Remote share", "Remote-Anteil")}<input type="range" min="0" max="100" step="10" value={remoteSharePercent} onChange={(event) => setRemoteSharePercent(Number(event.target.value))} /><strong>{remoteSharePercent}%</strong></label>
        <label>{tr("Seniority", "Seniorität")}<select value={seniority} onChange={(event) => setSeniority(event.target.value as Seniority)}>
          {(["entry", "junior", "mid", "senior", "lead", "executive"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </div>
      <div className="scenario-layout">
        <div className="skill-panel">
          <span>{tr("TEST AN ADDITIONAL MUST-HAVE", "ZUSÄTZLICHES MUSS-KRITERIUM TESTEN")}</span>
          <h2>{tr("Which skills are genuinely essential?", "Welche Skills sind wirklich unverzichtbar?")}</h2>
          <div className="custom-skill"><input value={customSkill} onChange={(event) => setCustomSkill(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addCustomSkill(); }} placeholder={tr("Enter a skill…", "Skill eingeben…")} /><button onClick={addCustomSkill} aria-label={tr("Add skill", "Skill hinzufügen")}><Icon name="plus" /></button></div>
          {skills.length === 0 && <p className="muted">{tr("Add a skill to create a what-if comparison.", "Fügen Sie einen Skill für einen Was-wäre-wenn-Vergleich hinzu.")}</p>}
          {skills.map((skill) => <button key={skill} className={selected.includes(skill) ? "selected" : ""} onClick={() => toggle(skill)}>
            <span>{selected.includes(skill) ? <Icon name="check" /> : <Icon name="plus" />}</span>
            <div><strong>{skill}</strong><small>{tr("Same disclosed adjustment as every added must-have", "Gleicher offengelegter Abschlag wie bei jedem zusätzlichen Muss-Kriterium")}</small></div>
          </button>)}
        </div>
        <div className="scenario-chart">
          <div className="chart-axis"><span>100</span><span>75</span><span>50</span><span>25</span></div>
          {loading && <div className="scenario-loading"><span className="spinner dark" />{tr("Recalculating…", "Berechnet neu…")}</div>}
          {error && <p className="inline-error" role="alert">{error}</p>}
          {scenario && <>
            <div className="bars">
              <div><span style={{ height: `${Math.max(8, baseline)}%` }}><b>{baseline}</b></span><small>{tr("Baseline", "Basis")}</small></div>
              <div><span className="active" style={{ height: `${Math.max(8, reach)}%` }}><b>{reach}</b></span><small>{tr("Scenario", "Szenario")}</small></div>
            </div>
            <div className="scenario-delta">
              <div><span>{tr("relative reach delta", "relative Reach-Änderung")}</span><strong>{delta > 0 ? "+" : ""}{delta}</strong></div>
              <div><span>{tr("calculation method", "Berechnungsmethode")}</span><strong>v2</strong></div>
            </div>
          </>}
        </div>
      </div>
      {scenario && scenario.whatIfRows.length > 0 && <div className="scenario-rows">
        {scenario.whatIfRows.map((row) => <div key={row.addedSkill}><strong>{row.addedSkill}</strong><span>{row.deltaPoints} {tr("points", "Punkte")} · {row.reachIndex}/100</span><p>{row.explanation[tr("en", "de") as "en" | "de"]}</p></div>)}
      </div>}
      {scenario && <div className="market-references">
        <strong>{tr("Official references — opened separately", "Amtliche Referenzen – separat geöffnet")}</strong>
        {scenario.references.map((reference) => <a key={reference.id} href={reference.url} target="_blank" rel="noreferrer"><Icon name="evidence" /><span>{reference.label[tr("en", "de") as "en" | "de"]}<small>{reference.note[tr("en", "de") as "en" | "de"]}</small></span><Icon name="arrow" /></a>)}
      </div>}
      <div className="scenario-actions">
        <p>{scenario?.disclaimer[tr("en", "de") as "en" | "de"] ?? tr("Waiting for a validated server calculation.", "Warte auf eine validierte Serverberechnung.")}</p>
        <button className="primary-button compact" onClick={onNext}>{tr("Review the brief", "Briefing prüfen")}<Icon name="arrow" /></button>
      </div>
    </section>
  </>;
}
