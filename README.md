# Recruitment Need Analysis AI

Needly turns a German or English job advertisement into an evidence-backed recruitment brief. It combines deterministic completeness rules, OpenAI structured extraction, official ESCO identifiers, exact-span retrieval, and transparent what-if scenarios in a single editable workspace.

The production runtime uses vinext's Node target so the same App Router pages, route handlers, and MCP endpoint build into the `dist/server/index.js` contract expected by Sites. The regular Next.js scripts remain available as `dev:next`, `build:next`, and `start:next` for compatibility checks.

## What is already built

- Responsive bilingual intake plus an adaptive clarification loop that re-prioritizes after every answer.
- Canonical Zod contracts for 28 vacancy fields, with every field available in the final review together with its evidence, provenance, status, and conflicts.
- Dependency-aware next-question engine that returns at most three high-impact, AGG-safe questions and validates answers against each question's declared answer type.
- OpenAI Responses API extraction with Structured Outputs, `store: false`, server-only credentials, timeouts, and exact-source evidence validation.
- Official ESCO v1.2.1 search with strict URI validation and a small, labelled, verified offline fallback catalog. Returned occupation candidates remain suggestions until the user explicitly confirms one.
- Lexical evidence retrieval over the submitted job ad. It returns exact source spans with offsets and treats all retrieved text as untrusted data; it is not presented as semantic, multi-document RAG.
- Editable final brief plus hiring-brief, job-ad, and structured-interview outputs.
- A deliberately labelled synthetic scenario lab with baseline-to-scenario reach, cumulative skill steps, and disclosed weights, plus a separate aggregate-only historical salary benchmark when its reviewed reference file is configured.
- Suggestion-only OpenAI Vector Store retrieval across isolated ESCO and licensed job-posting corpora, with source provenance, relevance scores, explicit acceptance, and graceful partial failure.
- A ChatGPT-compatible MCP Apps endpoint at `/mcp` with an inline interactive widget.
- Six sanitized synthetic job ads (three German, three English) and an automated contract/integration test suite.

## Architecture

| Layer | Responsibility | Key paths |
| --- | --- | --- |
| Experience | Intake, adaptive questions, evidence review, scenario, editable outputs | `app/`, `components/` |
| Contracts | Canonical schemas shared by logic, APIs, MCP tools, and tests | `lib/contracts.ts` |
| Decision engine | Completeness, dependencies, priority, conflict handling | `lib/domain/` |
| AI & retrieval | Structured extraction, prompt-injection boundaries, exact-span grounding | `lib/integrations/` |
| Market intelligence | Transparent relative scenario plus deterministic historical salary aggregation | `lib/market/` |
| ChatGPT App | MCP tools, UI resource, Streamable HTTP endpoint | `mcp/`, `app/mcp/` |

The deterministic engine is authoritative. The LLM may propose grounded facts and wording; it cannot invent ESCO URIs, accept unsupported facts, or decide that a brief is complete.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The interface remains usable in deterministic mode without an API key. Live extraction runs only on the server when `OPENAI_API_KEY` is configured.

The default extraction model is `gpt-5.6-terra` and can be changed through `OPENAI_MODEL`.

Set `ESCO_PROVENANCE_SIGNING_SECRET` to at least 32 random bytes in every
server environment. It signs occupation selections and brief-bound skill
relations so a client cannot manufacture `official_esco` provenance. Keep it
server-only and independent from `OPENAI_API_KEY`.

These attestations protect integrity, not authorization, revocation, or
freshness. This owner-only pilot keeps briefs client-carried and stateless, so a
previously valid relation token can be replayed with the same brief ID. Before
shared or public use, persist server-issued brief instances and add token
expiry/revocation; every normal UI acceptance already performs a fresh live
ESCO edge lookup.

### Configure recruitment knowledge sources

Keep resource IDs beside `OPENAI_API_KEY` in `.env.local`; never expose them through `NEXT_PUBLIC_*` variables. The three runtime stores have separate trust roles:

