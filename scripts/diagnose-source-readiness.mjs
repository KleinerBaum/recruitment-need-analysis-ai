#!/usr/bin/env node

/**
 * Read-only OpenAI source diagnostics for the recruitment knowledge layer.
 *
 * This script retrieves metadata only. It never uploads, attaches, updates, or
 * deletes a file or vector store, and it never prints OPENAI_API_KEY.
 */

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import OpenAI from "openai";

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_FILE_TOKENS = 5_000_000;
const ID_PATTERN = /^(?:file-|vs_)[A-Za-z0-9_-]+$/u;
const PUBLIC_ATTRIBUTE_KEYS = new Set([
  "corpus",
  "dataset",
  "dataset_version",
  "document_type",
  "language",
  "license",
  "license_status",
  "privacy_status",
  "provenance",
  "rights_status",
  "snapshot_period",
  "source",
  "source_kind",
  "usage_policy",
]);

const STORE_DEFINITIONS = [
  {
    env: "OPENAI_ESCO_VECTOR_STORE_ID",
    label: "ESCO v1.2.1 knowledge",
  },
  {
    env: "OPENAI_JOB_POSTINGS_VECTOR_STORE_ID",
    label: "job-posting references",
  },
  {
    env: "OPENAI_MARKET_VECTOR_STORE_ID",
    label: "market references",
  },
];

const SOURCE_DEFINITIONS = [
  {
    env: "OPENAI_SALARY_REFERENCE_FILE_ID",
    label: "indexed historical salary benchmark",
    expectedFilename: "salaries.json",
    expectedStoreEnv: "OPENAI_MARKET_VECTOR_STORE_ID",
    expectedCorpus: "salary_reference",
    policy: "local_demo_aggregate_opt_in",
  },
  {
    env: "OPENAI_SALARY_FILE_ID",
    label: "data-science salary reference",
    expectedFilename: "DataScience_salaries_2025.json",
    expectedStoreEnv: "OPENAI_MARKET_VECTOR_STORE_ID",
    expectedCorpus: "salary_reference",
    policy: "blocked_until_sharded_and_rights_reviewed",
  },
  {
    env: "OPENAI_RESUME_ENTITIES_FILE_ID",
    label: "resume entity-recognition corpus",
    expectedFilename: "Entity Recognition in Resumes.json",
    expectedStoreEnv: null,
    expectedCorpus: "resume_entities",
    policy: "blocked_until_privacy_and_rights_reviewed",
  },
  {
    env: "OPENAI_IT_JOB_DESCRIPTIONS_FILE_ID",
    label: "annotated IT job descriptions",
    expectedFilename: "IT Job Desc Annotated Detailed.json",
    expectedStoreEnv: "OPENAI_JOB_POSTINGS_VECTOR_STORE_ID",
    expectedCorpus: "job_description_reference",
    policy: "blocked_until_rights_reviewed",
  },
  {
    env: "OPENAI_HIRING_TRENDS_FILE_ID",
    label: "hiring-trends reference",
    expectedFilename: "hiring_trends.json",
    expectedStoreEnv: "OPENAI_MARKET_VECTOR_STORE_ID",
    expectedCorpus: "hiring_trends",
    policy: "blocked_unusable_placeholder",
  },
  {
    env: "OPENAI_JOB_REPORT_FILE_ID",
    label: "job-report corpus",
    expectedFilename: "job_report.json",
    expectedStoreEnv: null,
    expectedCorpus: "job_report",
    policy: "blocked_until_sharded_and_rights_reviewed",
  },
];

const HELP = `Inspect OpenAI recruitment data-source readiness without changing remote state.

Usage:
  node --env-file=.env.local scripts/diagnose-source-readiness.mjs [--json]

Options:
  --json  Print machine-readable JSON instead of the human summary
  --help  Show this help

The command only retrieves File and Vector Store metadata. It never uploads,
attaches, updates, or deletes resources.
`;

