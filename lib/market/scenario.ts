import {
  MarketScenarioRequestSchema,
  MarketScenarioResultSchema,
  type MarketScenarioRequest,
  type MarketScenarioResult,
  type Seniority,
} from "@/lib/contracts";

const BASE_INDEX = 78;
const MUST_HAVE_PENALTY = 4;

const SENIORITY_ADJUSTMENT: Readonly<Record<Seniority, number>> = {
  entry: 8,
  junior: 5,
  mid: 0,
  senior: -6,
  lead: -11,
  executive: -16,
};

function clampIndex(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

function roundPointDelta(value: number): number {
  return Math.round(value * 10) / 10;
}

function uniqueSkills(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/gu, " ").trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function reachIndex(input: MarketScenarioRequest, mustHaveCount: number): number {
  const radiusAdjustment = Math.min(input.searchRadiusKm, 200) * 0.06;
  const remoteAdjustment = input.remoteSharePercent * 0.12;
  return clampIndex(
    BASE_INDEX +
      radiusAdjustment +
      remoteAdjustment +
      SENIORITY_ADJUSTMENT[input.seniority] -
      mustHaveCount * MUST_HAVE_PENALTY,
  );
}

/**
 * Transparent scenario-only reach index.
 *
 * Every skill receives the same penalty. The model therefore demonstrates the
 * cost of adding another must-have without pretending to know skill scarcity,
 * candidate counts, observed salaries, or live market supply.
 */
export function calculateMarketScenario(rawInput: MarketScenarioRequest): MarketScenarioResult {
  const input = MarketScenarioRequestSchema.parse(rawInput);
  const mustHaveSkills = uniqueSkills(input.mustHaveSkills);
  const addedSkills = uniqueSkills(input.addedMustHaveSkills).filter(
    (skill) => !mustHaveSkills.some((current) => current.toLocaleLowerCase() === skill.toLocaleLowerCase()),
  );
  const baselineReachIndex = reachIndex(input, mustHaveSkills.length);

  const whatIfRows = addedSkills.map((addedSkill) => {
    const resultingMustHaveSkillCount = mustHaveSkills.length + 1;
    const resultingReach = reachIndex(input, resultingMustHaveSkillCount);
    return {
      addedSkill,
      resultingMustHaveSkillCount,
      reachIndex: resultingReach,
      deltaPoints: roundPointDelta(resultingReach - baselineReachIndex),
      explanation: {
        de: `Synthetisches Szenario: Ein zusätzliches Muss-Kriterium senkt den relativen Reach-Index vor Begrenzung auf 0–100 pauschal um ${MUST_HAVE_PENALTY} Punkte. Für „${addedSkill}“ wird keine spezifische Knappheit behauptet.`,
        en: `Synthetic scenario: one additional must-have lowers the relative reach index by a fixed ${MUST_HAVE_PENALTY} points before the 0–100 bounds are applied. No skill-specific scarcity is claimed for “${addedSkill}”.`,
      },
    };
  });

  return MarketScenarioResultSchema.parse({
    status: "synthetic_scenario_only",
    metric: "synthetic_scenario_reach_index",
    unit: "relative_points_0_to_100",
    reachIndex: baselineReachIndex,
    whatIfRows,
    provenance: {
      methodId: "synthetic_candidate_reach_v1",
      dataBasis: "scenario_inputs_only",
      formula:
        "clamp(0,100,78 + min(radiusKm,200)*0.06 + remoteSharePercent*0.12 + seniorityAdjustment - mustHaveSkillCount*4)",
      usesLiveCandidateData: false,
      usesMarketCounts: false,
      usesSalaryData: false,
      usesLlm: false,
      modelsSkillSpecificScarcity: false,
    },
    assumptions: [
      {
        de: "Der Index ist eine relative, synthetische Entscheidungshilfe. 100 bedeutet nicht 100 Kandidat:innen.",
        en: "The index is a relative synthetic decision aid. A value of 100 does not mean 100 candidates.",
      },
      {
        de: "Suchradius, Remote-Anteil, Seniorität und Anzahl der Muss-Kriterien werden mit offen gelegten Demo-Gewichten verrechnet.",
        en: "Search radius, remote share, seniority, and the number of must-haves use disclosed demo weights.",
      },
      {
        de: "Alle zusätzlichen Skills erhalten denselben Abschlag; es werden keine skill-spezifischen Markt- oder Knappheitsdaten unterstellt.",
        en: "Every added skill receives the same adjustment; no skill-specific market or scarcity data is assumed.",
      },
    ],
    disclaimer: {
      de: "Synthetische Demo – keine beobachteten Gehälter, Kandidatenzahlen, Verfügbarkeitsprognosen oder Marktstatistiken. Nur relative Szenarioeffekte.",
      en: "Synthetic demo — no observed salaries, candidate counts, availability forecasts, or market statistics. Relative scenario effects only.",
    },
  });
}
