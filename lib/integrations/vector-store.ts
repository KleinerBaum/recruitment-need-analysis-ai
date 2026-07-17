import OpenAI from "openai";
import type {
  FileContentResponse,
  VectorStoreFile,
} from "openai/resources/vector-stores/files";
import type {
  VectorStoreSearchParams,
  VectorStoreSearchResponse,
} from "openai/resources/vector-stores/vector-stores";

import {
  HistoricalSalaryBenchmarkSchema,
  type HistoricalSalaryBenchmark,
  type KnowledgeCorpus,
  type KnowledgeSourceProvenance,
  type Seniority,
} from "@/lib/contracts";
import {
  calculateSalaryBenchmark,
  type SalaryDatasetRow,
} from "@/lib/market/salary-benchmark";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_SCORE_THRESHOLD = 0.35;
const MAX_QUERY_LENGTH = 4_000;
const MAX_CHUNKS = 8;
const MAX_EXCERPT_LENGTH = 1_500;
const MAX_SALARY_DATASET_LENGTH = 30_000_000;

const CORPUS_ENV: Readonly<Record<KnowledgeCorpus, string>> = {
  esco: "OPENAI_ESCO_VECTOR_STORE_ID",
  job_postings: "OPENAI_JOB_POSTINGS_VECTOR_STORE_ID",
  market_reference: "OPENAI_MARKET_VECTOR_STORE_ID",
};

const ATTRIBUTE_VALUES: Readonly<Record<KnowledgeCorpus, readonly string[]>> = {
  esco: ["esco", "esco_reference"],
  job_postings: ["job_postings", "job_posting", "job_description_reference"],
  market_reference: ["market_reference", "hiring_trends"],
};

export type SafeRetrievedChunk = {
  corpus: KnowledgeCorpus;
  sourceName: string;
  excerpt: string;
  score: number;
  provenance?: KnowledgeSourceProvenance;
};

export type CorpusSearchResult = {
  corpus: KnowledgeCorpus;
  status: "available" | "no_results" | "not_configured" | "filtered";
  chunks: SafeRetrievedChunk[];
  filteredCount: number;
};

type SearchPage = { data: VectorStoreSearchResponse[] };

export type OpenAIVectorStoreClient = {
  vectorStores: {
    search: (
      vectorStoreId: string,
      body: VectorStoreSearchParams,
      options?: { signal?: AbortSignal },
    ) => PromiseLike<SearchPage>;
    files?: {
      retrieve: (
        fileId: string,
        params: { vector_store_id: string },
        options?: { signal?: AbortSignal },
      ) => PromiseLike<VectorStoreFile>;
      content: (
        fileId: string,
        params: { vector_store_id: string },
        options?: { signal?: AbortSignal },
      ) => PromiseLike<{ data: FileContentResponse[] }>;
    };
  };
};

export type SalaryBenchmarkResult =
  | { status: "available"; benchmark: HistoricalSalaryBenchmark }
  | { status: "not_configured" | "no_match" };

let salaryRowsCache:
  | { cacheKey: string; promise: Promise<LoadedSalaryRows> }
  | undefined;

type SalaryLicenseStatus = HistoricalSalaryBenchmark["source"]["licenseStatus"];
type LoadedSalaryRows =
  | { status: "available"; rows: SalaryDatasetRow[]; licenseStatus: SalaryLicenseStatus }
  | { status: "blocked" };

export class VectorStoreRetrievalError extends Error {
  readonly code:
    | "invalid_input"
    | "unauthorized"
    | "rate_limited"
    | "timeout"
    | "provider_unavailable";
  readonly retryable: boolean;

  constructor(
    code: VectorStoreRetrievalError["code"],
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "VectorStoreRetrievalError";
    this.code = code;
    this.retryable = retryable;
  }
}

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function vectorStoreId(corpus: KnowledgeCorpus): string | undefined {
  return envValue(CORPUS_ENV[corpus]);
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, minimum), maximum)
    : fallback;
}

function safeFilename(value: string): string {
  const basename = value.split(/[\\/]/u).at(-1)?.trim() || "Retrieved source";
  const printable = basename.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  return (printable || "Retrieved source").slice(0, 300);
}

function normalizedAttribute(value: unknown): string | undefined {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase().replace(/[\s-]+/gu, "_")
    : undefined;
}