function parseArguments(argv) {
  const options = { json: false, help: false };
  for (const argument of argv) {
    if (argument === "--json") options.json = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function maskedId(value) {
  if (!value) return null;
  if (value.length <= 12) return "<configured>";
  return `${value.slice(0, 7)}…${value.slice(-5)}`;
}

function safeError(error) {
  const candidate = error && typeof error === "object" ? error : {};
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: Number.isInteger(candidate.status) ? candidate.status : null,
    code: typeof candidate.code === "string" ? candidate.code : "unknown_error",
    message: message
      .replace(/\b(?:file-|vs_)[A-Za-z0-9_-]+\b/gu, "<resource-id>")
      .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, "<api-key>"),
  };
}

function safeLastError(error) {
  if (!error || typeof error !== "object") return null;
  const scrub = (value, fallback) => String(value ?? fallback)
    .replace(/\b(?:file-|vs_)[A-Za-z0-9_-]+\b/gu, "<resource-id>")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, "<api-key>")
    .slice(0, 1_000);
  return {
    code: scrub(error.code, "unknown_error"),
    message: scrub(error.message, "no provider message"),
  };
}

function publicAttributes(attributes) {
  return Object.fromEntries(
    Object.entries(attributes ?? {}).filter(([key]) => PUBLIC_ATTRIBUTE_KEYS.has(key)),
  );
}

function readConfiguration() {
  const errors = [];
  if (!process.env.OPENAI_API_KEY?.trim()) {
    errors.push("OPENAI_API_KEY is missing");
  }

  const stores = STORE_DEFINITIONS.map((definition) => {
    const id = process.env[definition.env]?.trim() ?? "";
    if (!id) errors.push(`${definition.env} is missing`);
    else if (!ID_PATTERN.test(id) || !id.startsWith("vs_")) {
      errors.push(`${definition.env} is not a valid Vector Store ID`);
    }
    return { ...definition, id };
  });

  const sources = SOURCE_DEFINITIONS.map((definition) => {
    const id = process.env[definition.env]?.trim() ?? "";
    if (!id) errors.push(`${definition.env} is missing`);
    else if (!ID_PATTERN.test(id) || !id.startsWith("file-")) {
      errors.push(`${definition.env} is not a valid File ID`);
    }
    return { ...definition, id };
  });

  return {
    errors,
    stores,
    sources,
    allowUnverifiedSalaryReference:
      process.env.OPENAI_ALLOW_UNVERIFIED_SALARY_REFERENCE?.trim().toLowerCase() === "true",
    allowLegacyJobPostingGovernance:
      process.env.OPENAI_ALLOW_LEGACY_JOB_POSTING_GOVERNANCE?.trim().toLowerCase() === "true",
  };
}

async function listStoreFiles(client, vectorStoreId) {
  const files = [];
  for await (const file of client.vectorStores.files.list(vectorStoreId, {
    limit: 100,
    order: "asc",
  })) {
    files.push(file);
  }
  return files;
}

async function inspectStores(client, stores) {
  const byId = new Map();
  for (const store of stores) {
    if (!byId.has(store.id)) {
      byId.set(store.id, (async () => {
        const [metadata, files] = await Promise.all([
          client.vectorStores.retrieve(store.id),
          listStoreFiles(client, store.id),
        ]);
        return { metadata, files };
      })());
    }
  }

  const results = [];
  for (const store of stores) {
    try {
      const { metadata, files } = await byId.get(store.id);
      results.push({
        env: store.env,
        label: store.label,
        id: maskedId(store.id),
        name: metadata.name,
        status: metadata.status,
        usageBytes: metadata.usage_bytes,
        fileCounts: metadata.file_counts,
        files,
      });
    } catch (error) {
      results.push({
        env: store.env,
        label: store.label,
        id: maskedId(store.id),
        error: safeError(error),
        files: [],
      });
    }
  }
  return results;
}

