import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getHealth } from "@/app/api/health/route";
import { POST as enrichKnowledgeRoute } from "@/app/api/knowledge/enrich/route";
import {
  RecruitmentKnowledgeRequestSchema,
  RecruitmentKnowledgeResponseSchema,
} from "@/lib/contracts";
import { enrichRecruitmentKnowledge } from "@/lib/integrations/recruitment-knowledge";
import { getEscoOccupationSkillRelations } from "@/lib/integrations/esco";
import {
  safeVectorStoreError,
  retrieveHistoricalSalaryBenchmark,
  searchRecruitmentCorpus,
  type OpenAIVectorStoreClient,
} from "@/lib/integrations/vector-store";

const ENV_NAMES = [
  "OPENAI_API_KEY",
  "OPENAI_ESCO_VECTOR_STORE_ID",
  "OPENAI_JOB_POSTINGS_VECTOR_STORE_ID",
  "OPENAI_MARKET_VECTOR_STORE_ID",
  "OPENAI_SALARY_REFERENCE_FILE_ID",
  "OPENAI_ALLOW_UNVERIFIED_SALARY_REFERENCE",
  "OPENAI_ALLOW_LEGACY_JOB_POSTING_GOVERNANCE",
] as const;
const ORIGINAL_ENV = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of ENV_NAMES) {
    const original = ORIGINAL_ENV[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
  vi.restoreAllMocks();
});

