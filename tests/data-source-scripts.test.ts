import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe("ESCO relation shard preparation", () => {
  it("joins localized labels, removes duplicate relations, and emits a manifest", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "needly-esco-shards-"));
    temporaryDirectories.push(outputDirectory);
    const fixtureDirectory = path.join(repositoryRoot, "tests", "fixtures", "esco");

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "scripts/prepare-esco-relation-shards.mjs",
        "--occupations",
        path.join(fixtureDirectory, "occupations_de.csv"),
        "--skills",
        path.join(fixtureDirectory, "skills_de.csv"),
        "--relations",
        path.join(fixtureDirectory, "occupationSkillRelations.csv"),
        "--language",
        "de",
        "--output-dir",
        outputDirectory,
        "--max-bytes",
        "100000",
      ],
      { cwd: repositoryRoot },
    );

    expect(stdout).toContain("Generated 1 shard(s), 2 occupation profiles, and 3 relations");
    const manifestPath = path.join(
      outputDirectory,
      "esco_v1.2.1_occupation_skill_relations_de_manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(manifest.counts).toMatchObject({
      occupationsWithRelations: 2,
      relations: 3,
      duplicateRelationsRemoved: 1,
      missingOccupationLabels: 0,
      missingSkillLabels: 0,
      shards: 1,
    });
    expect(manifest.limits).toEqual({
      maxBytesPerShard: 100000,
      openAiTokenLimitPerFile: 5_000_000,
    });
    expect(manifest.files[0].sha256).toMatch(/^[a-f0-9]{64}$/u);

    const shard = await readFile(path.join(outputDirectory, manifest.files[0].fileName), "utf8");
    expect(shard).toContain("language: de");
    expect(shard).toContain("# Datenanalyst/in, Senior");
    expect(shard).toContain("## Essential skills");
    expect(shard).toContain("Daten auswerten");
    expect(shard.match(/Software testen/gu)).toHaveLength(2);

    await expect(execFileAsync(
      process.execPath,
      [
        "scripts/prepare-esco-relation-shards.mjs",
        "--occupations",
        path.join(fixtureDirectory, "occupations_de.csv"),
        "--skills",
        path.join(fixtureDirectory, "skills_de.csv"),
        "--relations",
        path.join(fixtureDirectory, "occupationSkillRelations.csv"),
        "--language",
        "de",
        "--output-dir",
        outputDirectory,
        "--max-bytes",
        "100000",
      ],
      { cwd: repositoryRoot },
    )).rejects.toMatchObject({ code: 1 });
  });
});

describe("source readiness diagnostics", () => {
  it("is explicitly read-only and exits before a network call when configuration is missing", async () => {
    const environment = { ...process.env };
    for (const key of Object.keys(environment)) {
      if (key === "OPENAI_API_KEY" || key.startsWith("OPENAI_") && key.endsWith("_ID")) {
        delete environment[key];
      }
    }

    await expect(execFileAsync(
      process.execPath,
      ["scripts/diagnose-source-readiness.mjs"],
      { cwd: repositoryRoot, env: environment },
    )).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining("Read-only diagnostics: no OpenAI resource was modified."),
    });
  });

  it("documents its non-mutating scope in help output", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/diagnose-source-readiness.mjs", "--help"],
      { cwd: repositoryRoot },
    );
    expect(stdout).toContain("without changing remote state");
    expect(stdout).toContain("never uploads,");
    expect(stdout).toContain("attaches, updates, or deletes resources");
  });
});
