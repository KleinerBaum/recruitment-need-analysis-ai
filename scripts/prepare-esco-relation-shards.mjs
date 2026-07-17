#!/usr/bin/env node

/**
 * Convert the official ESCO occupation/skill CSV exports into localized,
 * retrieval-friendly Markdown shards for OpenAI vector stores.
 *
 * The relation CSV is language-independent: it contains concept URIs. This
 * script joins those URIs to labels from one language pack, groups relations
 * by occupation, and keeps each output file below a conservative byte limit.
 * It never uploads data and never overwrites an existing output file.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import { pathToFileURL } from "node:url";

const DEFAULT_MAX_BYTES = 4_000_000;
const MAX_SAFE_BYTES = 4_500_000;
const MIN_MAX_BYTES = 100_000;
const HEADER_RESERVE_BYTES = 2_048;
const ESCO_DOWNLOAD_URL = "https://esco.ec.europa.eu/en/use-esco/download";
const ESCO_URI_PATTERNS = {
  occupation: /^https?:\/\/data\.europa\.eu\/esco\/occupation\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
  skill: /^https?:\/\/data\.europa\.eu\/esco\/skill\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
};

const HELP = `Prepare localized ESCO occupation-skill Markdown shards.

Usage:
  node scripts/prepare-esco-relation-shards.mjs \\
    --occupations /path/to/occupations_de.csv \\
    --skills /path/to/skills_de.csv \\
    --relations /path/to/occupationSkillRelations.csv \\
    --language de \\
    --output-dir /path/to/output/de

Run the command again with occupations_en.csv, skills_en.csv, --language en,
and a new output directory for English. The relation CSV may be reused across
languages because ESCO relations are URI-based and language-independent.

Options:
  --occupations <file>        Official occupations_<language>.csv file
  --skills <file>             Official skills_<language>.csv file
  --relations <file>          Official occupationSkillRelations CSV file
  --language <code>           Two-letter ESCO language code, e.g. de or en
  --output-dir <directory>    Destination for new .md shards and manifest
  --version <version>         ESCO version (default: v1.2.1)
  --max-bytes <number>        Shard size, 100000..4500000 (default: 4000000)
  --allow-missing-labels      Keep URI-only fallback labels instead of failing
  --help                      Show this help

The 4 MB default is deliberately below OpenAI's per-file 5,000,000-token
limit. The API computes the final token count when a file is attached.
`;

export function parseArguments(argv) {
  const values = new Map();
  const flags = new Set();
  const valueOptions = new Set([
    "--occupations",
    "--skills",
    "--relations",
    "--language",
    "--output-dir",
    "--version",
    "--max-bytes",
  ]);
  const flagOptions = new Set(["--allow-missing-labels", "--help"]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (flagOptions.has(argument)) {
      flags.add(argument);
      continue;
    }
    if (!valueOptions.has(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    if (values.has(argument)) {
      throw new Error(`Option supplied more than once: ${argument}`);
    }
    values.set(argument, value);
    index += 1;
  }

  if (flags.has("--help")) return { help: true };

  const required = ["--occupations", "--skills", "--relations", "--language", "--output-dir"];
  for (const option of required) {
    if (!values.has(option)) throw new Error(`Missing required option: ${option}`);
  }

  const language = values.get("--language").toLowerCase();
  if (!/^[a-z]{2}$/u.test(language)) {
    throw new Error("--language must be a two-letter ESCO language code");
  }
  const version = values.get("--version") ?? "v1.2.1";
  if (!/^v\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error("--version must look like v1.2.1");
  }
  const maxBytes = Number(values.get("--max-bytes") ?? DEFAULT_MAX_BYTES);
  if (!Number.isInteger(maxBytes) || maxBytes < MIN_MAX_BYTES || maxBytes > MAX_SAFE_BYTES) {
    throw new Error(`--max-bytes must be an integer from ${MIN_MAX_BYTES} to ${MAX_SAFE_BYTES}`);
  }

  return {
    help: false,
    occupations: path.resolve(values.get("--occupations")),
    skills: path.resolve(values.get("--skills")),
    relations: path.resolve(values.get("--relations")),
    language,
    outputDir: path.resolve(values.get("--output-dir")),
    version,
    maxBytes,
    allowMissingLabels: flags.has("--allow-missing-labels"),
  };
}

async function readUtf8(filePath) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) throw new Error(`Not a regular file: ${filePath}`);
  const bytes = await readFile(filePath);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`File is not valid UTF-8: ${filePath}`);
  }
}

/** Parse RFC 4180-style CSV, including quoted commas and embedded newlines. */
export function parseCsv(text, filePath) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error(`Unclosed quoted CSV field in ${filePath}`);
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (rows.length < 2) throw new Error(`CSV contains no data rows: ${filePath}`);

  rows[0][0] = rows[0][0].replace(/^\uFEFF/u, "");
  const expectedColumns = rows[0].length;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].length !== expectedColumns) {
      throw new Error(
        `CSV row ${index + 1} in ${filePath} has ${rows[index].length} columns; expected ${expectedColumns}`,
      );
    }
  }
  return rows;
}

