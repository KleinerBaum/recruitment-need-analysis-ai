import { describe, expect, it } from "vitest";

import { POST as createScenario } from "@/app/api/scenario/route";
import { MarketScenarioResultSchema } from "@/lib/contracts";
import { calculateMarketScenario } from "@/lib/market/scenario";

const BASE_REQUEST = {
  briefId: "brief-1",
  searchRadiusKm: 50,
  remoteSharePercent: 25,
  seniority: "senior" as const,
  mustHaveSkills: ["Python", "SQL"],
  addedMustHaveSkills: ["Kubernetes", "Terraform"],
};

describe("synthetic market scenario", () => {
  it("returns contract-valid relative indices without candidate or observed-salary claims", () => {
    const result = calculateMarketScenario(BASE_REQUEST);
    expect(MarketScenarioResultSchema.parse(result)).toEqual(result);
    expect(result.status).toBe("synthetic_scenario_only");
    expect(result.metric).toBe("synthetic_scenario_reach_index");
    expect(result.provenance).toMatchObject({
      dataBasis: "scenario_inputs_only",
      usesLiveCandidateData: false,
      usesMarketCounts: false,
      usesSalaryData: false,
      usesLlm: false,
      modelsSkillSpecificScarcity: false,
    });
    expect(result.baselineReachIndex).toBe(70);
    expect(result.reachIndex).toBe(62);
    expect(result.deltaPoints).toBe(-8);
    expect(result.whatIfRows.map((row) => row.deltaPoints)).toEqual([-4, -4]);
    expect(result.whatIfRows.map((row) => row.reachIndex)).toEqual([66, 62]);
    expect(result.whatIfRows.every((row) => row.reachIndex <= result.baselineReachIndex)).toBe(true);
    expect(result.whatIfRows.at(-1)?.reachIndex).toBe(result.reachIndex);
    expect(result.references.every((reference) => reference.dataImported === false)).toBe(true);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("candidateCount");
    expect(serialized).not.toContain("observedSalary");
    expect(result.disclaimer.en).toContain("no observed salaries");
    expect(result.disclaimer.en).toContain("candidate counts");
  });

  it("uses identical demo effects for all skills rather than inventing scarcity", () => {
    const result = calculateMarketScenario({
      ...BASE_REQUEST,
      addedMustHaveSkills: ["Rare-sounding skill", "Common-sounding skill"],
    });
    expect(result.whatIfRows[0]?.deltaPoints).toBe(result.whatIfRows[1]?.deltaPoints);
    expect(result.whatIfRows[0]?.explanation.en).toContain("No skill-specific scarcity");
  });

  it("deduplicates existing and repeated added skills", () => {
    const result = calculateMarketScenario({
      ...BASE_REQUEST,
      addedMustHaveSkills: ["Python", "Kubernetes", "kubernetes"],
    });
    expect(result.whatIfRows.map((row) => row.addedSkill)).toEqual(["Kubernetes"]);
  });

  it("raises the relative reach index for broader synthetic reach inputs", () => {
    const narrow = calculateMarketScenario({
      ...BASE_REQUEST,
      searchRadiusKm: 10,
      remoteSharePercent: 0,
      addedMustHaveSkills: [],
    });
    const broad = calculateMarketScenario({
      ...BASE_REQUEST,
      searchRadiusKm: 150,
      remoteSharePercent: 100,
      addedMustHaveSkills: [],
    });
    expect(broad.reachIndex).toBeGreaterThan(narrow.reachIndex);
  });

  it("reports the actual clamped delta at the lower bound", () => {
    const result = calculateMarketScenario({
      ...BASE_REQUEST,
      searchRadiusKm: 0,
      remoteSharePercent: 0,
      seniority: "executive",
      mustHaveSkills: Array.from({ length: 50 }, (_, index) => `Skill ${index}`),
      addedMustHaveSkills: ["One more skill"],
    });
    expect(result.reachIndex).toBe(0);
    expect(result.whatIfRows[0]?.deltaPoints).toBe(0);
    expect(result.whatIfRows[0]?.explanation.en).toContain("before the 0–100 bounds");
  });

  it("validates and returns the same guarded contract from the API route", async () => {
    const response = await createScenario(
      new Request("http://localhost/api/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(BASE_REQUEST),
      }),
    );
    expect(response.status).toBe(200);
    expect(MarketScenarioResultSchema.parse(await response.json()).status).toBe(
      "synthetic_scenario_only",
    );
  });
});