async function inspectSources(client, sources, stores) {
  const storeFilesByEnv = new Map(stores.map((store) => [store.env, store.files ?? []]));
  return Promise.all(sources.map(async (source) => {
    try {
      const metadata = await client.files.retrieve(source.id);
      const expectedStoreFiles = source.expectedStoreEnv
        ? storeFilesByEnv.get(source.expectedStoreEnv) ?? []
        : [];
      const attachment = expectedStoreFiles.find((file) => file.id === source.id) ?? null;
      const attachedElsewhere = stores.flatMap((store) =>
        (store.files ?? [])
          .filter((file) => file.id === source.id)
          .map((file) => ({ storeEnv: store.env, file })),
      );
      return {
        env: source.env,
        label: source.label,
        id: maskedId(source.id),
        filename: metadata.filename,
        bytes: metadata.bytes,
        purpose: metadata.purpose,
        fileStatus: metadata.status,
        policy: source.policy,
        expectedStoreEnv: source.expectedStoreEnv,
        expectedCorpus: source.expectedCorpus,
        attachment: attachment
          ? {
              status: attachment.status,
              usageBytes: attachment.usage_bytes,
              attributes: publicAttributes(attachment.attributes),
              lastError: safeLastError(attachment.last_error),
            }
          : null,
        attachedStoreEnvs: [...new Set(attachedElsewhere.map(({ storeEnv }) => storeEnv))],
        filenameMatches: metadata.filename === source.expectedFilename,
      };
    } catch (error) {
      return {
        env: source.env,
        label: source.label,
        id: maskedId(source.id),
        policy: source.policy,
        expectedStoreEnv: source.expectedStoreEnv,
        expectedCorpus: source.expectedCorpus,
        error: safeError(error),
      };
    }
  }));
}

async function nameFailedFiles(client, stores) {
  const failedIds = [...new Set(stores.flatMap((store) =>
    (store.files ?? []).filter((file) => file.status === "failed").map((file) => file.id),
  ))];
  const names = new Map();
  await Promise.all(failedIds.map(async (fileId) => {
    try {
      const file = await client.files.retrieve(fileId);
      names.set(fileId, file.filename);
    } catch {
      names.set(fileId, "<metadata unavailable>");
    }
  }));
  return names;
}

function evaluateReadiness(configuration, stores, sources, failedFileNames) {
  const errors = [...configuration.errors];
  const blockers = [];
  const warnings = [];

  for (const store of stores) {
    if (store.error) {
      errors.push(`${store.env}: metadata could not be retrieved (${store.error.code})`);
      continue;
    }
    if (store.status !== "completed") blockers.push(`${store.env}: store status is ${store.status}`);
    const failed = (store.files ?? []).filter((file) => file.status === "failed");
    for (const file of failed) {
      const filename = failedFileNames.get(file.id) ?? maskedId(file.id);
      const lastError = safeLastError(file.last_error);
      blockers.push(
        `${store.env}: ${filename} failed (${lastError?.code ?? "unknown_error"}: ` +
          `${lastError?.message ?? "no provider message"})`,
      );
    }
    if ((store.fileCounts?.in_progress ?? 0) > 0) {
      blockers.push(`${store.env}: ${store.fileCounts.in_progress} file(s) are still processing`);
    }
    const legacyJobPostingFiles = (store.files ?? []).filter((file) => {
      const attributes = publicAttributes(file.attributes);
      const corpus = String(attributes.corpus ?? "").toLocaleLowerCase();
      const isJobPosting = ["job_postings", "job_posting", "job_description_reference"]
        .includes(corpus);
      return isJobPosting &&
        attributes.rights_status === undefined &&
        attributes.privacy_status === undefined;
    });
    if (legacyJobPostingFiles.length > 0) {
      const message = `${store.env}: ${legacyJobPostingFiles.length} job-posting file(s) lack ` +
        "explicit rights_status/privacy_status metadata";
      if (configuration.allowLegacyJobPostingGovernance) {
        warnings.push(`${message}; owner-only legacy demo gate is enabled`);
      } else {
        blockers.push(message);
      }
    }
  }

  for (const source of sources) {
    if (source.error) {
      errors.push(`${source.env}: metadata could not be retrieved (${source.error.code})`);
      continue;
    }
    if (!source.filenameMatches) warnings.push(`${source.env}: unexpected filename ${source.filename}`);
    if (source.bytes > MAX_FILE_BYTES) {
      blockers.push(`${source.env}: ${source.filename} exceeds the 512 MB upload limit`);
    }

    if (
      source.policy === "approved_for_retrieval" ||
      source.policy === "local_demo_aggregate_opt_in"
    ) {
      if (!source.attachment) {
        blockers.push(`${source.env}: approved source is not attached to ${source.expectedStoreEnv}`);
      } else if (source.attachment.status !== "completed") {
        blockers.push(`${source.env}: attachment status is ${source.attachment.status}`);
      } else if (source.attachment.attributes?.corpus !== source.expectedCorpus) {
        warnings.push(
          `${source.env}: expected corpus=${source.expectedCorpus}; retrieval filters may not select it`,
        );
      }
      if (
        source.policy === "local_demo_aggregate_opt_in" &&
        !configuration.allowUnverifiedSalaryReference
      ) {
        blockers.push(
          `${source.env}: unverified salary reference requires explicit local/demo opt-in`,
        );
      }
      if (
        source.policy === "local_demo_aggregate_opt_in" &&
        configuration.allowUnverifiedSalaryReference
      ) {
        warnings.push(
          `${source.env}: unverified-license aggregate reference is explicitly enabled for this environment`,
        );
      }
    } else {
      blockers.push(`${source.env}: ${source.policy}`);
      if (source.attachedStoreEnvs.length > 0) {
        blockers.push(
          `${source.env}: blocked raw source is attached to ${source.attachedStoreEnvs.join(", ")}`,
        );
      }
    }
  }

  return {
    ready: errors.length === 0 && blockers.length === 0,
    errors,
    blockers,
    warnings,
  };
}