describe("OpenAI vector store retrieval boundary", () => {
  it("uses direct bounded search with strict logical-corpus filters", async () => {
    process.env.OPENAI_JOB_POSTINGS_VECTOR_STORE_ID = "vs-private-job-store";
    const search = vi.fn(async (
      _storeId: string,
      _body: Record<string, unknown>,
      _options?: { signal?: AbortSignal },
    ) => {
      void _storeId;
      void _body;
      void _options;
      return { data: [
        {
          attributes: {
            corpus: "job_description_reference",
            usage_policy: "suggestion_only",
            license: "CC_BY_SA_4_0",
            language: "en",
            dataset: "linkedin_job_postings_v13",
            source: "kaggle",
            snapshot_period: "2023-2024",
            document_type: "job_posting_pdf",
            rights_status: "approved",
            privacy_status: "redacted",
          },
          content: [{
            type: "text" as const,
            text: "Platform engineers build reliable services. Contact jobs@example.com.",
          }],
          file_id: "file-private-source",
          filename: "IT_job_descriptions.json",
          score: 0.81,
        },
        {
          attributes: { corpus: "salary_reference" },
          content: [{ type: "text" as const, text: "Do not mix this salary row." }],
          file_id: "file-wrong-corpus",
          filename: "salaries.json",
          score: 0.99,
        },
        {
          attributes: {
            corpus: "job_postings",
            usage_policy: "suggestion_only",
            license: "CC_BY_SA_4_0",
            language: "en",
            dataset: "linkedin_job_postings_v13",
            source: "kaggle",
            rights_status: "approved",
            privacy_status: "blocked",
          },
          content: [{ type: "text" as const, text: "Blocked private source content." }],
          file_id: "file-blocked",
          filename: "blocked_job_posting.pdf",
          score: 0.95,
        },
      ] };
    });
    const client = { vectorStores: { search } } as unknown as OpenAIVectorStoreClient;

    const result = await searchRecruitmentCorpus(
      {
        corpus: "job_postings",
        query: "platform engineer requirements",
        locale: "en",
        maxResults: 4,
      },
      { client, timeoutMs: 2_000, scoreThreshold: 0.4 },
    );

    expect(result).toEqual({
      corpus: "job_postings",
      status: "available",
      chunks: [{
        corpus: "job_postings",
        sourceName: "IT_job_descriptions.json",
        excerpt: "Platform engineers build reliable services. Contact [redacted-email].",
        score: 0.81,
        provenance: {
          dataset: "linkedin_job_postings_v13",
          documentType: "job_posting_pdf",
          license: "CC_BY_SA_4_0",
          language: "en",
          snapshotPeriod: "2023-2024",
          source: "kaggle",
          usagePolicy: "suggestion_only",
          rightsStatus: "approved",
          privacyStatus: "redacted",
        },
      }],
      filteredCount: 2,
    });
    const [storeId, body] = search.mock.calls[0] ?? [];
    expect(storeId).toBe("vs-private-job-store");
    expect(body).toMatchObject({
      max_num_results: 8,
      rewrite_query: false,
      filters: {
        type: "and",
        filters: [
          {
            key: "corpus",
            type: "in",
            value: ["job_postings", "job_posting", "job_description_reference"],
          },
          {
            key: "usage_policy",
            type: "in",
            value: ["suggestion_only"],
          },
          {
            key: "license",
            type: "eq",
            value: "CC_BY_SA_4_0",
          },
          {
            key: "language",
            type: "eq",
            value: "en",
          },
          {
            key: "dataset",
            type: "eq",
            value: "linkedin_job_postings_v13",
          },
          {
            key: "source",
            type: "eq",
            value: "kaggle",
          },
        ],
      },
      ranking_options: { ranker: "auto", score_threshold: 0.4 },
    });
    expect(JSON.stringify(result)).not.toContain("vs-private");
    expect(JSON.stringify(result)).not.toContain("file-private");
    expect(JSON.stringify(result)).not.toContain("salary row");
    expect(JSON.stringify(result)).not.toContain("Blocked private");
  });

  it("rejects un-attributed mixed-store results instead of making mixed claims", async () => {
    process.env.OPENAI_MARKET_VECTOR_STORE_ID = "vs-mixed";
    const client = {
      vectorStores: {
        search: vi.fn(async () => ({
          data: [{
            attributes: null,
            content: [{ type: "text" as const, text: "A historical salary record." }],
            file_id: "file-unattributed",
            filename: "salaries.json",
            score: 0.97,
          }],
        })),
      },
    } as OpenAIVectorStoreClient;

    const result = await searchRecruitmentCorpus(
      { corpus: "market_reference", query: "data engineer salary", locale: "en" },
      { client },
    );

    expect(result).toMatchObject({ status: "filtered", chunks: [], filteredCount: 1 });
  });

  it("requires explicit rights/privacy metadata unless owner-demo legacy use is enabled", async () => {
    process.env.OPENAI_JOB_POSTINGS_VECTOR_STORE_ID = "vs-job-postings";
    delete process.env.OPENAI_ALLOW_LEGACY_JOB_POSTING_GOVERNANCE;
    const client = {
      vectorStores: {
        search: vi.fn(async () => ({
          data: [{
            attributes: {
              corpus: "job_postings",
              usage_policy: "suggestion_only",
              license: "CC_BY_SA_4_0",
              language: "en",
              dataset: "linkedin_job_postings_v13",
              source: "kaggle",
            },
            content: [{ type: "text" as const, text: "Build reliable data services." }],
            file_id: "file-legacy",
            filename: "linkedin_job_posting.pdf",
            score: 0.85,
          }],
        })),
      },
    } as OpenAIVectorStoreClient;
    const input = {
      corpus: "job_postings" as const,
      query: "data engineer skills",
      locale: "en" as const,
    };

    await expect(searchRecruitmentCorpus(input, { client })).resolves.toMatchObject({
      status: "filtered",
      chunks: [],
      filteredCount: 1,
    });

    process.env.OPENAI_ALLOW_LEGACY_JOB_POSTING_GOVERNANCE = "true";
    await expect(searchRecruitmentCorpus(input, { client })).resolves.toMatchObject({
      status: "available",
      chunks: [{ excerpt: "Build reliable data services." }],
    });
  });

  it("maps provider failures without leaking secrets or resource identifiers", async () => {
    const safe = safeVectorStoreError(
      Object.assign(new Error("sk-secret vs-private file-private"), { status: 401 }),
    );
    expect(safe).toEqual({
      code: "unauthorized",
      message: "Recruitment knowledge retrieval is not configured correctly.",
      retryable: false,
    });
    expect(JSON.stringify(safe)).not.toMatch(/sk-secret|vs-private|file-private/u);
  });

  it("aggregates the complete attributed salary dataset without using semantic top-k rows", async () => {
    process.env.OPENAI_MARKET_VECTOR_STORE_ID = "vs-market-private";
    process.env.OPENAI_SALARY_REFERENCE_FILE_ID = "file-salary-private";
    process.env.OPENAI_ALLOW_UNVERIFIED_SALARY_REFERENCE = "true";
    const rows = Array.from({ length: 10 }, (_, index) => ({
      work_year: 2020 + (index % 4),
      experience_level: "MI",
      employment_type: "FT",
      job_title: "Data Scientist",
      salary: 50_000 + (index * 10_000),
      salary_currency: "USD",
      salary_in_usd: 50_000 + (index * 10_000),
      employee_residence: "DE",
      remote_ratio: 50,
      company_location: "DE",
      company_size: "M",
    }));
    const retrieve = vi.fn(async () => ({
      id: "file-salary-private",
      created_at: 0,
      last_error: null,
      object: "vector_store.file" as const,
      status: "completed" as const,
      usage_bytes: 1_000,
      vector_store_id: "vs-market-private",
      attributes: {
        corpus: "salary_reference",
        dataset: "salaries_8805",
        license_status: "unverified",
        usage_policy: "aggregate_benchmark_only",
      },
    }));
    const content = vi.fn(async () => ({
      data: [{ type: "text", text: JSON.stringify(rows) }],
    }));
    const client = {
      vectorStores: {
        search: vi.fn(),
        files: { retrieve, content },
      },
    } as unknown as OpenAIVectorStoreClient;

    const result = await retrieveHistoricalSalaryBenchmark(
      {
        roleTitle: "Datenwissenschaftler",
        seniority: "mid",
        companyLocationCode: "DE",
      },
      { client, timeoutMs: 2_000 },
    );

    expect(result).toMatchObject({
      status: "available",
      benchmark: {
        status: "historical_reference_only",
        currency: "USD",
        datasetPeriod: { from: 2020, to: 2023 },
        sampleSize: 10,
        p25: 72_500,
        median: 95_000,
        p75: 117_500,
        filters: {
          roleTitleQuery: "Datenwissenschaftler",
          matchedJobTitles: ["Data Scientist"],
          appliedFilters: { experienceLevel: "MI", companyLocation: "DE" },
          relaxedFilters: [],
        },
        provenance: {
          usesLlm: false,
          isForecast: false,
          modelsSkillPremium: false,
        },
      },
    });
    expect(content).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/vs-market-private|file-salary-private/u);
  });
});