| Variable | Retrieval role | Authority |
| --- | --- | --- |
| `OPENAI_ESCO_VECTOR_STORE_ID` | ESCO occupations, skills, hierarchies, and localized relation shards | Official classification data, still subject to version and language checks |
| `OPENAI_JOB_POSTINGS_VECTOR_STORE_ID` | Job-posting and annotated job-description patterns | Contextual examples only; not proof of market prevalence |
| `OPENAI_MARKET_VECTOR_STORE_ID` | Salary and hiring-trend reference material | Supporting evidence only; not a live candidate or salary feed |
| `OPENAI_SALARY_REFERENCE_FILE_ID` | One completed salary file inside the market store | Full-file deterministic aggregation only; raw chunks are never shown |

Because the currently indexed historical salary file has no verified license record, it is disabled by default. `OPENAI_ALLOW_UNVERIFIED_SALARY_REFERENCE=true` is a deliberate server-only opt-in for an owner-only local/demo environment; every returned benchmark keeps the warning visible. Do not enable it for a public production deployment until rights are verified.

The five `OPENAI_*_FILE_ID` variables in `.env.example` are maintenance references. They let the read-only diagnostic verify source metadata and expected store membership without hard-coding resource IDs in the repository.

```bash
cp .env.example .env.local
# Add the project key, store IDs, and maintenance File IDs locally.
npm run sources:check
```

`sources:check` retrieves metadata only. It never uploads, attaches, updates, or deletes an OpenAI resource, and it never prints the API key. Exit code `0` means ready, `1` means configuration/API errors, and `2` means known ingestion or governance blockers remain. Add `-- --json` for machine-readable output.

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/analyze` | `POST` | Grounded fact proposals, completeness, and next questions |
| `/api/answer` | `POST` | Validate one adaptive-question answer and return the re-prioritized canonical analysis |
| `/api/facts` | `PATCH` | Edit a canonical fact during final review and recompute completeness and questions |
| `/api/esco/search` | `GET` | Signed official occupation search with verified fallback |
| `/api/esco/accept-skill` | `POST` | Live-verify and sign one official occupation-to-skill relation |
| `/api/knowledge/enrich` | `POST` | Suggestion-only ESCO, job-posting, and historical salary enrichment |
| `/api/scenario` | `POST` | Transparent baseline-to-scenario relative-reach model with cumulative what-if rows |
| `/api/health` | `GET` | Capability and configuration state without secret values |
| `/mcp` | `POST/GET/DELETE` | Stateless Streamable HTTP MCP Apps endpoint |

## MCP Apps tools

- `analyze_recruitment_need`
- `search_esco`
- `retrieve_job_ad_evidence`
- `model_market_scenario`
- `retrieve_recruitment_knowledge`

The UI resource uses `text/html;profile=mcp-app`, the MCP Apps bridge, ChatGPT compatibility metadata, a locked-down CSP, and a `window.openai` compatibility fallback. To rebuild the committed widget bundle:

```bash
npm run widget:build
```

For recruitment-knowledge results, MCP `structuredContent` contains only bounded status, generic suggestion summaries, official ESCO identifiers, and salary aggregates. Retrieved excerpts and UI citations are carried only in tool-result `_meta`, which the Apps SDK delivers to the component but not to the model. This separation is covered by a prompt-injection regression test.

The owner-only Sites deployment is the current access-control boundary. The in-process request limit and cache reduce accidental cost and retry load, but they are not authentication. Before changing the Site to shared or public access, add principal-bound OAuth/session authorization and durable per-principal quotas to `/api/knowledge/enrich` and `/mcp`. Proxy IP headers are ignored by default; set `KNOWLEDGE_TRUST_PROXY_HEADERS=true` only when the deployment edge is known to overwrite client-supplied values.

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover contract invariants, question dependencies, evidence grounding, OpenAI/ESCO error boundaries, scenario disclaimers, fixture leakage, and an in-memory MCP handshake/tool/resource flow.

## Data-source operations and limits

### ESCO v1.2.1: repair the relation file and add English

This service uses the European Commission's [ESCO v1.2.1 classification](https://esco.ec.europa.eu/en/news/esco-v121-live). Search results are URI-validated and must still be confirmed by a user before they become part of the reviewed brief.

The failed `occupationSkillRelations_de.md` must not be retried as one monolithic document. OpenAI File Search accepts at most **512 MB and 5,000,000 tokens per file**; the token limit can be reached long before the byte limit. The repository therefore includes a non-uploading sharding tool with a conservative 4 MB default. It joins the language-independent relation URIs to the localized labels, groups relations by occupation, writes deterministic Markdown shards, and creates a manifest containing counts and SHA-256 hashes.

Download matching **v1.2.1** CSV exports from the [official ESCO download page](https://esco.ec.europa.eu/en/use-esco/download). Use the same language-independent `occupationSkillRelations.csv` for both runs:

```bash
# German labels
npm run sources:esco:prepare -- \
  --occupations /secure/esco-v1.2.1/occupations_de.csv \
  --skills /secure/esco-v1.2.1/skills_de.csv \
  --relations /secure/esco-v1.2.1/occupationSkillRelations.csv \
  --language de \
  --output-dir /secure/esco-v1.2.1/shards/de