function normalizedHeader(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function columnIndex(headers, aliases, filePath) {
  const normalized = headers.map(normalizedHeader);
  const matches = aliases
    .map((alias) => normalized.indexOf(normalizedHeader(alias)))
    .filter((index) => index >= 0);
  const unique = [...new Set(matches)];
  if (unique.length === 0) {
    throw new Error(`Missing column ${aliases.join("/")} in ${filePath}`);
  }
  if (unique.length > 1) {
    throw new Error(`Ambiguous columns ${aliases.join("/")} in ${filePath}`);
  }
  return unique[0];
}

function cleanText(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function assertEscoUri(uri, kind, location) {
  if (!ESCO_URI_PATTERNS[kind].test(uri)) {
    throw new Error(`Invalid ESCO ${kind} URI at ${location}: ${uri || "<empty>"}`);
  }
}

export function loadLabels(rows, filePath, kind) {
  const headers = rows[0];
  const uriIndex = columnIndex(headers, ["conceptUri", "uri"], filePath);
  const labelIndex = columnIndex(headers, ["preferredLabel", "preferredTerm", "title"], filePath);
  const labels = new Map();

  for (let index = 1; index < rows.length; index += 1) {
    const uri = cleanText(rows[index][uriIndex]);
    const label = cleanText(rows[index][labelIndex]);
    if (!uri || !label) throw new Error(`Missing concept URI or preferred label at ${filePath}:${index + 1}`);
    assertEscoUri(uri, kind, `${filePath}:${index + 1}`);
    const previous = labels.get(uri);
    if (previous && previous !== label) {
      throw new Error(`Conflicting preferred labels for ${uri} in ${filePath}`);
    }
    labels.set(uri, label);
  }
  return labels;
}

function normalizedRelationType(value) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z]/gu, "");
  if (normalized.includes("essential")) return "essential";
  if (normalized.includes("optional")) return "optional";
  throw new Error(`Unsupported ESCO relation type: ${value || "<empty>"}`);
}

