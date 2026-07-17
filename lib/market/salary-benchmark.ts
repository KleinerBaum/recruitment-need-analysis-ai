export type SalaryDatasetRow = {
  work_year: number | string;
  experience_level: string;
  job_title: string;
  salary_in_usd: number | string;
  company_location: string;
};

export type SalaryBenchmarkQuery = {
  roleTitle: string;
  seniority?: "entry" | "junior" | "mid" | "senior" | "lead" | "executive";
  companyLocationCode?: string;
  minimumSampleSize?: number;
};

export type SalaryBenchmark = {
  status: "available" | "insufficient_data";
  currency: "USD";
  sampleSize: number;
  period: { from: number; to: number } | null;
  matchedJobTitles: string[];
  appliedFilters: {
    experienceLevel?: string;
    companyLocation?: string;
  };
  relaxedFilters: Array<"experience_level" | "company_location">;
  p25: number | null;
  median: number | null;
  p75: number | null;
  method: "deterministic_observed_salary_distribution";
};

const SENIORITY_TO_EXPERIENCE = {
  entry: "EN",
  junior: "EN",
  mid: "MI",
  senior: "SE",
  lead: "SE",
  executive: "EX",
} as const;

const TITLE_STOP_WORDS = new Set([
  "and",
  "der",
  "die",
  "fur",
  "für",
  "head",
  "in",
  "junior",
  "lead",
  "mid",
  "of",
  "principal",
  "senior",
  "the",
  "und",
]);