# English labels
npm run sources:esco:prepare -- \
  --occupations /secure/esco-v1.2.1/occupations_en.csv \
  --skills /secure/esco-v1.2.1/skills_en.csv \
  --relations /secure/esco-v1.2.1/occupationSkillRelations.csv \
  --language en \
  --output-dir /secure/esco-v1.2.1/shards/en
```

The script fails when relation URIs do not resolve against the selected release, unless `--allow-missing-labels` is explicitly supplied after reviewing the mismatch. It also refuses to overwrite an existing shard or manifest. Before upload, compare the two manifests, inspect representative occupations, and retain the manifests with the ingestion record. Upload only the generated `.md` shards, wait for every attachment to reach `completed`, run `npm run sources:check`, and only then remove the failed legacy relation file.

English coverage is not complete merely because the relation shards exist. Add the matching English occupation, skill, collection, hierarchy, group, and dictionary exports as separate files with `language=en`; keep German equivalents tagged `language=de`.

### Vacalyser/job-posting source attributes

[Vector Store file attributes](https://platform.openai.com/docs/api-reference/vector-stores-files/createFile) support retrieval filters and accept up to 16 key/value pairs. Every reviewed vacalyser attachment should use a consistent, non-sensitive attribute contract:

| Attribute | Examples | Purpose |
| --- | --- | --- |
| `corpus` | `job_postings`, `job_posting_metadata`, `job_description_reference`, `salary_reference` | Primary runtime isolation filter |
| `dataset` | `linkedin_job_postings_v13`, `salaries_8805` | Reproducible dataset identity |
| `language` | `de`, `en`, `mixed` | Language-aware retrieval |
| `source` | `kaggle`, `official_esco` | Human-readable source channel |
| `license` / `license_status` | `CC_BY_SA_4_0`, `verified`, `unverified` | Rights disclosure and allow/deny gate |
| `snapshot_period` | `2023-2024` | Time coverage disclosure |
| `document_type` | `job_posting_pdf`, `dataset_metadata` | Separate examples from metadata |
| `usage_policy` | `suggestion_only`, `provenance_only`, `aggregate_benchmark_only` | Enforced runtime use limitation |
| `rights_status` | `approved`, `restricted`, `pending` | Required governance gate for non-ESCO retrieval; only `approved` is accepted |
| `privacy_status` | `approved`, `redacted`, `blocked` | Required governance gate for non-ESCO retrieval; only `approved`/`redacted` are accepted |
| `provenance` | `official`, `licensed`, `user_provided`, `derived` | Optional source-strength annotation |

Do not place names, email addresses, candidate IDs, or other personal data in attributes. For non-ESCO semantic retrieval, the runtime requires an allowlisted `corpus`, `usage_policy`, language, accepted license, `rights_status=approved`, and `privacy_status=approved|redacted`. Existing licensed LinkedIn files that predate those two governance attributes remain blocked unless `OPENAI_ALLOW_LEGACY_JOB_POSTING_GOVERNANCE=true` is explicitly enabled for an owner-only demo; results then carry a visible warning. Legacy ESCO files are accepted by defensive filename checks only inside the dedicated ESCO store and can provide background references, never authoritative occupation-to-skill edges. A filename or Vector Store membership alone is not approval.

### Current onboarding gates

| Source | Intended use | Gate before production retrieval |
| --- | --- | --- |
| ESCO German corpus | Official occupation and skill grounding | Replace the failed relation monolith with reviewed DE shards |
| ESCO English corpus | English occupation and skill grounding | Upload the complete matching v1.2.1 EN set plus EN relation shards |
| LinkedIn job-posting metadata | Wording and demand-pattern context | Add `rights_status=approved` and `privacy_status=approved|redacted` after review; the owner-only demo may use the explicit legacy gate with a visible warning; never infer LinkedIn-wide prevalence |
| `salaries.json` | Historical 2020–2023 USD-normalized salary benchmark | Completed and used only for deterministic aggregate percentiles; source license remains unverified and is disclosed in every result |
| `DataScience_salaries_2025.json` | Prospective 2025 salary reference | Current attachment failed as too large; shard it, document origin/license/currency/geography/date, and validate outliers before replacing the historical reference |
| `IT Job Desc Annotated Detailed.json` | Contextual IT job-description reference | Attached and indexed, but excluded from runtime retrieval until its rights review is recorded |
| `hiring_trends.json` | Hiring-trend reference | The current 17-byte file is only a placeholder and cannot support a material claim |
| `Entity Recognition in Resumes.json` | Possible extraction evaluation corpus | Keep unattached until rights, lawful basis, de-identification, retention, and privacy review pass |
| `job_report.json` | Possible market/job-report corpus | The approximately 401 MB raw file needs semantic sharding plus rights and quality review; byte size below 512 MB does not guarantee compliance with the 5M-token limit |

The raw LinkedIn and resume-derived datasets are not automatically safe to use just because they are present in OpenAI Storage. Their provenance, license/terms, purpose limitation, personal-data content, retention, and deletion process require an explicit review. Until that review is recorded, production retrieval must keep them out of the allowed corpus filters.

### What retrieval may and may not claim

[OpenAI File Search](https://developers.openai.com/api/docs/guides/tools-file-search) provides semantic and keyword retrieval over configured Vector Stores. Retrieved passages remain untrusted source data and require file-level provenance in the response. Retrieval relevance is not truth, representativeness, or permission to use the underlying dataset.

The market lab remains a transparent decision scenario, not a forecast. When configured, the separate salary card calculates p25/median/p75 from the complete attributed historical file with a minimum sample threshold and disclosed filter relaxation. It does not estimate 2025 pay, causal skill premiums, live candidate availability, candidate counts, or market-wide scarcity. Links to the [BA Entgeltatlas](https://web.arbeitsagentur.de/entgeltatlas/) and the [BA labour-market statistics APIs](https://statistik.arbeitsagentur.de/DE/Navigation/Service/API/API-Start-Nav.html) remain official external references; their values are not imported.

## Trust boundaries

- Job ads are untrusted data, never instructions.
- Personal contact data is masked before AI extraction by default.
- Source quotes must match exact offsets; paraphrased or fabricated evidence is discarded.
- No OpenAI or market-provider secret reaches the browser, source repository, MCP structured content, or health response.
- Untrusted Vector Store excerpts never enter model-visible MCP content; the widget receives them through component-only metadata after schema validation and PII redaction.
- ESCO mappings stay suggestions until a human explicitly confirms one of the returned candidates.
- The included scenario has `usesLiveCandidateData=false`, `usesMarketCounts=false`, and `usesSalaryData=false` in its provenance.
