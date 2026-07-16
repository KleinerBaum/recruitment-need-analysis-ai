export type Locale = "de" | "en";
export type FactStatus = "confirmed" | "proposed" | "missing" | "conflict";
export type Fact = {
  id: string;
  label: string;
  value: string;
  status: FactStatus;
  confidence?: number;
  evidence?: string;
};
export type Question = {
  id: string;
  factId: string;
  text: string;
  rationale: string;
  options?: string[];
};
export type EscoMatch = {
  title: string;
  uri: string;
  confidence: number | null;
  skills: string[];
};
export type Analysis = {
  title: string;
  summary: string;
  facts: Fact[];
  questions: Question[];
  esco: EscoMatch | null;
  mode: "ai" | "deterministic";
};
