import { Icon } from "@/components/icons";
import type { Translator } from "@/components/recruitment-workspace";

export function ScenarioPanel({ tr, skills, selected, setSelected, reach, pressure, onNext }: {
  tr: Translator; skills: string[]; selected: string[]; setSelected: (value: string[]) => void;
  reach: number; pressure: number; onNext: () => void;
}) {
  function toggle(skill: string) {
    setSelected(selected.includes(skill) ? selected.filter((item) => item !== skill) : [...selected, skill]);
  }
  const scarcity = [tr("medium", "mittel"), tr("high", "hoch"), tr("low", "niedrig"), tr("medium", "mittel")];
  return <>
    <div className="section-heading">
      <div className="eyebrow"><Icon name="chart" />03 · {tr("SCENARIO", "SZENARIO")}</div>
      <h1>{tr("Make trade-offs visible.", "Trade-offs sichtbar machen.")}</h1>
      <p>{tr("Test how additional must-have skills change a transparent, non-causal directional scenario.", "Testen Sie, wie zusätzliche Must-have-Skills ein transparentes, nicht kausales Richtungsszenario verändern.")}</p>
    </div>
    <section className="scenario-lab">
      <div className="scenario-warning"><Icon name="shield" /><div><strong>{tr("SYNTHETIC DEMO — NOT MARKET DATA", "SYNTHETISCHE DEMO — KEINE MARKTDATEN")}</strong><p>{tr("No candidate counts or observed salaries are claimed.", "Keine Kandidatenzahlen oder beobachteten Gehälter werden behauptet.")}</p></div></div>
      <div className="scenario-layout">
        <div className="skill-panel">
          <span>{tr("TOGGLE SKILL", "SKILL UMSCHALTEN")}</span>
          <h2>{tr("Which skills are genuinely essential?", "Welche Skills sind wirklich unverzichtbar?")}</h2>
          {skills.map((skill, index) => <button key={skill} className={selected.includes(skill) ? "selected" : ""} onClick={() => toggle(skill)}>
            <span>{selected.includes(skill) ? <Icon name="check" /> : <Icon name="plus" />}</span>
            <div><strong>{skill}</strong><small>{tr("Simulated scarcity", "Simulierte Knappheit")}: {scarcity[index]}</small></div>
          </button>)}
        </div>
        <div className="scenario-chart">
          <div className="chart-axis"><span>100</span><span>75</span><span>50</span><span>25</span></div>
          <div className="bars">
            <div><span style={{ height: "100%" }}><b>100</b></span><small>{tr("Baseline", "Basis")}</small></div>
            <div><span className="active" style={{ height: `${reach}%` }}><b>{reach}</b></span><small>{tr("Scenario", "Szenario")}</small></div>
          </div>
          <div className="scenario-delta">
            <div><span>{tr("relative candidate reach", "relative Kandidatenreichweite")}</span><strong>{reach - 100}</strong></div>
            <div><span>{tr("illustrative salary pressure", "illustrativer Gehaltsdruck")}</span><strong>+{pressure.toFixed(1)}%</strong></div>
          </div>
        </div>
      </div>
      <div className="scenario-actions">
        <p>{tr("Assumption: each additional must-have skill narrows the relative intersection. A real market provider can be connected later.", "Annahme: Jeder zusätzliche Must-have-Skill verkleinert die relative Schnittmenge. Reale Daten können später angebunden werden.")}</p>
        <button className="primary-button compact" onClick={onNext}>{tr("Review the brief", "Briefing prüfen")}<Icon name="arrow" /></button>
      </div>
    </section>
  </>;
}