function safeMetadataValue(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const safe = value.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, maximumLength);
  if (!safe || /^(?:file-|sk-|vs_)/iu.test(safe)) return undefined;
  return safe;
}

function safeSourceProvenance(
  attributes: VectorStoreSearchResponse["attributes"],
): KnowledgeSourceProvenance | undefined {
  if (!attributes) return undefined;
  const provenance: KnowledgeSourceProvenance = {
    ...(safeMetadataValue(attributes.dataset, 160)
      ? { dataset: safeMetadataValue(attributes.dataset, 160) }
      : {}),
    ...(safeMetadataValue(attributes.source, 160)
      ? { source: safeMetadataValue(attributes.source, 160) }
      : {}),
    ...(safeMetadataValue(attributes.license ?? attributes.license_status, 80)
      ? { license: safeMetadataValue(attributes.license ?? attributes.license_status, 80) }
      : {}),
    ...(safeMetadataValue(attributes.snapshot_period, 80)
      ? { snapshotPeriod: safeMetadataValue(attributes.snapshot_period, 80) }
      : {}),
    ...(safeMetadataValue(attributes.language, 35)
      ? { language: safeMetadataValue(attributes.language, 35) }
      : {}),
    ...(safeMetadataValue(attributes.usage_policy, 80)
      ? { usagePolicy: safeMetadataValue(attributes.usage_policy, 80) }
      : {}),
    ...(safeMetadataValue(attributes.document_type, 80)
      ? { documentType: safeMetadataValue(attributes.document_type, 80) }
      : {}),
    ...(safeMetadataValue(attributes.rights_status, 80)
      ? { rightsStatus: safeMetadataValue(attributes.rights_status, 80) }
      : {}),
    ...(safeMetadataValue(attributes.privacy_status, 80)
      ? { privacyStatus: safeMetadataValue(attributes.privacy_status, 80) }
      : {}),
  };
  return Object.keys(provenance).length > 0 ? provenance : undefined;
}

function hasAllowedAttribute(
  corpus: KnowledgeCorpus,
  attributes: VectorStoreSearchResponse["attributes"],
): boolean {
  const corpusAttribute = normalizedAttribute(attributes?.corpus);
  return Boolean(corpusAttribute && ATTRIBUTE_VALUES[corpus].includes(corpusAttribute));
}

function hasTrustedRetrievalPolicy(
  corpus: KnowledgeCorpus,
  locale: "de" | "en",
  attributes: VectorStoreSearchResponse["attributes"],
): boolean {
  if (corpus === "esco") return true;
  const usagePolicy = normalizedAttribute(attributes?.usage_policy);
  const license = normalizedAttribute(attributes?.license ?? attributes?.license_status);
  const language = normalizedAttribute(attributes?.language);
  const rightsStatus = normalizedAttribute(attributes?.rights_status);
  const privacyStatus = normalizedAttribute(attributes?.privacy_status);
  const dataset = normalizedAttribute(attributes?.dataset);
  const source = normalizedAttribute(attributes?.source);
  const governanceApproved = rightsStatus === "approved" &&
    privacyStatus !== undefined &&
    ["approved", "redacted"].includes(privacyStatus);
  const legacyOwnerDemoAllowed = corpus === "job_postings" &&
    envValue("OPENAI_ALLOW_LEGACY_JOB_POSTING_GOVERNANCE") === "true" &&
    rightsStatus === undefined &&
    privacyStatus === undefined;
  if (
    license !== "cc_by_sa_4_0" ||
    language !== locale ||
    (!governanceApproved && !legacyOwnerDemoAllowed) ||
    !dataset ||
    !source
  ) return false;
  if (corpus === "job_postings") {
    return usagePolicy === "suggestion_only" &&
      dataset === "linkedin_job_postings_v13" &&
      source === "kaggle";
  }
  return (usagePolicy === "suggestion_only" || usagePolicy === "context_only") &&
    dataset === "hiring_trends";
}

function filenameMatchesCorpus(corpus: KnowledgeCorpus, filename: string): boolean {
  const normalized = filename.toLocaleLowerCase();
  if (corpus === "esco") {
    return /(?:esco|occupation|skill|isco|digcomp|dictionary)/u.test(normalized);
  }
  if (corpus === "job_postings") {
    if (/(?:salar(?:y|ies)|entgelt|compensation|hiring[_ -]?trends?)/u.test(normalized)) {
      return false;
    }
    return /(?:linkedin.*job|job[_ -]?(?:posting|description|ad)|vacan|stellen)/u.test(
      normalized,
    );
  }
  return /(?:salar(?:y|ies)|entgelt|compensation|labou?r[_ -]?market|hiring[_ -]?trends?)/u.test(
    normalized,
  );
}

