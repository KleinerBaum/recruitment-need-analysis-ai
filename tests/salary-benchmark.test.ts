import { describe, expect, it } from "vitest";

import {
  calculateSalaryBenchmark,
  type SalaryDatasetRow,
} from "@/lib/market/salary-benchmark";

function row(
  salary: number,
  overrides: Partial<SalaryDatasetRow> = {},
): SalaryDatasetRow {
  return {
    work_year: 2023,
    experience_level: "SE",
    job_title: "Data Scientist",
    salary_in_usd: salary,
    company_location: "DE",
    ...overrides,
  };
}

describe("deterministic salary benchmark", () => {
  it("calculates disclosed quartiles for a sufficiently large exact cohort", () => {
    const source = [40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 110_000]
      .map((salary) => row(salary));
    const result = calculateSalaryBenchmark(source, {
      roleTitle: "Data Scientist",
      seniority: "senior",
      companyLocationCode: "DE",
    });

    expect(result).toMatchObject({
      status: "available",
      currency: "USD",
      sampleSize: 8,
      period: { from: 2023, to: 2023 },
      matchedJobTitles: ["Data Scientist"],
      appliedFilters: { experienceLevel: "SE", companyLocation: "DE" },
      relaxedFilters: [],
      p25: 57_500,
      median: 75_000,
      p75: 92_500,
      method: "deterministic_observed_salary_distribution",
    });
  });

  it("discloses filter relaxation instead of disguising a thin local cohort", () => {
    const source = [
      ...[50_000, 60_000].map((salary) => row(salary)),
      ...[70_000, 80_000, 90_000, 100_000, 110_000, 120_000].map((salary) =>
        row(salary, { company_location: "US" })),
    ];
    const result = calculateSalaryBenchmark(source, {
      roleTitle: "Datenwissenschaftler/in",
      seniority: "senior",
      companyLocationCode: "DE",
    });

    expect(result.status).toBe("available");
    expect(result.sampleSize).toBe(8);
    expect(result.appliedFilters).toEqual({ experienceLevel: "SE" });
    expect(result.relaxedFilters).toEqual(["company_location"]);
  });

  it("abstains when the dataset has no defensible title match", () => {
    const result = calculateSalaryBenchmark(
      Array.from({ length: 20 }, (_, index) => row(60_000 + index * 1_000)),
      { roleTitle: "Kindergarten teacher", seniority: "senior" },
    );

    expect(result).toMatchObject({
      status: "insufficient_data",
      sampleSize: 0,
      matchedJobTitles: [],
      p25: null,
      median: null,
      p75: null,
    });
  });

  it("does not map a generic software title onto unrelated data roles", () => {
    const source = Array.from({ length: 20 }, (_, index) => row(
      60_000 + index * 1_000,
      { job_title: index % 2 === 0 ? "Data Engineer" : "AI Engineer" },
    ));

    const result = calculateSalaryBenchmark(source, {
      roleTitle: "Softwareentwickler/in",
      seniority: "senior",
    });

    expect(result.status).toBe("insufficient_data");
    expect(result.matchedJobTitles).toEqual([]);
  });

  it("drops invalid salary rows and never reports a tiny cohort as a benchmark", () => {
    const result = calculateSalaryBenchmark([
      row(0),
      row(Number.NaN),
      row(50_000),
      row(60_000),
    ], { roleTitle: "Data Scientist", minimumSampleSize: 5 });

    expect(result.status).toBe("insufficient_data");
    expect(result.sampleSize).toBe(2);
  });
});