const TITLE_TOKEN_ALIASES: Record<string, string> = {
  analyst: "analyst",
  analytiker: "analyst",
  analytikerin: "analyst",
  data: "data",
  daten: "data",
  datenanalyst: "analyst",
  datenanalytiker: "analyst",
  datenanalytikerin: "analyst",
  datenwissenschaftler: "scientist",
  datenwissenschaftlerin: "scientist",
  developer: "engineer",
  entwickler: "engineer",
  entwicklerin: "engineer",
  engineer: "engineer",
  ingenieur: "engineer",
  ingenieurin: "engineer",
  machinelearning: "ml",
  maschinelleslernen: "ml",
  scientist: "scientist",
  softwareentwickler: "engineer",
  softwareentwicklerin: "engineer",
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function titleTokens(value: string): Set<string> {
  const compact = normalize(value).replace(/\s+/gu, "");
  const rawTokens = normalize(value).split(/\s+/gu).filter(Boolean);
  const tokens = new Set<string>();
  for (const rawToken of rawTokens) {
    if (TITLE_STOP_WORDS.has(rawToken)) continue;
    tokens.add(TITLE_TOKEN_ALIASES[rawToken] ?? rawToken);
  }
  if (/^datenwissenschaftler(?:in)?$/u.test(compact)) {
    tokens.add("data");
    tokens.add("scientist");
  }
  if (/^softwareentwickler(?:in)?$/u.test(compact)) {
    tokens.add("software");
    tokens.add("engineer");
  }
  const compactAlias = TITLE_TOKEN_ALIASES[compact];
  if (compactAlias) tokens.add(compactAlias);
  return tokens;
}

function titleSimilarity(query: string, candidate: string): number {
  const normalizedQuery = normalize(query);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 1;

  const queryTokens = titleTokens(query);
  const candidateTokens = titleTokens(candidate);
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;
  const intersection = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
  const union = new Set([...queryTokens, ...candidateTokens]).size;
  const jaccard = intersection / union;
  const coverage = intersection / queryTokens.size;
  const phraseMatches = normalizedCandidate.includes(normalizedQuery)
    || normalizedQuery.includes(normalizedCandidate);
  if (queryTokens.size === 1 && candidateTokens.size > 1 && !phraseMatches) {
    return 0.35;
  }
  const phraseBonus = phraseMatches
    ? 0.12
    : 0;
  return Math.min(1, (jaccard * 0.55) + (coverage * 0.45) + phraseBonus);
}

function percentile(sortedValues: readonly number[], percentileValue: number): number {
  if (sortedValues.length === 1) return sortedValues[0]!;
  const index = (sortedValues.length - 1) * percentileValue;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sortedValues[lowerIndex]!;
  const upper = sortedValues[upperIndex]!;
  return Math.round(lower + ((upper - lower) * (index - lowerIndex)));
}

type NormalizedSalaryRow = {
  work_year: number;
  experience_level: string;
  job_title: string;
  salary_in_usd: number;
  company_location: string;
};

function normalizeRow(row: SalaryDatasetRow): NormalizedSalaryRow | null {
  const workYear = Number(row.work_year);
  const salaryInUsd = Number(row.salary_in_usd);
  const valid = Number.isInteger(workYear)
    && workYear >= 2000
    && workYear <= 2100
    && typeof row.job_title === "string"
    && row.job_title.trim().length > 0
    && Number.isFinite(salaryInUsd)
    && salaryInUsd >= 10_000
    && salaryInUsd <= 2_000_000
    && typeof row.experience_level === "string"
    && typeof row.company_location === "string";
  if (!valid) return null;
  return {
    work_year: workYear,
    experience_level: row.experience_level,
    job_title: row.job_title,
    salary_in_usd: salaryInUsd,
    company_location: row.company_location,
  };
}

export function calculateSalaryBenchmark(
  sourceRows: readonly SalaryDatasetRow[],
  query: SalaryBenchmarkQuery,
): SalaryBenchmark {
  const minimumSampleSize = Math.max(5, Math.min(100, query.minimumSampleSize ?? 8));
  const rows = sourceRows
    .map(normalizeRow)
    .filter((row): row is NormalizedSalaryRow => row !== null);
  const uniqueTitles = [...new Set(rows.map((row) => row.job_title.trim()))];
  const rankedTitles = uniqueTitles
    .map((title) => ({ title, score: titleSimilarity(query.roleTitle, title) }))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  const bestScore = rankedTitles[0]?.score ?? 0;
  const matchedJobTitles = rankedTitles
    .filter((item) => item.score >= 0.48 && item.score >= bestScore - 0.08)
    .slice(0, 8)
    .map((item) => item.title);

  const baseResult: SalaryBenchmark = {
    status: "insufficient_data",
    currency: "USD",
    sampleSize: 0,
    period: null,
    matchedJobTitles,
    appliedFilters: {},
    relaxedFilters: [],
    p25: null,
    median: null,
    p75: null,
    method: "deterministic_observed_salary_distribution",
  };
  if (matchedJobTitles.length === 0) return baseResult;

  const titleSet = new Set(matchedJobTitles);
  const titleRows = rows.filter((row) => titleSet.has(row.job_title.trim()));
  const experienceLevel = query.seniority
    ? SENIORITY_TO_EXPERIENCE[query.seniority]
    : undefined;
  const companyLocation = query.companyLocationCode?.trim().toLocaleUpperCase();
  const requestedFilters: SalaryBenchmark["appliedFilters"] = {
    ...(experienceLevel ? { experienceLevel } : {}),
    ...(companyLocation ? { companyLocation } : {}),
  };

  const withExperience = experienceLevel
    ? titleRows.filter((row) => row.experience_level.toLocaleUpperCase() === experienceLevel)
    : titleRows;
  const withLocation = companyLocation
    ? withExperience.filter((row) => row.company_location.toLocaleUpperCase() === companyLocation)
    : withExperience;

  let selectedRows = withLocation;
  const relaxedFilters: SalaryBenchmark["relaxedFilters"] = [];
  const appliedFilters = { ...requestedFilters };
  if (selectedRows.length < minimumSampleSize && companyLocation) {
    selectedRows = withExperience;
    relaxedFilters.push("company_location");
    delete appliedFilters.companyLocation;
  }
  if (selectedRows.length < minimumSampleSize && experienceLevel) {
    selectedRows = titleRows;
    relaxedFilters.push("experience_level");
    delete appliedFilters.experienceLevel;
  }
  if (selectedRows.length < minimumSampleSize) {
    return {
      ...baseResult,
      sampleSize: selectedRows.length,
      appliedFilters,
      relaxedFilters,
    };
  }

  const salaries = selectedRows
    .map((row) => row.salary_in_usd)
    .sort((left, right) => left - right);
  const years = selectedRows.map((row) => row.work_year);
  return {
    status: "available",
    currency: "USD",
    sampleSize: selectedRows.length,
    period: { from: Math.min(...years), to: Math.max(...years) },
    matchedJobTitles,
    appliedFilters,
    relaxedFilters,
    p25: percentile(salaries, 0.25),
    median: percentile(salaries, 0.5),
    p75: percentile(salaries, 0.75),
    method: "deterministic_observed_salary_distribution",
  };
}