/**
 * Mixed stores require explicit corpus attributes. A dedicated ESCO store may
 * contain older, un-attributed ESCO exports, for which filenames are still
 * defensively checked.
 */
function isAllowedResult(
  corpus: KnowledgeCorpus,
  locale: "de" | "en",
  result: VectorStoreSearchResponse,
): boolean {
  const corpusAttribute = normalizedAttribute(result.attributes?.corpus);
  if (corpusAttribute) {
    return hasAllowedAttribute(corpus, result.attributes) &&
      hasTrustedRetrievalPolicy(corpus, locale, result.attributes);
  }
  if (corpus !== "esco") return false;
  return filenameMatchesCorpus(corpus, result.filename);
}

function strictAttributeFilter(
  corpus: KnowledgeCorpus,
  locale: "de" | "en",
): VectorStoreSearchParams["filters"] | undefined {
  if (corpus === "esco") return undefined;
  return {
    type: "and",
    filters: [
      {
        key: "corpus",
        type: "in",
        value: [...ATTRIBUTE_VALUES[corpus]],
      },
      {
        key: "usage_policy",
        type: "in",
        value: corpus === "job_postings"
          ? ["suggestion_only"]
          : ["suggestion_only", "context_only"],
      },
      {
        key: "license",
        type: "eq",
        value: "CC_BY_SA_4_0",
      },
      {
        key: "language",
        type: "eq",
        value: locale,
      },
      {
        key: "dataset",
        type: "eq",
        value: corpus === "job_postings"
          ? "linkedin_job_postings_v13"
          : "hiring_trends",
      },
      ...(corpus === "job_postings"
        ? [{ key: "source", type: "eq" as const, value: "kaggle" }]
        : []),
    ],
  };
}

function excerptFrom(result: VectorStoreSearchResponse): string | null {
  const excerpt = result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n")
    .replace(/\u0000/gu, "")
    .replace(/\b(?:contact(?:\s+person)?|ansprechpartner(?:in)?|kontakt)\s*:\s*[^\r\n]+/giu, "[redacted-contact]")
    .replace(/https?:\/\/(?:www\.)?(?:linkedin\.com|xing\.com)\/[^\s]+/giu, "[redacted-profile]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted-email]")
    .replace(/(?:\+?\d[\d ()/.-]{6,}\d)/gu, (candidate) =>
      candidate.replace(/\D/gu, "").length >= 7 ? "[redacted-phone]" : candidate,
    )
    .trim()
    .slice(0, MAX_EXCERPT_LENGTH)
    .trim();
  return excerpt || null;
}

function createClient(): OpenAIVectorStoreClient | null {
  const apiKey = envValue("OPENAI_API_KEY");
  if (!apiKey) return null;
  return new OpenAI({ apiKey }) as unknown as OpenAIVectorStoreClient;
}

