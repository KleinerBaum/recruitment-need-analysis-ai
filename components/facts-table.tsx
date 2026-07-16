import { Icon } from "@/components/icons";
import type { Translator } from "@/components/recruitment-workspace";
import type { Fact, FactStatus } from "@/lib/client-types";

export function StatusDot({ status }: { status: FactStatus }) {
  return <span className={`status-dot status-${status}`} title={status} />;
}

export function FactsTable({
  facts, tr, onUpdate, expanded = false
}: {
  facts: Fact[];
  tr: Translator;
  onUpdate: (id: string, value: string) => void;
  expanded?: boolean;
}) {
  const shown = expanded ? facts : facts.slice(0, 7);
  return <section className="facts-section">
    <div className="facts-head">
      <div>
        <h2>{tr("What we know so far", "Was wir bisher wissen")}</h2>
        <p>{tr("Every proposal keeps its status, confidence, and evidence trail.", "Jeder Vorschlag behält Status, Konfidenz und Evidenzspur.")}</p>
      </div>
      <div className="fact-legend">
        <span><StatusDot status="confirmed" />{tr("Confirmed", "Bestätigt")}</span>
        <span><StatusDot status="proposed" />{tr("Proposed", "Vorschlag")}</span>
        <span><StatusDot status="missing" />{tr("Missing", "Offen")}</span>
      </div>
    </div>
    <div className="facts-table">
      {shown.map((fact) => <div className="fact-row" key={fact.id}>
        <StatusDot status={fact.status} />
        <label htmlFor={`fact-${fact.id}`}>{fact.label}</label>
        <input
          id={`fact-${fact.id}`}
          value={fact.value}
          placeholder={tr("Not documented", "Nicht dokumentiert")}
          onChange={(event) => onUpdate(fact.id, event.target.value)}
        />
        <span className="fact-confidence">{fact.confidence ? `${Math.round(fact.confidence * 100)}%` : "—"}</span>
        <button aria-label={`${tr("Edit", "Bearbeiten")} ${fact.label}`}><Icon name="edit" /></button>
        {expanded && fact.evidence && <small className="fact-evidence"><Icon name="evidence" />{fact.evidence}</small>}
      </div>)}
    </div>
  </section>;
}
