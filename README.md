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
- A deliberately labelled synthetic scenario lab with baseline-to-scenario reach, cumulative skill steps, and disclosed weights. Official BA links are references only; no salary or candidate data is imported.
- A ChatGPT-compatible MCP Apps endpoint at `/mcp` with an inline interactive widget.
- Six sanitized synthetic job ads (three German, three English) and 75 automated tests.

## Architecture

| Layer | Responsibility | Key paths |
| --- | --- | --- |
| Experience | Intake, adaptive questions, evidence review, scenario, editable outputs | `app/`, `components/` |
| Contracts | Canonical schemas shared by logic, APIs, MCP tools, and tests | `lib/contracts.ts` |
| Decision engine | Completeness, dependencies, priority, conflict handling | `lib/domain/` |
| AI & retrieval | Structured extraction, prompt-injection boundaries, exact-span grounding | `lib/integrations/` |
| Market demo | Transparent relative scenario model with explicit non-market provenance | `lib/market/` |
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

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/analyze` | `POST` | Grounded fact proposals, completeness, and next questions |
| `/api/answer` | `POST` | Validate one adaptive-question answer and return the re-prioritized canonical analysis |
| `/api/facts` | `PATCH` | Edit a canonical fact during final review and recompute completeness and questions |
| `/api/esco/search` | `GET` | Official occupation/skill search with verified fallback |
| `/api/scenario` | `POST` | Transparent baseline-to-scenario relative-reach model with cumulative what-if rows |
| `/api/health` | `GET` | Capability and configuration state without secret values |
| `/mcp` | `POST/GET/DELETE` | Stateless Streamable HTTP MCP Apps endpoint |

## MCP Apps tools

- `analyze_recruitment_need`
- `search_esco`
- `retrieve_job_ad_evidence`
- `model_market_scenario`

The UI resource uses `text/html;profile=mcp-app`, the MCP Apps bridge, ChatGPT compatibility metadata, a locked-down CSP, and a `window.openai` compatibility fallback. To rebuild the committed widget bundle:

```bash
npm run widget:build
```

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover contract invariants, question dependencies, evidence grounding, OpenAI/ESCO error boundaries, scenario disclaimers, fixture leakage, and an in-memory MCP handshake/tool/resource flow.

## Data sources and market limits

This service uses the ESCO classification of the European Commission. ESCO v1.2.1 search results are URI-validated and must be confirmed by a user before they become part of the reviewed brief.

The market lab is a transparent decision scenario, not a forecast. It applies the same disclosed penalty to every additional must-have and therefore does not infer skill-specific scarcity, causal salary effects, live candidate availability, or candidate counts. Links to the [BA Entgeltatlas](https://web.arbeitsagentur.de/entgeltatlas/) and the [BA labour-market statistics APIs](https://statistik.arbeitsagentur.de/DE/Navigation/Service/API/API-Start-Nav.html) are supplied as official external references; the application does not import their values into the scenario.

## Trust boundaries

- Job ads are untrusted data, never instructions.
- Personal contact data is masked before AI extraction by default.
- Source quotes must match exact offsets; paraphrased or fabricated evidence is discarded.
- No OpenAI or market-provider secret reaches the browser, source repository, MCP structured content, or health response.
- ESCO mappings stay suggestions until a human explicitly confirms one of the returned candidates.
- The included scenario has `usesLiveCandidateData=false`, `usesMarketCounts=false`, and `usesSalaryData=false` in its provenance.
