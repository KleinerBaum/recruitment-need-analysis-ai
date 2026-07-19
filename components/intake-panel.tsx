import { useRef, useState } from "react";

import { Icon } from "@/components/icons";
import type { Translator } from "@/components/recruitment-workspace";
import type { Locale } from "@/lib/client-types";

type DemoAd = { id: string; title: string; language: Locale; location: string; text: string };
type InputSource = { id: string; name?: string; type: "pasted_text" | "uploaded_file" | "source_url"; url?: string };
type EscoSeed = { uri: string; preferredLabel: string; version: string };
type EscoSearchPayload = { concepts: EscoSeed[]; warning?: string };
type SourceMode = "text" | "url" | "file" | "esco";

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
  const [sourceMode, setSourceMode] = useState<SourceMode>("text");

  const normalizedJobAd = jobAd.toLocaleLowerCase();
  const inputSignals = [
    {
      label: tr("Role & purpose", "Rolle & Zweck"),
      detected: jobAd.trim().length >= 40,
    },
    {
      label: tr("Tasks & outcomes", "Aufgaben & Ergebnisse"),
      detected: /\b(?:aufgab|verantwort|responsibilit|outcome|mission|zweck)\w*/iu.test(normalizedJobAd),
    },
    {
      label: tr("Skills & experience", "Skills & Erfahrung"),
      detected: /\b(?:skill|kenntnis|erfahrung|experience|qualifikation|profil)\w*/iu.test(normalizedJobAd),
    },
    {
      label: tr("Working conditions", "Rahmenbedingungen"),
      detected: /\b(?:remote|hybrid|standort|location|gehalt|salary|benefit|arbeitszeit)\w*/iu.test(normalizedJobAd),
    },
  ];
  const detectedSignalCount = inputSignals.filter((signal) => signal.detected).length;

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

  const sourceTabs = [
    ["text", tr("Text", "Text"), "document"],
    ["url", "URL", "search"],
    ["file", tr("File", "Datei"), "document"],
    ["esco", "ESCO", "evidence"],
  ] as const;

  return <>
    <section className="hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-copy">
        <div className="eyebrow hero-eyebrow">BEFORE YOU SEARCH</div>
        <h1>{tr("Clarify first.", "Erst klären.")}<br /><em>{tr("Then find.", "Dann finden.")}</em></h1>
        <p>{tr(
          "Needly turns a job ad into a robust hiring brief—and shows which requirements change reach, salary context, and hiring risk.",
          "Needly macht aus einer Stellenanzeige ein belastbares Hiring Briefing – und zeigt, welche Anforderungen Reichweite, Gehaltskontext und Besetzungsrisiko verändern.",
        )}</p>
        <div className="hero-actions">
          <a className="hero-primary" href="#intake">{tr("Sharpen the role", "Rolle schärfen")}<Icon name="arrow" /></a>
          <a className="hero-secondary" href="#how">{tr("How it works", "So funktioniert es")}</a>
        </div>
        <div className="trust-row" id="trust">
          <span><i />{tr("Evidence, not guesses", "Belegt statt geraten")}</span>
          <span><i />{tr("Impact made visible", "Wirkung sichtbar")}</span>
          <span><i />{tr("Ready for a decision", "Entscheidung bereit")}</span>
        </div>
      </div>

      <div className="hero-roleprint" aria-hidden="true">
        <div className="roleprint-radar"><i /><i /><i /></div>
        <div className="roleprint-core"><span>ROLE</span><strong>PRINT</strong></div>
        <span className="hero-signal signal-tasks">{tr("Tasks", "Aufgaben")}</span>
        <span className="hero-signal signal-skills">Skills</span>
        <span className="hero-signal signal-context">{tr("Conditions", "Rahmen")}</span>
        <span className="hero-signal signal-impact">{tr("Market impact", "Marktwirkung")}</span>
      </div>

      <div className="intake-card" id="intake">
        <div className="intake-card-head">
          <div><span className="step-count">01</span><span className="intake-kicker">{tr("START · BRING WHAT EXISTS", "START · VORHANDENES EINBRINGEN")}</span></div>
          <h2>{tr("What do we already know about the role?", "Was wissen wir bereits über die Rolle?")}</h2>
          <p>{tr("Bring a job ad, URL, file, or ESCO role. Every later decision stays traceable to this starting point.", "Stellenanzeige, URL, Datei oder ESCO-Rolle einbringen. Jede spätere Entscheidung bleibt zu diesem Ausgangspunkt rückverfolgbar.")}</p>
        </div>

        <div className="source-tabs" role="group" aria-label={tr("Choose input source", "Eingabequelle wählen")}>
          {sourceTabs.map(([mode, label, icon]) => <button key={mode} type="button" className={sourceMode === mode ? "active" : ""} aria-pressed={sourceMode === mode} onClick={() => setSourceMode(mode)}><Icon name={icon} />{label}</button>)}
        </div>

        <div className="intake-workbench">
          <div className="intake-input-pane">
            {sourceMode === "text" && <div className={`textarea-wrap ${jobAd ? "has-content" : ""}`}><textarea aria-label={tr("Complete job advertisement", "Vollständige Stellenanzeige")} value={jobAd} onChange={(event) => setJobAd(event.target.value)} placeholder={tr("Paste the job advertisement or role notes…", "Stellenanzeige oder Rollennotizen einfügen…")} maxLength={100000} /><span className="char-count">{jobAd.length.toLocaleString(locale)} / 100,000</span></div>}

            {sourceMode === "url" && <label className="source-control source-stage"><span>{tr("Import a public job-ad URL", "Öffentliche Stellenanzeigen-URL importieren")}</span><div><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void importUrl(); }} placeholder="https://…" /><button type="button" className="outline-button" disabled={!url.trim() || urlLoading} onClick={() => void importUrl()}>{urlLoading ? tr("Importing…", "Import läuft…") : tr("Import", "Importieren")}</button></div><small>{tr("The imported text will be shown before analysis.", "Der importierte Text wird vor der Analyse sichtbar.")}</small></label>}

            {sourceMode === "file" && <div className="source-stage upload-stage"><input ref={fileInputRef} className="visually-hidden" type="file" accept=".txt,.md,.html,.htm,text/plain,text/markdown,text/html" onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /><Icon name="document" /><strong>{tr("Upload role text", "Rollentext hochladen")}</strong><p>TXT · Markdown · HTML · max. 100 KB</p><button type="button" className="outline-button" onClick={() => fileInputRef.current?.click()}>{tr("Choose file", "Datei wählen")}</button></div>}

            {sourceMode === "esco" && <label className="source-control source-stage"><span>{tr("Start from an official occupation", "Mit einem offiziellen Beruf starten")}</span><div><input value={escoQuery} onChange={(event) => setEscoQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchEsco(); }} placeholder={tr("e.g. Data Engineer", "z. B. Data Engineer")} /><button type="button" className="outline-button" disabled={escoQuery.trim().length < 2 || escoLoading} onClick={() => void searchEsco()}>{escoLoading ? tr("Searching…", "Suche läuft…") : tr("Find role", "Rolle finden")}</button></div><small>{tr("ESCO identifies the role only—not its hiring requirements.", "ESCO identifiziert nur die Rolle – nicht ihre Anforderungen.")}</small></label>}

            {sourceMode !== "text" && jobAd && <button type="button" className="imported-source" onClick={() => setSourceMode("text")}><Icon name="check" /><span><strong>{tr("Source accepted", "Quelle übernommen")}</strong>{jobAd.length.toLocaleString(locale)} {tr("characters ready to review", "Zeichen zur Prüfung bereit")}</span><Icon name="arrow" /></button>}

            {escoResults.length > 0 && <div className="esco-results" aria-label={tr("ESCO role matches", "ESCO-Rollentreffer")}>{escoResults.map((concept) => <button type="button" key={concept.uri} onClick={() => chooseEsco(concept)}><strong>{concept.preferredLabel}</strong><span>{tr("Use as role seed", "Als Rollenbasis nutzen")}</span></button>)}</div>}
            {escoWarning && <p className="source-note">{escoWarning}</p>}
            {sourceError && <p className="intake-error" role="alert">{sourceError}</p>}
          </div>

          <aside className="signal-preview" aria-live="polite">
            <div className="signal-preview-head"><span>{tr("ALREADY DETECTED", "BEREITS ERKANNT")}</span><strong>{detectedSignalCount}/4</strong></div>
            <p>{tr("Pre-check of the input—not yet an assessment.", "Vorprüfung der Eingabe – noch keine Bewertung.")}</p>
            <div className="signal-list">{inputSignals.map((signal) => <div key={signal.label} className={signal.detected ? "detected" : ""}><span>{signal.detected ? <Icon name="check" /> : <i />}</span>{signal.label}</div>)}</div>
            <div className="signal-next"><Icon name="sparkles" /><span><strong>{tr("Next", "Als Nächstes")}</strong>{tr("Needly separates evidence, open decisions, and modeled impact.", "Needly trennt Belege, offene Entscheidungen und modellierte Wirkung.")}</span></div>
          </aside>
        </div>

        <div className="intake-footer">
          <button className="primary-button" disabled={jobAd.trim().length < 40 || loading} onClick={analyse}>{loading ? <><span className="spinner" />{tr("Building the decision map…", "Entscheidungskarte entsteht…")}</> : <>{tr("Sharpen the role", "Rolle schärfen")}<Icon name="arrow" /></>}</button>
          <div className="privacy-note"><Icon name="shield" />{tr("Personal-data masking · OpenAI response storage disabled", "Maskierung personenbezogener Daten · OpenAI-Antwortspeicherung deaktiviert")}</div>
          {error && <p className="intake-error" role="alert">{error}</p>}
        </div>

        <div className="demo-picker"><span>{tr("Synthetic starting points", "Synthetische Startpunkte")}</span><div className="demo-list">{demoAds.map((demo) => <button type="button" key={demo.id} className={selectedDemo === demo.id ? "selected" : ""} onClick={() => { setSourceMode("text"); chooseDemo(demo.id); }}><span>{demo.language.toUpperCase()}</span>{demo.title}</button>)}</div></div>
      </div>
    </section>

    <section className="process-strip" id="how">
      <div className="process-intro"><span>{tr("THE DECISION FLOW", "DER ENTSCHEIDUNGSFLOW")}</span><p>{tr("Four deliberate steps before the search begins.", "Vier bewusste Schritte, bevor die Suche beginnt.")}</p></div>
      {[
        [tr("Start", "Start"), tr("Bring what exists", "Vorhandenes einbringen")],
        [tr("Sharpen", "Schärfen"), tr("Clarify missing decisions", "Fehlende Entscheidungen klären")],
        [tr("Simulate", "Simulieren"), tr("Make impact visible", "Auswirkungen sichtbar machen")],
        [tr("Decide", "Entscheiden"), tr("Review and activate the brief", "Briefing prüfen und aktivieren")],
      ].map(([title, description], index) => <div className="process-step" key={title}><span>0{index + 1}</span><div><strong>{title}</strong><p>{description}</p></div>{index < 3 && <Icon name="arrow" />}</div>)}
    </section>
  </>;
}