describe("official ESCO occupation-skill relations", () => {
  it("queries both official relation types with a validated occupation URI", async () => {
    const skill = {
      className: "Skill",
      uri: "http://data.europa.eu/esco/skill/1e77e42a-181f-4b48-8e74-201ce50ffc29",
      preferredLabel: { de: "aktuelle Daten interpretieren", en: "interpret current data" },
    };
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const relation = url.searchParams.get("relation");
      return new Response(JSON.stringify({
        total: relation === "hasEssentialSkill" ? 1 : 0,
        _embedded: { [relation ?? "unknown"]: relation === "hasEssentialSkill" ? [skill] : [] },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await getEscoOccupationSkillRelations(
      {
        occupationUri: "http://data.europa.eu/esco/occupation/d3edb8f8-3a06-47a0-8fb9-9b212c006aa2",
        locale: "de",
      },
      { fetchImpl, timeoutMs: 2_000 },
    );

    expect(result).toEqual({
      status: "available",
      skills: [{
        uri: skill.uri,
        preferredLabel: "aktuelle Daten interpretieren",
        relation: "essential",
        source: "official_esco_api",
        version: "v1.2.1",
      }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [input] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/esco/api/resource/related");
      expect(url.searchParams.get("selectedVersion")).toBe("v1.2.1");
      expect(url.searchParams.get("language")).toBe("de");
      expect(url.searchParams.get("offset")).toBe("0");
    }
  });

  it("uses item offsets and returns every unique skill across relation pages", async () => {
    const essentialSkills = [
      ["1e77e42a-181f-4b48-8e74-201ce50ffc29", "Skill one"],
      ["dcd66bb2-3f26-4d4b-872b-94b42fc8e8ee", "Skill two"],
      ["f118b9ea-4f91-4d3f-8b28-3dbe0dc5b2c4", "Skill three"],
    ].map(([id, label]) => ({
      className: "Skill",
      uri: `http://data.europa.eu/esco/skill/${id}`,
      preferredLabel: { en: label, de: label },
    }));
    const essentialOffsets: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const relation = url.searchParams.get("relation") ?? "unknown";
      const offset = url.searchParams.get("offset") ?? "0";
      if (relation === "hasEssentialSkill") essentialOffsets.push(offset);
      const page = relation === "hasEssentialSkill"
        ? essentialSkills.slice(Number(offset), Number(offset) + 2)
        : [];
      return new Response(JSON.stringify({
        total: relation === "hasEssentialSkill" ? essentialSkills.length : 0,
        _embedded: { [relation]: page },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await getEscoOccupationSkillRelations(
      {
        occupationUri: "http://data.europa.eu/esco/occupation/d3edb8f8-3a06-47a0-8fb9-9b212c006aa2",
        locale: "en",
        limitPerRelation: 2,
      },
      { fetchImpl, timeoutMs: 2_000 },
    );

    expect(essentialOffsets).toEqual(["0", "2"]);
    expect(result.status).toBe("available");
    expect(result.skills.map((skill) => skill.uri)).toEqual(
      essentialSkills.map((skill) => skill.uri),
    );
  });
});

describe("recruitment knowledge orchestration", () => {
  it("keeps retrieved knowledge suggestion-only and degrades per corpus", async () => {
    const request = RecruitmentKnowledgeRequestSchema.parse({
      locale: "en",
      query: "skills and requirements for a data engineer",
      roleTitle: "Data Engineer",
      currentSkills: ["SQL"],
      corpora: ["esco", "job_postings", "market_reference"],
      maxResultsPerCorpus: 3,
    });
    const result = await enrichRecruitmentKnowledge(request, {
      search: vi.fn(async ({ corpus }) => {
        if (corpus === "market_reference") {
          throw new Error("provider internals vs-secret");
        }
        if (corpus === "esco") {
          return {
            corpus,
            status: "available" as const,
            filteredCount: 0,
            chunks: [{
              corpus,
              sourceName: "skills_en.md",
              excerpt: "conceptUri: http://data.europa.eu/esco/skill/abc\npreferredLabel: data pipelines",
              score: 0.84,
            }],
          };
        }
        return {
          corpus,
          status: "available" as const,
          filteredCount: 0,
          chunks: [{
            corpus,
            sourceName: "IT_job_descriptions.json",
            excerpt: "Design and operate reliable data pipelines.",
            score: 0.74,
          }],
        };
      }),
    });

    expect(RecruitmentKnowledgeResponseSchema.parse(result)).toEqual(result);
    expect(result.status).toBe("partial");
    expect(result.mode).toBe("suggestion_only");
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "job_posting_pattern",
        status: "suggestion_only",
      }),
    ]));
    expect(result.suggestions.some((suggestion) => suggestion.kind === "esco_skill")).toBe(false);
    expect(result.warnings.some((warning) => warning.en.includes("background references"))).toBe(true);
    expect(result.corpora).toContainEqual({
      corpus: "market_reference",
      status: "unavailable",
      resultCount: 0,
    });
    expect(result).not.toHaveProperty("brief");
    expect(JSON.stringify(result)).not.toContain("vs-secret");
  });

  it("creates relation-typed ESCO suggestions only from the official related-resource API", async () => {
    const request = RecruitmentKnowledgeRequestSchema.parse({
      locale: "de",
      query: "Data Analyst Skills",
      roleTitle: "Datenanalytiker",
      occupationUri: "http://data.europa.eu/esco/occupation/d3edb8f8-3a06-47a0-8fb9-9b212c006aa2",
      corpora: ["esco"],
    });
    const result = await enrichRecruitmentKnowledge(request, {
      search: vi.fn(async ({ corpus }) => ({
        corpus,
        status: "no_results" as const,
        chunks: [],
        filteredCount: 0,
      })),
      getEscoRelations: vi.fn(async () => ({
        status: "available" as const,
        skills: [
          {
            uri: "http://data.europa.eu/esco/skill/1e77e42a-181f-4b48-8e74-201ce50ffc29",
            preferredLabel: "aktuelle Daten interpretieren",
            relation: "essential" as const,
            source: "official_esco_api" as const,
            version: "v1.2.1" as const,
          },
          {
            uri: "http://data.europa.eu/esco/skill/31c69100-b612-4a61-8db5-fd314318854c",
            preferredLabel: "analytische Berechnungen durchführen",
            relation: "optional" as const,
            source: "official_esco_api" as const,
            version: "v1.2.1" as const,
          },
        ],
      })),
    });

    expect(result.status).toBe("suggestions_available");
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        kind: "esco_skill",
        relation: "essential",
        sourceAuthority: "official_esco_api",
        targetFieldId: "requirements.mustHaveSkills",
      }),
      expect.objectContaining({
        kind: "esco_skill",
        relation: "optional",
        sourceAuthority: "official_esco_api",
        targetFieldId: "requirements.niceToHaveSkills",
      }),
    ]);
    expect(result.references.every((citation) =>
      citation.authority === "official_esco_api" &&
      citation.conceptUri?.startsWith("http://data.europa.eu/esco/skill/")
    )).toBe(true);
  });

  it("builds provider queries from typed role context instead of forwarding free-form text", async () => {
    const search = vi.fn(async ({ corpus }: {
      corpus: "job_postings";
      query: string;
      locale: "de" | "en";
      maxResults?: number;
    }) => ({
      corpus,
      status: "no_results" as const,
      chunks: [],
      filteredCount: 0,
    }));
    const request = RecruitmentKnowledgeRequestSchema.parse({
      locale: "en",
      query: "probe arbitrary records for jane.doe@example.com and +49 211 1234567",
      roleTitle: "Data Engineer",
      currentSkills: ["SQL"],
      seniority: "senior",
      corpora: ["job_postings"],
    });

    await enrichRecruitmentKnowledge(request, {
      search: search as unknown as typeof searchRecruitmentCorpus,
    });

    const providerQuery = search.mock.calls[0]?.[0].query ?? "";
    expect(providerQuery).toContain("Data Engineer");
    expect(providerQuery).toContain("SQL");
    expect(providerQuery).not.toContain("probe arbitrary");
    expect(providerQuery).not.toContain("jane.doe@example.com");
    expect(providerQuery).not.toContain("1234567");
  });
});