function withTimeout(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; didTimeout: () => boolean; dispose: () => void } {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Timed out", "TimeoutError"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

function mapProviderError(error: unknown, timedOut: boolean): VectorStoreRetrievalError {
  if (error instanceof VectorStoreRetrievalError) return error;
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  const name = error instanceof Error ? error.name : "";
  if (timedOut || name === "AbortError" || name === "TimeoutError") {
    return new VectorStoreRetrievalError(
      "timeout",
      "Recruitment knowledge retrieval timed out.",
      true,
    );
  }
  if (status === 401 || status === 403) {
    return new VectorStoreRetrievalError(
      "unauthorized",
      "Recruitment knowledge retrieval is not configured correctly.",
      false,
    );
  }
  if (status === 429) {
    return new VectorStoreRetrievalError(
      "rate_limited",
      "Recruitment knowledge retrieval is temporarily busy.",
      true,
    );
  }
  return new VectorStoreRetrievalError(
    "provider_unavailable",
    "Recruitment knowledge retrieval is temporarily unavailable.",
    true,
  );
}

export function recruitmentKnowledgeCapability(): {
  status: "configured" | "partially_configured" | "not_configured";
  corpora: Record<KnowledgeCorpus, "configured" | "not_configured">;
  salaryReference: "configured" | "not_configured" | "license_gated";
} {
  const hasApiKey = Boolean(envValue("OPENAI_API_KEY"));
  const corpora = Object.fromEntries(
    (Object.keys(CORPUS_ENV) as KnowledgeCorpus[]).map((corpus) => [
      corpus,
      hasApiKey && vectorStoreId(corpus) ? "configured" : "not_configured",
    ]),
  ) as Record<KnowledgeCorpus, "configured" | "not_configured">;
  const configuredCount = Object.values(corpora).filter(
    (status) => status === "configured",
  ).length;
  const salaryEnabled = envValue("OPENAI_ALLOW_UNVERIFIED_SALARY_REFERENCE") === "true";
  const salaryConfigured = Boolean(
    hasApiKey &&
    vectorStoreId("market_reference") &&
    envValue("OPENAI_SALARY_REFERENCE_FILE_ID"),
  );
  const salaryReference = !salaryConfigured
    ? "not_configured" as const
    : salaryEnabled
      ? "configured" as const
      : "license_gated" as const;
  return {
    status: configuredCount === 0
      ? "not_configured"
      : configuredCount === Object.keys(corpora).length
        ? "configured"
        : "partially_configured",
    corpora,
    salaryReference,
  };
}

export async function searchRecruitmentCorpus(
  input: {
    corpus: KnowledgeCorpus;
    query: string;
    locale: "de" | "en";
    maxResults?: number;
  },
  options: {
    client?: OpenAIVectorStoreClient;
    timeoutMs?: number;
    scoreThreshold?: number;
    signal?: AbortSignal;
  } = {},
): Promise<CorpusSearchResult> {
  if (typeof window !== "undefined") {
    throw new VectorStoreRetrievalError(
      "invalid_input",
      "Recruitment knowledge retrieval is server-only.",
      false,
    );
  }
  const query = input.query.trim();
  if (query.length < 3 || query.length > MAX_QUERY_LENGTH) {
    throw new VectorStoreRetrievalError(
      "invalid_input",
      "The recruitment knowledge query is invalid.",
      false,
    );
  }

  const storeId = vectorStoreId(input.corpus);
  const client = options.client ?? createClient();
  if (!storeId || !client) {
    return {
      corpus: input.corpus,
      status: "not_configured",
      chunks: [],
      filteredCount: 0,
    };
  }

  const maxResults = Math.min(Math.max(input.maxResults ?? 4, 1), MAX_CHUNKS);
  const scoreThreshold = options.scoreThreshold ?? boundedNumber(
    envValue("OPENAI_VECTOR_SEARCH_SCORE_THRESHOLD"),
    DEFAULT_SCORE_THRESHOLD,
    0,
    1,
  );
  const timeoutMs = options.timeoutMs ?? boundedNumber(
    envValue("OPENAI_VECTOR_SEARCH_TIMEOUT_MS"),
    DEFAULT_TIMEOUT_MS,
    1_000,
    60_000,
  );
  const timeout = withTimeout(options.signal, timeoutMs);

  try {
    const page = await client.vectorStores.search(
      storeId,
      {
        query,
        max_num_results: Math.min(maxResults * 2, 16),
        rewrite_query: false,
        filters: strictAttributeFilter(input.corpus, input.locale),
        ranking_options: {
          ranker: "auto",
          score_threshold: scoreThreshold,
        },
      },
      { signal: timeout.signal },
    );

    let filteredCount = 0;
    const chunks: SafeRetrievedChunk[] = [];
    for (const result of page.data) {
      if (chunks.length >= maxResults) break;
      if (
        !Number.isFinite(result.score) ||
        result.score < scoreThreshold ||
        !isAllowedResult(input.corpus, input.locale, result)
      ) {
        filteredCount += 1;
        continue;
      }
      const excerpt = excerptFrom(result);
      if (!excerpt) {
        filteredCount += 1;
        continue;
      }
      const provenance = safeSourceProvenance(result.attributes);
      chunks.push({
        corpus: input.corpus,
        sourceName: safeFilename(result.filename),
        excerpt,
        score: Math.min(Math.max(result.score, 0), 1),
        ...(provenance ? { provenance } : {}),
      });
    }

    return {
      corpus: input.corpus,
      status: chunks.length > 0
        ? "available"
        : filteredCount > 0
          ? "filtered"
          : "no_results",
      chunks,
      filteredCount,
    };
  } catch (error) {
    throw mapProviderError(error, timeout.didTimeout());
  } finally {
    timeout.dispose();
  }
}

function salaryRowFrom(value: unknown): SalaryDatasetRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const workYear = Number(row.work_year);
  const salaryInUsd = Number(row.salary_in_usd);
  const jobTitle = typeof row.job_title === "string" ? row.job_title.trim() : "";
  const experienceLevel = typeof row.experience_level === "string"
    ? row.experience_level.trim()
    : "";
  const companyLocation = typeof row.company_location === "string"
    ? row.company_location.trim().toUpperCase()
    : "";
  if (
    !Number.isInteger(workYear) ||
    workYear < 2000 ||
    workYear > 2100 ||
    !Number.isFinite(salaryInUsd) ||
    salaryInUsd < 10_000 ||
    salaryInUsd > 2_000_000 ||
    !jobTitle ||
    jobTitle.length > 300 ||
    !experienceLevel ||
    !/^[A-Z]{2}$/u.test(companyLocation)
  ) return null;
  return {
    work_year: workYear,
    experience_level: experienceLevel,
    job_title: jobTitle,
    salary_in_usd: salaryInUsd,
    company_location: companyLocation,
  };
}