export function loadRelations(rows, filePath, occupations, skills, allowMissingLabels) {
  const headers = rows[0];
  const occupationIndex = columnIndex(headers, ["occupationUri", "occupation"], filePath);
  const skillIndex = columnIndex(headers, ["skillUri", "skill"], filePath);
  const relationIndex = columnIndex(headers, ["relationType", "relation"], filePath);
  const normalizedHeaders = headers.map(normalizedHeader);
  const skillTypeIndex = normalizedHeaders.indexOf(normalizedHeader("skillType"));
  const profiles = new Map();
  const missingOccupationUris = new Set();
  const missingSkillUris = new Set();
  const dedupe = new Set();
  let duplicateCount = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const occupationUri = cleanText(rows[index][occupationIndex]);
    const skillUri = cleanText(rows[index][skillIndex]);
    const relationType = normalizedRelationType(rows[index][relationIndex]);
    const skillType = skillTypeIndex >= 0 ? cleanText(rows[index][skillTypeIndex]) : "";
    if (!occupationUri || !skillUri) {
      throw new Error(`Missing occupation or skill URI at ${filePath}:${index + 1}`);
    }
    assertEscoUri(occupationUri, "occupation", `${filePath}:${index + 1}`);
    assertEscoUri(skillUri, "skill", `${filePath}:${index + 1}`);

    const key = `${occupationUri}\u0000${relationType}\u0000${skillUri}`;
    if (dedupe.has(key)) {
      duplicateCount += 1;
      continue;
    }
    dedupe.add(key);

    const occupationLabel = occupations.get(occupationUri);
    const skillLabel = skills.get(skillUri);
    if (!occupationLabel) missingOccupationUris.add(occupationUri);
    if (!skillLabel) missingSkillUris.add(skillUri);

    const profile = profiles.get(occupationUri) ?? {
      occupationUri,
      occupationLabel: occupationLabel ?? occupationUri,
      essential: [],
      optional: [],
    };
    profile[relationType].push({
      skillUri,
      skillLabel: skillLabel ?? skillUri,
      skillType,
    });
    profiles.set(occupationUri, profile);
  }

  if (!allowMissingLabels && (missingOccupationUris.size > 0 || missingSkillUris.size > 0)) {
    throw new Error(
      "Relation and label files are not from the same ESCO release/language pack: " +
        `${missingOccupationUris.size} occupation URI(s) and ${missingSkillUris.size} skill URI(s) have no label. ` +
        "Use matching exports, or pass --allow-missing-labels only after reviewing the mismatch.",
    );
  }

  const sortSkills = (left, right) =>
    left.skillLabel.localeCompare(right.skillLabel) || left.skillUri.localeCompare(right.skillUri);
  for (const profile of profiles.values()) {
    profile.essential.sort(sortSkills);
    profile.optional.sort(sortSkills);
  }

  return {
    profiles: [...profiles.values()].sort(
      (left, right) =>
        left.occupationLabel.localeCompare(right.occupationLabel) ||
        left.occupationUri.localeCompare(right.occupationUri),
    ),
    relationCount: dedupe.size,
    duplicateCount,
    missingOccupationCount: missingOccupationUris.size,
    missingSkillCount: missingSkillUris.size,
  };
}

function skillLine(skill) {
  const type = skill.skillType ? `; skill_type: ${skill.skillType}` : "";
  return `- ${skill.skillLabel} (uri: ${skill.skillUri}${type})`;
}

function occupationBlock(profile) {
  const sections = [
    `# ${profile.occupationLabel}`,
    `occupation_uri: ${profile.occupationUri}`,
    "",
    "## Essential skills",
    ...(profile.essential.length > 0 ? profile.essential.map(skillLine) : ["- None listed by ESCO"]),
    "",
    "## Optional skills",
    ...(profile.optional.length > 0 ? profile.optional.map(skillLine) : ["- None listed by ESCO"]),
    "",
  ];
  return `${sections.join("\n")}\n`;
}

function shardHeader({ language, version, part, totalParts }) {
  return [
    "---",
    "dataset: ESCO",
    `version: ${version}`,
    `language: ${language}`,
    "content: occupation_skill_relations",
    `part: ${part}`,
    `parts: ${totalParts}`,
    `source: ${ESCO_DOWNLOAD_URL}`,
    "---",
    "",
    "# ESCO occupation-skill relations",
    "",
    "Relationships are official ESCO URI relations enriched with preferred labels from the matching language pack.",
    "",
  ].join("\n");
}