function publicStore(store) {
  const failedFiles = (store.files ?? [])
    .filter((file) => file.status === "failed")
    .map((file) => ({
      id: maskedId(file.id),
      status: file.status,
      lastError: safeLastError(file.last_error),
    }));
  const rest = { ...store };
  delete rest.files;
  return { ...rest, failedFiles };
}

function printHuman(report) {
  process.stdout.write("Read-only diagnostics: no OpenAI resource was modified.\n\n");
  process.stdout.write("Vector stores\n");
  for (const store of report.stores) {
    if (store.error) {
      process.stdout.write(`- ${store.env}: ERROR ${store.error.code}\n`);
      continue;
    }
    process.stdout.write(
      `- ${store.env}: ${store.name} · ${store.status} · ` +
        `${store.fileCounts.completed}/${store.fileCounts.total} files completed\n`,
    );
  }
  process.stdout.write("\nReference files\n");
  for (const source of report.sources) {
    if (source.error) {
      process.stdout.write(`- ${source.env}: ERROR ${source.error.code}\n`);
      continue;
    }
    const attachment = source.attachment?.status ?? "not attached to expected store";
    process.stdout.write(
      `- ${source.filename}: ${source.fileStatus} · ${attachment} · policy=${source.policy}\n`,
    );
  }

  const sections = [
    ["Errors", report.readiness.errors],
    ["Blockers", report.readiness.blockers],
    ["Warnings", report.readiness.warnings],
  ];
  for (const [title, entries] of sections) {
    if (entries.length === 0) continue;
    process.stdout.write(`\n${title}\n`);
    for (const entry of entries) process.stdout.write(`- ${entry}\n`);
  }
  process.stdout.write(`\nOverall: ${report.readiness.ready ? "READY" : "NOT READY"}\n`);
  process.stdout.write(
    `Limits checked: ${MAX_FILE_BYTES} bytes per file; OpenAI also enforces ` +
      `${MAX_FILE_TOKENS.toLocaleString("en-US")} tokens per File Search file.\n`,
  );
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const configuration = readConfiguration();
  if (configuration.errors.length > 0) {
    const report = {
      checkedAt: new Date().toISOString(),
      mode: "read_only",
      stores: [],
      sources: [],
      readiness: {
        ready: false,
        errors: configuration.errors,
        blockers: [],
        warnings: [],
      },
    };
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else printHuman(report);
    process.exitCode = 1;
    return;
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 2,
    timeout: 20_000,
  });
  const stores = await inspectStores(client, configuration.stores);
  const sources = await inspectSources(client, configuration.sources, stores);
  const failedFileNames = await nameFailedFiles(client, stores);
  const readiness = evaluateReadiness(configuration, stores, sources, failedFileNames);
  const report = {
    checkedAt: new Date().toISOString(),
    mode: "read_only",
    stores: stores.map(publicStore),
    sources,
    readiness,
  };

  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printHuman(report);
  if (!readiness.ready) process.exitCode = readiness.errors.length > 0 ? 1 : 2;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const safe = safeError(error);
    process.stderr.write(`Source diagnostics failed (${safe.code}): ${safe.message}\n`);
    process.exitCode = 1;
  });
}