function rowsFromParsedPayload(payload: unknown): SalaryDatasetRow[] {
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];
  return records
    .map(salaryRowFrom)
    .filter((row): row is SalaryDatasetRow => row !== null);
}

function parseSalaryRows(content: readonly FileContentResponse[]): SalaryDatasetRow[] {
  const textParts = content
    .map((item) => item.text ?? "")
    .filter(Boolean);
  const joined = textParts.join("").replace(/^\uFEFF/u, "").trim();
  if (!joined || joined.length > MAX_SALARY_DATASET_LENGTH) return [];

  const candidates = [joined, textParts.join("\n")];
  for (const candidate of candidates) {
    const withoutFence = candidate
      .replace(/^```(?:json)?\s*/iu, "")
      .replace(/\s*```$/u, "")
      .trim();
    try {
      const rows = rowsFromParsedPayload(JSON.parse(withoutFence));
      if (rows.length > 0) return rows;
    } catch {
      // Try the next deterministic representation; source text is never executed.
    }
  }

  const rows: SalaryDatasetRow[] = [];
  for (const part of textParts) {
    try {
      rows.push(...rowsFromParsedPayload(JSON.parse(part)));
    } catch {
      return [];
    }
  }
  return rows;
}

async function loadSalaryRows(
  client: OpenAIVectorStoreClient,
  storeId: string,
  fileId: string,
  signal: AbortSignal,
  useCache: boolean,
  allowUnverified: boolean,
): Promise<LoadedSalaryRows> {
  const files = client.vectorStores.files;
  if (!files) return { status: "blocked" };
  const load = async (): Promise<LoadedSalaryRows> => {
    const metadata = await files.retrieve(
      fileId,
      { vector_store_id: storeId },
      { signal },
    );
    const licenseStatus = normalizedAttribute(metadata.attributes?.license_status);
    const privacyStatus = normalizedAttribute(metadata.attributes?.privacy_status);
    const rightsStatus = normalizedAttribute(metadata.attributes?.rights_status);
    const allowedLicense = licenseStatus === "approved" ||
      licenseStatus === "verified" ||
      (licenseStatus === "unverified" && allowUnverified);
    if (
      metadata.status !== "completed" ||
      normalizedAttribute(metadata.attributes?.corpus) !== "salary_reference" ||
      normalizedAttribute(metadata.attributes?.dataset) !== "salaries_8805" ||
      normalizedAttribute(metadata.attributes?.usage_policy) !== "aggregate_benchmark_only" ||
      !allowedLicense ||
      (rightsStatus !== undefined && rightsStatus !== "approved") ||
      (privacyStatus !== undefined && !["approved", "redacted"].includes(privacyStatus))
    ) return { status: "blocked" };
    const page = await files.content(
      fileId,
      { vector_store_id: storeId },
      { signal },
    );
    return {
      status: "available",
      rows: parseSalaryRows(page.data),
      licenseStatus: licenseStatus as SalaryLicenseStatus,
    };
  };

  if (!useCache) return load();
  const cacheKey = `${storeId}:${fileId}:${allowUnverified}`;
  if (salaryRowsCache?.cacheKey === cacheKey) return salaryRowsCache.promise;
  const promise = load().catch((error) => {
    if (salaryRowsCache?.promise === promise) salaryRowsCache = undefined;
    throw error;
  });
  salaryRowsCache = { cacheKey, promise };
  return promise;
}