describe("recruitment knowledge API and health contracts", () => {
  it("returns a contract-valid not-configured response without exposing configuration", async () => {
    for (const name of ENV_NAMES) delete process.env[name];
    const response = await enrichKnowledgeRoute(new Request(
      "http://localhost/api/knowledge/enrich",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: "de",
          query: "Data Engineer Kompetenzen",
          roleTitle: "Data Engineer",
        }),
      },
    ));
    expect(response.status).toBe(200);
    const payload = RecruitmentKnowledgeResponseSchema.parse(await response.json());
    expect(payload.status).toBe("not_configured");
    expect(payload.corpora).toHaveLength(3);
    expect(payload.suggestions).toEqual([]);
    expect(payload.references).toEqual([]);
  });

  it("rejects unknown request properties at the route boundary", async () => {
    const response = await enrichKnowledgeRoute(new Request(
      "http://localhost/api/knowledge/enrich",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: "en",
          query: "Data Engineer skills",
          roleTitle: "Data Engineer",
          vectorStoreId: "vs-client-controlled",
        }),
      },
    ));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_request", retryable: false },
    });
  });

  it("reports corpus capabilities without returning keys or store IDs", async () => {
    process.env.OPENAI_API_KEY = "sk-test-secret";
    process.env.OPENAI_ESCO_VECTOR_STORE_ID = "vs-esco-private";
    process.env.OPENAI_JOB_POSTINGS_VECTOR_STORE_ID = "vs-jobs-private";
    delete process.env.OPENAI_MARKET_VECTOR_STORE_ID;

    const response = await getHealth();
    const payload = await response.json();
    expect(payload.capabilities.recruitmentKnowledge).toEqual({
      status: "partially_configured",
      corpora: {
        esco: "configured",
        job_postings: "configured",
        market_reference: "not_configured",
      },
      salaryReference: "not_configured",
    });
    expect(JSON.stringify(payload)).not.toMatch(/sk-test|vs-esco|vs-jobs/u);
  });
});
