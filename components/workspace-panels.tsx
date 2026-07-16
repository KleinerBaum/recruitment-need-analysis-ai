import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { Icon } from "@/components/icons";
import { FactsTable, StatusDot } from "@/components/facts-table";
import type { Translator } from "@/components/recruitment-workspace";
import type { Analysis, Fact, Question } from "@/lib/client-types";

export function WorkspaceNav({ tr, title, completion, step, setStep, mode }: {
  tr: Translator; title: string; completion: number; step: number;
  setStep: (value: number) => void; mode: Analysis["mode"];
}) {
  const items = [
    [1, tr("Source", "Quelle"), "document"],
    [2, tr("Clarify", "Klären"), "questions"],
    [3, tr("Scenario", "Szenario"), "chart"],
    [4, tr("Review", "Prüfen"), "check"]
  ] as const;
  return <aside className="workspace-nav">
    <div className="workspace-label">{tr("Vacancy workspace", "Vakanz-Workspace")}</div>
    <div className="score-block">
      <div className="score-ring" style={{ "--score": `${completion * 3.6}deg` } as CSSProperties}><strong>{completion}</strong><span>%</span></div>
      <div><strong>{title}</strong><span>{tr("brief completeness", "Vollständigkeit")}</span></div>
    </div>
    <nav className="step-nav">
      {items.map(([number, label, icon]) => <button key={number} className={`${step === number ? "active" : ""} ${step > number ? "done" : ""}`} onClick={() => setStep(number)}>
        <span><Icon name={icon} /></span><div><small>0{number}</small>{label}</div>{step > number && <Icon name="check" />}
      </button>)}
    </nav>
    <div className="mode-card">
      <span className={mode === "ai" ? "mode-ai" : "mode-rule"}>{mode === "ai" ? tr("AI-ENRICHED", "KI-ANGEREICHERT") : tr("DETERMINISTIC MODE", "DETERMINISTISCHER MODUS")}</span>
      <p>{tr("Missing facts stay missing until you confirm them.", "Fehlende Fakten bleiben offen, bis Sie sie bestätigen.")}</p>
    </div>
  </aside>;
}

export function SourceReview({ tr, jobAd, facts, onNext }: { tr: Translator; jobAd: string; facts: Fact[]; onNext: () => void }) {
  return <>
    <div className="section-heading">
      <div className="eyebrow"><Icon name="document" />01 · {tr("SOURCE", "QUELLE")}</div>
      <h1>{tr("Your source, cleanly structured.", "Ihre Quelle, sauber strukturiert.")}</h1>
      <p>{tr("Highlighted statements become proposals; unsupported details stay open.", "Markierte Aussagen werden als Vorschläge übernommen; nicht belegte Angaben bleiben offen.")}</p>
    </div>
    <div className="source-grid">
      <article className="source-document">
        <div className="document-bar"><span /><span /><span /><small>{tr("Original job advertisement", "Originale Stellenanzeige")}</small></div>
        <pre>{jobAd}</pre>
      </article>
      <div className="source-facts">
        <h2>{tr("Detected signals", "Erkannte Signale")}</h2>
        {facts.slice(0, 7).map((fact) => <div key={fact.id}><StatusDot status={fact.status} /><span>{fact.label}</span><strong>{fact.value || tr("Not documented", "Nicht dokumentiert")}</strong></div>)}
        <button className="primary-button compact" onClick={onNext}>{tr("Clarify the gaps", "Lücken klären")}<Icon name="arrow" /></button>
      </div>
    </div>
  </>;
}

export function ClarifyPanel({
  tr, analysis, question, questionIndex, answer, setAnswer, whyOpen, setWhyOpen, saveAnswer, updateFact, onNext
}: {
  tr: Translator; analysis: Analysis; question?: Question; questionIndex: number; answer: string;
  setAnswer: Dispatch<SetStateAction<string>>; whyOpen: boolean; setWhyOpen: Dispatch<SetStateAction<boolean>>;
  saveAnswer: (unresolved?: boolean) => void; updateFact: (id: string, value: string) => void; onNext: () => void;
}) {
  return <>
    <div className="section-heading">
      <div className="eyebrow"><Icon name="sparkles" />{tr("NEXT BEST QUESTION", "NÄCHSTE BESTE FRAGE")}</div>
      <h1>{tr("One answer, maximum clarity.", "Eine Antwort, maximale Klarheit.")}</h1>
      <p>{tr("Questions are ranked by impact and dependency—not generated as a generic checklist.", "Fragen werden nach Wirkung und Abhängigkeiten priorisiert – nicht als generische Checkliste erzeugt.")}</p>
    </div>
    {question ? <article className="question-card">
      <div className="question-meta"><span>{String(questionIndex + 1).padStart(2, "0")}</span><div className="impact-badge"><i />HIGH IMPACT</div><small>{Math.max(0, analysis.questions.length - questionIndex - 1)} {tr("questions remaining", "Fragen verbleiben")}</small></div>
      <h2>{question.text}</h2>
      {question.options?.length ? <div className="choice-grid">
        {question.options.map((option) => <button key={option} className={answer === option ? "selected" : ""} onClick={() => setAnswer(option)}><span>{answer === option && <Icon name="check" />}</span>{option}</button>)}
      </div> : <textarea className="answer-input" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={tr("Type a concise answer…", "Kurze Antwort eingeben…")} />}
      <button className="why-toggle" onClick={() => setWhyOpen((open) => !open)}><Icon name="evidence" />{tr("Why this question?", "Warum diese Frage?")}<Icon name="chevron" className={whyOpen ? "rotate" : ""} /></button>
      {whyOpen && <div className="why-panel"><p>{question.rationale}</p></div>}
      <div className="question-actions"><button className="text-button" onClick={() => saveAnswer(true)}>{tr("Mark as unresolved", "Als ungeklärt markieren")}</button><button className="primary-button compact" disabled={!answer.trim()} onClick={() => saveAnswer()}>{tr("Save answer", "Antwort speichern")}<Icon name="arrow" /></button></div>
    </article> : <button className="primary-button" onClick={onNext}>{tr("Continue to scenario", "Weiter zum Szenario")}<Icon name="arrow" /></button>}
    <FactsTable facts={analysis.facts} tr={tr} onUpdate={updateFact} />
  </>;
}