export function createShards(profiles, maxBytes) {
  const payloadLimit = maxBytes - HEADER_RESERVE_BYTES;
  const payloads = [];
  let current = "";
  let currentProfiles = 0;
  let profileCount = 0;

  for (const profile of profiles) {
    const block = occupationBlock(profile);
    const blockBytes = Buffer.byteLength(block, "utf8");
    if (blockBytes > payloadLimit) {
      throw new Error(`Single occupation profile exceeds shard limit: ${profile.occupationUri}`);
    }
    if (current && Buffer.byteLength(current, "utf8") + blockBytes > payloadLimit) {
      payloads.push({ text: current, profileCount: currentProfiles });
      current = "";
      currentProfiles = 0;
    }
    current += block;
    currentProfiles += 1;
    profileCount += 1;
  }
  if (current) payloads.push({ text: current, profileCount: currentProfiles });
  if (profileCount === 0) throw new Error("No occupation-skill profiles were generated");
  return payloads;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function ensureWritableTargets(outputDir, fileNames) {
  await mkdir(outputDir, { recursive: true });
  for (const fileName of fileNames) {
    try {
      await stat(path.join(outputDir, fileName));
      throw new Error(`Refusing to overwrite existing output: ${path.join(outputDir, fileName)}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const [occupationText, skillText, relationText] = await Promise.all([
    readUtf8(options.occupations),
    readUtf8(options.skills),
    readUtf8(options.relations),
  ]);
  const occupationRows = parseCsv(occupationText, options.occupations);
  const skillRows = parseCsv(skillText, options.skills);
  const relationRows = parseCsv(relationText, options.relations);
  const occupations = loadLabels(occupationRows, options.occupations, "occupation");
  const skills = loadLabels(skillRows, options.skills, "skill");
  const relationData = loadRelations(
    relationRows,
    options.relations,
    occupations,
    skills,
    options.allowMissingLabels,
  );
  const payloads = createShards(relationData.profiles, options.maxBytes);
  const width = Math.max(3, String(payloads.length).length);
  const baseName = `esco_${options.version}_occupation_skill_relations_${options.language}`;
  const outputs = payloads.map((payload, index) => {
    const part = index + 1;
    const partLabel = String(part).padStart(width, "0");
    const text = `${shardHeader({
      language: options.language,
      version: options.version,
      part,
      totalParts: payloads.length,
    })}\n${payload.text}`;
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > options.maxBytes) {
      throw new Error(`Generated shard ${partLabel} exceeds --max-bytes (${bytes} bytes)`);
    }
    return {
      fileName: `${baseName}_${partLabel}.md`,
      text,
      bytes,
      sha256: sha256(text),
      occupationCount: payload.profileCount,
    };
  });
  const manifestName = `${baseName}_manifest.json`;
  await ensureWritableTargets(options.outputDir, [...outputs.map((output) => output.fileName), manifestName]);

  for (const output of outputs) {
    await writeFile(path.join(options.outputDir, output.fileName), output.text, {
      encoding: "utf8",
      flag: "wx",
    });
  }

  const manifest = {
    schemaVersion: 1,
    dataset: "ESCO",
    version: options.version,
    language: options.language,
    content: "occupation_skill_relations",
    source: ESCO_DOWNLOAD_URL,
    inputs: {
      occupations: path.basename(options.occupations),
      skills: path.basename(options.skills),
      relations: path.basename(options.relations),
    },
    counts: {
      occupationsWithRelations: relationData.profiles.length,
      relations: relationData.relationCount,
      duplicateRelationsRemoved: relationData.duplicateCount,
      missingOccupationLabels: relationData.missingOccupationCount,
      missingSkillLabels: relationData.missingSkillCount,
      shards: outputs.length,
    },
    limits: {
      maxBytesPerShard: options.maxBytes,
      openAiTokenLimitPerFile: 5_000_000,
    },
    files: outputs.map(({ fileName, bytes, sha256: digest, occupationCount }) => ({
      fileName,
      bytes,
      sha256: digest,
      occupationCount,
    })),
  };
  await writeFile(path.join(options.outputDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  process.stdout.write(
    `Generated ${outputs.length} shard(s), ${relationData.profiles.length} occupation profiles, ` +
      `and ${relationData.relationCount} relations in ${options.outputDir}\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
