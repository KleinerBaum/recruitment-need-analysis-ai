"use client";

import { useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { IntakePanel } from "@/components/intake-panel";
import { ClarifyPanel, SourceReview, WorkspaceNav } from "@/components/workspace-panels";
import { IntelligenceRail, ReviewPanel, ScenarioPanel } from "@/components/scenario-review";
import { normalizeServerAnalysis } from "@/lib/client-normalize";
import type { Analysis, Locale } from "@/lib/client-types";

type DemoAd = { id: string; title: string; language: Locale; location: string; text: string };
export type Translator = (en: string, de: string) => string;

function Brand() {
  return <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>needly</span></div>;
}

export function RecruitmentWorkspace({ demoAds }: { demoAds: readonly DemoAd[] }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [jobAd, setJobAd] = useState("");
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [artifact, setArtifact] = useState<"brief" | "interview" | "ad">("brief");
  const [copied, setCopied] = useState(false);
  const tr: Translator = useCallback((en, de) => locale === "de" ? de : en, [locale]);

  const facts = analysis?.facts ?? [];
  const completion = facts.length
    ? Math.round(facts.filter((fact) => fact.status !== "missing").length / facts.length * 100)
    : 0;
  const question = analysis?.questions[questionIndex];
  const skills = useMemo(() => [...new Set([
    ...(analysis?.esco?.skills ?? []),
    tr("Stakeholder management", "Stakeholder-Management"),
    tr("Data fluency", "Datenkompetenz"),
    tr("Leadership", "Führung")
  ])].slice(0, 4), [analysis, tr]);
  const reach = Math.max(35, 100 - selectedSkills.length * 13);
  const pressure = selectedSkills.length * 3.4;

  function chooseDemo(id: string) {
    const demo = demoAds.find((item) => item.id === id);
    if (!demo) return;
    setSelectedDemo(id);
    setLocale(demo.language);
    setJobAd(demo.text);
  }

  async function analyse() {
    if (jobAd.trim().length < 40) return;
    setLoading(true);
    let result: unknown = null;
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobAdText: jobAd, locale })
      });
      if (response.ok) result = await response.json();
    } catch {
      result = null;
    }
    const normalized = normalizeServerAnalysis(result, jobAd, locale);
    if (!normalized.esco && normalized.title) {
      try {
        const escoResponse = await fetch(`/api/esco/search?q=${encodeURIComponent(normalized.title)}&locale=${locale}&type=occupation&limit=3`);
        const escoPayload = escoResponse.ok ? await escoResponse.json() as { concepts?: Array<{ preferredLabel: string; uri: string }> } : null;
        const concept = escoPayload?.concepts?.[0];
        if (concept) {
          normalized.esco = { title: concept.preferredLabel, uri: concept.uri, confidence: null, skills: [] };
        }
      } catch {
        // ESCO remains explicitly unconfirmed when the verified provider is unavailable.
      }
    }
    setAnalysis(normalized);
    setLoading(false);
    setStep(2);
    setQuestionIndex(0);
  }

  function saveAnswer(unresolved = false) {
    if (!analysis || !question) return;
    const value = unresolved ? "" : answer.trim();
    setAnalysis({
      ...analysis,
      facts: analysis.facts.map((fact) => fact.id === question.factId ? {
        ...fact,
        value,
        status: value ? "confirmed" : "missing",
        confidence: value ? 1 : undefined,
        evidence: value ? tr("Confirmed by hiring team", "Vom Hiring Team bestätigt") : fact.evidence
      } : fact)
    });
    setAnswer("");
    setWhyOpen(false);
    if (questionIndex < analysis.questions.length - 1) setQuestionIndex((value) => value + 1);
    else setStep(3);
  }

  function updateFact(id: string, value: string) {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      facts: analysis.facts.map((fact) => fact.id === id
        ? { ...fact, value, status: value ? "confirmed" : "missing", confidence: value ? 1 : undefined }
        : fact)
    });
  }

  const artifactText = useMemo(() => {
    if (!analysis) return "";
    const known = analysis.facts.filter((fact) => fact.value);
    if (artifact === "interview") {
      return [
        tr(`Interview plan — ${analysis.title}`, `Interviewleitfaden — ${analysis.title}`),
        "",
        ...known.slice(0, 5).map((fact, index) => `${index + 1}. ${tr("Please demonstrate with a concrete example", "Bitte belegen Sie anhand eines konkreten Beispiels")}: ${fact.label}.`),
        "",
        tr("Score 1–5 against pre-defined behavioural anchors. Do not ask about protected personal characteristics.", "Bewertung 1–5 anhand vorab definierter Verhaltensanker. Keine Fragen zu geschützten persönlichen Merkmalen.")
      ].join("\n");
    }
    if (artifact === "ad") {
      return [analysis.title, "", analysis.summary, "", ...known.map((fact) => `${fact.label}: ${fact.value}`)].join("\n");
    }
    return [
      tr(`Hiring brief — ${analysis.title}`, `Hiring Brief — ${analysis.title}`),
      analysis.summary,
      "",
      ...analysis.facts.map((fact) => `${fact.label}: ${fact.value || tr("Not documented", "Nicht dokumentiert")}`),
      "",
      `ESCO: ${analysis.esco?.title ?? tr("Not confirmed", "Nicht bestätigt")}`
    ].join("\n");
  }, [analysis, artifact, tr]);

  async function copyArtifact() {
    await navigator.clipboard.writeText(artifactText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function reset() {
    setAnalysis(null);
    setJobAd("");
    setSelectedDemo(null);
    setStep(1);
    setQuestionIndex(0);
    setSelectedSkills([]);
  }

  return (
    <main className={analysis ? "app app-workspace" : "app"}>
      <header className="topbar">
        <Brand />
        <nav className="topnav" aria-label="Primary navigation">
          {analysis
            ? <span className="project-title"><i />{analysis.title}</span>
            : <><a href="#how">{tr("How it works", "So funktioniert's")}</a><a href="#trust">{tr("Trust & privacy", "Vertrauen & Datenschutz")}</a></>}
        </nav>
        <div className="top-actions">
          <button className="language-switch" onClick={() => setLocale(locale === "en" ? "de" : "en")}><Icon name="language" />{locale.toUpperCase()}</button>
          {analysis && <button className="quiet-button" onClick={reset}>{tr("New analysis", "Neue Analyse")}</button>}
        </div>
      </header>

      {!analysis ? (
        <IntakePanel locale={locale} tr={tr} jobAd={jobAd} setJobAd={setJobAd} demoAds={demoAds} selectedDemo={selectedDemo} chooseDemo={chooseDemo} analyse={analyse} loading={loading} />
      ) : (
        <div className="workspace-shell">
          <WorkspaceNav tr={tr} title={analysis.title} completion={completion} step={step} setStep={setStep} mode={analysis.mode} />
          <section className="workspace-main">
            {step === 1 && <SourceReview tr={tr} jobAd={jobAd} facts={facts} onNext={() => setStep(2)} />}
            {step === 2 && <ClarifyPanel tr={tr} analysis={analysis} question={question} questionIndex={questionIndex} answer={answer} setAnswer={setAnswer} whyOpen={whyOpen} setWhyOpen={setWhyOpen} saveAnswer={saveAnswer} updateFact={updateFact} onNext={() => setStep(3)} />}
            {step === 3 && <ScenarioPanel tr={tr} skills={skills} selected={selectedSkills} setSelected={setSelectedSkills} reach={reach} pressure={pressure} onNext={() => setStep(4)} />}
            {step === 4 && <ReviewPanel tr={tr} analysis={analysis} updateFact={updateFact} artifact={artifact} setArtifact={setArtifact} artifactText={artifactText} copied={copied} copyArtifact={copyArtifact} />}
          </section>
          <IntelligenceRail tr={tr} analysis={analysis} reach={reach} pressure={pressure} />
        </div>
      )}
    </main>
  );
}
