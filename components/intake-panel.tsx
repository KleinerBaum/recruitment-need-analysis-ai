import { Icon } from "@/components/icons";
import type { Translator } from "@/components/recruitment-workspace";
import type { Locale } from "@/lib/client-types";

type DemoAd = { id: string; title: string; language: Locale; location: string; text: string };

export function IntakePanel({
  locale, tr, jobAd, setJobAd, demoAds, selectedDemo, chooseDemo, analyse, loading, error
}: {
  locale: Locale;
  tr: Translator;
  jobAd: string;
  setJobAd: (value: string) => void;
  demoAds: readonly DemoAd[];
  selectedDemo: string | null;
  chooseDemo: (id: string) => void;
  analyse: () => void;
  loading: boolean;
  error: string | null;
}) {
  return <>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><Icon name="sparkles" />{tr("AI + ESCO RECRUITMENT INTELLIGENCE", "KI + ESCO RECRUITING INTELLIGENCE")}</div>
        <h1>
          {tr("From job ad to", "Von der Stellenanzeige")}<br />
          <em>{tr("hiring clarity.", "zur klaren Vakanz.")}</em><br />
          {tr("In minutes.", "In Minuten.")}
        </h1>
        <p>{tr(
          "Needly finds what your vacancy says, what it leaves open, and the few questions that make the biggest difference.",
          "Needly erkennt, was Ihre Vakanz bereits sagt, was offen bleibt und welche wenigen Fragen den größten Unterschied machen."
        )}</p>
        <div className="trust-row" id="trust">
          <span><Icon name="evidence" />{tr("Source-led, never guessed", "Quellenbasiert, nie erfunden")}</span>
          <span><Icon name="language" />{tr("German & English", "Deutsch & Englisch")}</span>
          <span><Icon name="shield" />{tr("AGG-aware by design", "AGG-konform gedacht")}</span>
        </div>
      </div>

      <div className="intake-card">
        <div className="intake-card-head">
          <div><span className="step-count">01</span><h2>{tr("Start with what you have", "Starten Sie mit dem, was vorliegt")}</h2></div>
          <p>{tr(
            "Paste a job ad or choose a synthetic example. We only propose facts that can be traced to the source.",
            "Fügen Sie eine Stellenanzeige ein oder wählen Sie ein synthetisches Beispiel. Jeder Fakt bleibt zur Quelle rückverfolgbar."
          )}</p>
        </div>
        <div className={`textarea-wrap ${jobAd ? "has-content" : ""}`}>
          <textarea
            aria-label={tr("Complete job advertisement", "Vollständige Stellenanzeige")}
            value={jobAd}
            onChange={(event) => setJobAd(event.target.value)}
            placeholder={tr("Paste the complete job advertisement here…", "Vollständige Stellenanzeige hier einfügen…")}
            maxLength={30000}
          />
          <span className="char-count">{jobAd.length.toLocaleString(locale)} / 30,000</span>
        </div>
        <div className="demo-picker">
          <span>{tr("Try a synthetic example", "Synthetisches Beispiel testen")}</span>
          <div className="demo-list">
            {demoAds.map((demo) => (
              <button key={demo.id} className={selectedDemo === demo.id ? "selected" : ""} onClick={() => chooseDemo(demo.id)}>
                <span>{demo.language.toUpperCase()}</span>{demo.title}
              </button>
            ))}
          </div>
        </div>
        <button className="primary-button" disabled={jobAd.trim().length < 40 || loading} onClick={analyse}>
          {loading
            ? <><span className="spinner" />{tr("Building your evidence map…", "Evidenzkarte wird erstellt…")}</>
            : <>{tr("Analyse recruitment need", "Personalbedarf analysieren")}<Icon name="arrow" /></>}
        </button>
        {error && <p className="intake-error" role="alert">{error}</p>}
        <div className="privacy-note"><Icon name="shield" />{tr("Personal-data masking · OpenAI response storage disabled", "Maskierung personenbezogener Daten · OpenAI-Antwortspeicherung deaktiviert")}</div>
      </div>
    </section>
    <section className="process-strip" id="how">
      {[
        tr("Read the source", "Quelle verstehen"),
        tr("Close the gaps", "Lücken schließen"),
        tr("Model trade-offs", "Trade-offs modellieren"),
        tr("Activate the brief", "Brief aktivieren")
      ].map((label, index) => (
        <div key={label}><span>0{index + 1}</span><p>{label}</p>{index < 3 && <Icon name="arrow" />}</div>
      ))}
    </section>
  </>;
}