/**
 * Aggregate the complete attributed historical dataset. This deliberately does
 * not aggregate semantic top-k hits and cannot produce a forecast or skill
 * premium.
 */
export async function retrieveHistoricalSalaryBenchmark(
  input: {
    roleTitle?: string;
    seniority?: Seniority;
    companyLocationCode?: string;
  },
  options: {
    client?: OpenAIVectorStoreClient;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<SalaryBenchmarkResult> {
  const roleTitle = input.roleTitle?.trim();
  if (!roleTitle) return { status: "no_match" };
  const allowUnverified = envValue("OPENAI_ALLOW_UNVERIFIED_SALARY_REFERENCE") === "true";
  const storeId = vectorStoreId("market_reference");
  const fileId = envValue("OPENAI_SALARY_REFERENCE_FILE_ID");
  const client = options.client ?? createClient();
  if (!storeId || !fileId || !client?.vectorStores.files) {
    return { status: "not_configured" };
  }

  const timeout = withTimeout(
    options.signal,
    options.timeoutMs ?? boundedNumber(
      envValue("OPENAI_VECTOR_SEARCH_TIMEOUT_MS"),
      DEFAULT_TIMEOUT_MS,
      1_000,
      60_000,
    ),
  );
  try {
    const loaded = await loadSalaryRows(
      client,
      storeId,
      fileId,
      timeout.signal,
      !options.client,
      allowUnverified,
    );
    if (loaded.status === "blocked") return { status: "not_configured" };
    const { rows, licenseStatus } = loaded;
    if (rows.length === 0) return { status: "no_match" };
    const aggregate = calculateSalaryBenchmark(rows, {
      roleTitle,
      seniority: input.seniority,
      companyLocationCode: input.companyLocationCode,
    });
    if (
      aggregate.status !== "available" ||
      !aggregate.period ||
      aggregate.p25 === null ||
      aggregate.median === null ||
      aggregate.p75 === null
    ) return { status: "no_match" };

    const benchmark = HistoricalSalaryBenchmarkSchema.parse({
      status: "historical_reference_only",
      currency: "USD",
      datasetPeriod: aggregate.period,
      sampleSize: aggregate.sampleSize,
      p25: aggregate.p25,
      median: aggregate.median,
      p75: aggregate.p75,
      filters: {
        roleTitleQuery: roleTitle,
        matchedJobTitles: aggregate.matchedJobTitles,
        appliedFilters: aggregate.appliedFilters,
        relaxedFilters: aggregate.relaxedFilters,
      },
      source: {
        sourceName: "salaries.json",
        datasetLabel: "salaries_8805",
        licenseStatus,
      },
      provenance: {
        methodId: "deterministic_salary_dataset_aggregation_v1",
        aggregateOnly: true,
        usesLlm: false,
        isForecast: false,
        modelsSkillPremium: false,
      },
      disclaimer: licenseStatus === "unverified"
        ? {
          de: "Historische, USD-normalisierte Referenz aus 2020–2023 mit ungeprüfter Lizenz. Keine Prognose, keine Live-Kandidatenverfügbarkeit und kein kausaler Skill-Gehaltsaufschlag.",
          en: "Historical USD-normalized reference from 2020–2023 with an unverified license. Not a forecast, live candidate availability, or a causal skill salary premium.",
        }
        : {
          de: "Historische, USD-normalisierte Referenz aus 2020–2023. Keine Prognose, keine Live-Kandidatenverfügbarkeit und kein kausaler Skill-Gehaltsaufschlag.",
          en: "Historical USD-normalized reference from 2020–2023. Not a forecast, live candidate availability, or a causal skill salary premium.",
        },
    });
    return { status: "available", benchmark };
  } catch (error) {
    throw mapProviderError(error, timeout.didTimeout());
  } finally {
    timeout.dispose();
  }
}

export function safeVectorStoreError(error: unknown): {
  code: VectorStoreRetrievalError["code"];
  message: string;
  retryable: boolean;
} {
  const mapped = mapProviderError(error, false);
  return { code: mapped.code, message: mapped.message, retryable: mapped.retryable };
}
