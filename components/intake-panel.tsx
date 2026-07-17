import { useRef, useState } from "react";

import { Icon } from "@/components/icons";
import type { Translator } from "@/components/recruitment-workspace";
import type { Locale } from "@/lib/client-types";

type DemoAd = { id: string; title: string; language: Locale; location: string; text: string };
type InputSource = { id: string; name?: string; type: "pasted_text" | "uploaded_file" | "source_url"; url?: string };
type EscoSeed = { uri: string; preferredLabel: string; version: string };
type EscoSearchPayload = { concepts: EscoSeed[]; warning?: string };

const TEXT_FILE_TYPES = new Set([".txt", ".md", ".html", ".htm"]);

function sourceId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function IntakePanel({
  locale, tr, jobAd, setJobAd, resolveSource, demoAds, selectedDemo, chooseDemo, analyse, loading, error,
}: {
  locale: Locale;
  tr: Translator;
  jobAd: string;
  setJobAd: (value: string) => void;
  resolveSource: (text: string, source: InputSource) => void;
  demoAds: readonly DemoAd[];
  selectedDemo: string | null;
  chooseDemo: (id: string) => void;
  analyse: () => void;
  loading: boolean;
  error: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [escoQuery, setEscoQuery] = useState("");
  const [escoResults, setEscoResults] = useState<EscoSeed[]>([]);
  const [escoLoading, setEscoLoading] = useState(false);
  const [escoWarning, setEscoWarning] = useState<string | null>(null);

  async function importUrl() {
    if (!url.trim() || urlLoading) return;
    setUrlLoading(true);
    setSourceError(null);
    try {
      const response = await fetch("/api/job-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !("text" in payload) || typeof payload.text !== "string") {
        const message = payload && typeof payload === "object" && "error" in payload
          && payload.error && typeof payload.error === "object" && "message" in payload.error
          && typeof payload.error.message === "string"
          ? payload.error.message
          : tr("The job-ad URL could not be imported.", "Die Stellenanzeigen-URL konnte nicht importiert werden.");
        throw new Error(message);
      }
      const sourceName = "sourceName" in payload && typeof payload.sourceName === "string" ? payload.sourceName : undefined;
      const sourceUrl = "url" in payload && typeof payload.url === "string" ? payload.url : undefined;
      resolveSource(payload.text, { id: sourceId("source-url"), name: sourceName, type: "source_url", ...(sourceUrl ? { url: sourceUrl } : {}) });
    } catch (cause) {
      setSourceError(cause instanceof Error ? cause.message : tr("The job-ad URL could not be imported.", "Die Stellenanzeigen-URL konnte nicht importiert werden."));
    } finally {
      setUrlLoading(false);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setSourceError(null);
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLocaleLowerCase();
    if (!TEXT_FILE_TYPES.has(extension)) {
      setSourceError(tr("Please upload a TXT, Markdown, or HTML file.", "Bitte laden Sie eine TXT-, Markdown- oder HTML-Datei hoch."));
      return;
    }
    if (file.size > 100_000) {
      setSourceError(tr("Please upload a file up to 100 KB.", "Bitte laden Sie eine Datei bis maximal 100 KB hoch."));
      return;
    }
    try {
      const text = (await file.text()).trim();
      if (text.length < 20) throw new Error(tr("The file does not contain enough job-ad text.", "Die Datei enthält nicht genügend Stellenanzeigentext."));
      resolveSource(text, { id: sourceId("uploaded-file"), name: file.name, type: "uploaded_file" });
    } catch (cause) {
      setSourceError(cause instanceof Error ? cause.message : tr("The file could not be read.", "Die Datei konnte nicht gelesen werden."));
    }
  }

  async function searchEsco() {
    if (escoQuery.trim().length < 2 || escoLoading) return;
    setEscoLoading(true);
    setSourceError(null);
    setEscoWarning(null);
    try {
      const response = await fetch(`/api/esco/seed-search?q=${encodeURIComponent(escoQuery)}&locale=${locale}`);
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !("concepts" in payload) || !Array.isArray(payload.concepts)) {
        throw new Error(tr("Official ESCO search is temporarily unavailable.", "Die offizielle ESCO-Suche ist vorübergehend nicht verfügbar."));
      }
      const result = payload as EscoSearchPayload;
      setEscoResults(result.concepts);
      setEscoWarning(result.warning ?? null);
    } catch (cause) {
      setSourceError(cause instanceof Error ? cause.message : tr("Official ESCO search is temporarily unavailable.", "Die offizielle ESCO-Suche ist vorübergehend nicht verfügbar."));
    } finally {
      setEscoLoading(false);
    }
  }

  function chooseEsco(concept: EscoSeed) {
    const text = [
      tr("ESCO role seed (not a job advertisement)", "ESCO-Rollenbasis (keine Stellenanzeige)"),
      `${tr("Role", "Rolle")}: ${concept.preferredLabel}`,
      `ESCO: ${concept.uri}`,
      "",
      tr(
        "This establishes the role only. Validate all hiring requirements in the following questions.",
        "Dies identifiziert nur die Rolle. Alle Anforderungen werden in den folgenden Fragen validiert.",
      ),
    ].join("\n");
    resolveSource(text, { id: sourceId("esco-role"), name: concept.preferredLabel, type: "source_url", url: concept.uri });
    setEscoResults([]);
  }

  return <>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><Icon name="sparkles" />{tr("AI + ESCO RECRUITMENT INTELLIGENCE", "KI + ESCO RECRUITING INTELLIGENCE")}</div>
        <h1>{tr("From job ad to", "Von der Stellenanzeige")}<br /><em>{tr("hiring clarity.", "zur klaren Vakanz.")}</em><br />{tr("In minutes.", "In Minuten.")}</h1>
        <p>{tr("Needly finds what your vacancy says, what it leaves open, and the few questions that make the biggest difference.", "Needly erkennt, was Ihre Vakanz bereits sagt, was offen bleibt und welche wenigen Fragen den größten Unterschied machen.")}</p>
        <div className="trust-row" id="trust"><span><Icon name="evidence" />{tr("Source-led, never guessed", "Quellenbasiert, nie erfunden")}</span><span><Icon name="language" />{tr("German & English", "Deutsch & Englisch")}</span><span><Icon name="shield" />{tr("AGG-aware by design", "AGG-konform gedacht")}</span></div>
      </div>

      <div className="intake-card">
        <div className="intake-card-head"><div><span className="step-count">01</span><h2>{tr("Start with what you have", "Starten Sie mit dem, was vorliegt")}</h2></div><p>{tr("Paste a job ad, add its URL, upload a text file, or identify a role with ESCO. Every fact remains traceable to its source.", "Fügen Sie eine Stellenanzeige ein, ergänzen Sie ihre URL, laden Sie eine Textdatei hoch oder identifizieren Sie eine Rolle mit ESCO. Jeder Fakt bleibt zur Quelle rückverfolgbar.")}</p></div>
        <div className={`textarea-wrap ${jobAd ? "has-content" : ""}`}><textarea aria-label={tr("Complete job advertisement", "Vollständige Stellenanzeige")} value={jobAd} onChange={(event) => setJobAd(event.target.value)} placeholder={tr("Paste the complete job advertisement here…", "Vollständige Stellenanzeige hier einfügen…")} maxLength={100000} /><span className="char-count">{jobAd.length.toLocaleString(locale)} / 100,000</span></div>
        <div className="source-options">
          <label className="source-control"><span>{tr("Job-ad URL", "Stellenanzeigen-URL")}</span><div><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void importUrl(); }} placeholder="https://…" /><button type="button" className="outline-button" disabled={!url.trim() || urlLoading} onClick={() => void importUrl()}>{urlLoading ? tr("Importing…", "Import läuft…") : tr("Import", "Importieren")}</button></div></label>
          <div className="source-control"><span>{tr("Job-ad file", "Stellenanzeigen-Datei")}</span><input ref={fileInputRef} className="visually-hidden" type="file" accept=".txt,.md,.html,.htm,text/plain,text/markdown,text/html" onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /><button type="button" className="outline-button" onClick={() => fileInputRef.current?.click()}><Icon name="document" />{tr("Upload text file", "Textdatei hochladen")}</button></div>
          <label className="source-control"><span>{tr("No job ad yet? Find a role with ESCO", "Noch keine Anzeige? Rolle mit ESCO finden")}</span><div><input value={escoQuery} onChange={(event) => setEscoQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchEsco(); }} placeholder={tr("e.g. Data Engineer", "z. B. Data Engineer")} /><button type="button" className="outline-button" disabled={escoQuery.trim().length < 2 || escoLoading} onClick={() => void searchEsco()}>{escoLoading ? tr("Searching…", "Suche läuft…") : tr("Find role", "Rolle finden")}</button></div></label>
        </div>
        {escoResults.length > 0 && <div className="esco-results" aria-label={tr("ESCO role matches", "ESCO-Rollentreffer")}>{escoResults.map((concept) => <button type="button" key={concept.uri} onClick={() => chooseEsco(concept)}><strong>{concept.preferredLabel}</strong><span>{tr("Use as role seed", "Als Rollenbasis nutzen")}</span></button>)}</div>}
        {escoWarning && <p className="source-note">{escoWarning}</p>}
        {sourceError && <p className="intake-error" role="alert">{sourceError}</p>}
        <div className="demo-picker"><span>{tr("Try a synthetic example", "Synthetisches Beispiel testen")}</span><div className="demo-list">{demoAds.map((demo) => <button key={demo.id} className={selectedDemo === demo.id ? "selected" : ""} onClick={() => chooseDemo(demo.id)}><span>{demo.language.toUpperCase()}</span>{demo.title}</button>)}</div></div>
        <button className="primary-button" disabled={jobAd.trim().length < 40 || loading} onClick={analyse}>{loading ? <><span className="spinner" />{tr("Building your evidence map…", "Evidenzkarte wird erstellt…")}</> : <>{tr("Analyse recruitment need", "Personalbedarf analysieren")}<Icon name="arrow" /></>}</button>
        {error && <p className="intake-error" role="alert">{error}</p>}
        <div className="privacy-note"><Icon name="shield" />{tr("Personal-data masking · OpenAI response storage disabled", "Maskierung personenbezogener Daten · OpenAI-Antwortspeicherung deaktiviert")}</div>
      </div>
    </section>
    <section className="process-strip" id="how">{[tr("Read the source", "Quelle verstehen"), tr("Close the gaps", "Lücken schließen"), tr("Model trade-offs", "Trade-offs modellieren"), tr("Activate the brief", "Brief aktivieren")].map((label, index) => <div key={label}><span>0{index + 1}</span><p>{label}</p>{index < 3 && <Icon name="arrow" />}</div>)}</section>
  </>;
}
