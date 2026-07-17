"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import type { Translator } from "@/components/recruitment-workspace";
import type { Fact, FactStatus } from "@/lib/client-types";

export function StatusDot({ status }: { status: FactStatus }) {
  return <span className={`status-dot status-${status}`} title={status} />;
}

function FactRow({ fact, tr, expanded, onUpdate }: {
  fact: Fact;
  tr: Translator;
  expanded: boolean;
  onUpdate: (id: Fact["id"], value: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(fact.value);
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (draft === fact.value || saving) return;
    setSaving(true);
    try {
      await onUpdate(fact.id, draft);
    } finally {
      setSaving(false);
    }
  }

  const stateLabel = fact.status === "confirmed"
    ? tr("Team confirmed", "Vom Team bestätigt")
    : fact.status === "proposed"
      ? tr("AI proposal", "KI-Vorschlag")
      : fact.status === "conflict"
        ? tr("Conflict", "Konflikt")
        : fact.status === "not_applicable"
          ? tr("Not applicable", "Nicht anwendbar")
          : fact.status === "declined"
            ? tr("Skipped", "Übersprungen")
            : tr("Open", "Offen");

  return <div className="fact-row">
    <StatusDot status={fact.status} />
    <label htmlFor={`fact-${fact.id}`}>{fact.label}</label>
    <input
      id={`fact-${fact.id}`}
      value={draft}
      placeholder={tr("Not documented", "Nicht dokumentiert")}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
    <span className="fact-confidence">{saving ? tr("Saving…", "Speichert…") : stateLabel}</span>
    {expanded && (fact.evidence.length > 0 || fact.provenance) && <details className="fact-evidence">
      <summary><Icon name="evidence" />{tr(`${fact.evidence.length} evidence item(s)`, `${fact.evidence.length} Evidenzbeleg(e)`)}</summary>
      {fact.evidence.slice(0, 5).map((evidence) => <blockquote key={evidence.id}>“{evidence.quote}” <small>{evidence.sourceType} · {evidence.sourceId}</small></blockquote>)}
      {fact.provenance && <p>{fact.provenance.method}{fact.provenance.model ? ` · ${fact.provenance.model}` : ""}{fact.provenance.promptVersion ? ` · ${fact.provenance.promptVersion}` : ""}</p>}
    </details>}
    {expanded && fact.conflictDescription && <small className="fact-conflict">{fact.conflictDescription}</small>}
  </div>;
}

export function FactsTable({
  facts, tr, onUpdate, expanded = false
}: {
  facts: Fact[];
  tr: Translator;
  onUpdate: (id: Fact["id"], value: string) => void | Promise<void>;
  expanded?: boolean;
}) {
  const shown = expanded ? facts : facts.slice(0, 9);
  return <section className="facts-section">
    <div className="facts-head">
      <div>
        <h2>{tr("What we know so far", "Was wir bisher wissen")}</h2>
        <p>{tr("All 28 canonical fields retain evidence, provenance, and conflict state.", "Alle 28 kanonischen Felder behalten Evidenz, Provenienz und Konfliktstatus.")}</p>
      </div>
      <div className="fact-legend">
        <span><StatusDot status="confirmed" />{tr("Confirmed", "Bestätigt")}</span>
        <span><StatusDot status="proposed" />{tr("Proposed", "Vorschlag")}</span>
        <span><StatusDot status="missing" />{tr("Missing", "Offen")}</span>
        <span><StatusDot status="not_applicable" />{tr("Not applicable", "Nicht anwendbar")}</span>
      </div>
    </div>
    <div className="facts-table">
      {shown.map((fact) => <FactRow key={`${fact.id}:${fact.value}`} fact={fact} tr={tr} expanded={expanded} onUpdate={onUpdate} />)}
    </div>
  </section>;
}
