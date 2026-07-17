import type {
  AnalysisResponse,
  CompletenessAssessment,
  Evidence,
  FactProvenance,
  JsonValue,
  LocalizedText,
  MarketScenarioResult,
  Question as CanonicalQuestion,
  VacancyBrief,
  VacancyFieldId,
  VacancyFact,
} from "@/lib/contracts";

export type Locale = "de" | "en";
export type FactStatus = "confirmed" | "proposed" | "missing" | "conflict" | "declined" | "not_applicable";

export type Fact = {
  id: VacancyFieldId;
  label: string;
  value: string;
  rawValue: JsonValue;
  status: FactStatus;
  canonicalStatus: VacancyFact["status"];
  confidence?: number;
  evidence: Evidence[];
  provenance?: FactProvenance;
  conflictDescription?: string;
};

export type QuestionOption = { value: string; label: string };
export type Question = {
  id: string;
  factId: VacancyFieldId;
  text: string;
  rationale: string;
  answerType: CanonicalQuestion["answerType"];
  mode: CanonicalQuestion["mode"];
  priority: number;
  allowNotApplicable: boolean;
  options: QuestionOption[];
};

export type EscoMatch = {
  title: string;
  uri: string;
  version: string;
  skills: string[];
};

export type Analysis = {
  analysisId: string;
  status: AnalysisResponse["status"];
  title: string;
  summary: string;
  facts: Fact[];
  questions: Question[];
  canonicalQuestions: CanonicalQuestion[];
  esco: EscoMatch | null;
  mode: "ai" | "deterministic";
  brief: VacancyBrief;
  completeness: CompletenessAssessment;
  warnings: LocalizedText[];
};

export type ScenarioResult = MarketScenarioResult;
