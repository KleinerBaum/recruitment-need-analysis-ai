import { describe, expect, it } from "vitest";

import { DEMO_JOB_ADS } from "@/lib/data/demo-job-ads";

function byId(id: string) {
  const fixture = DEMO_JOB_ADS.find((candidate) => candidate.id === id);
  expect(fixture, `Missing demo job ad ${id}`).toBeDefined();
  return fixture!;
}

describe("demo job ads", () => {
  it("provides six uniquely identified German and English ads", () => {
    expect(DEMO_JOB_ADS).toHaveLength(6);
    expect(DEMO_JOB_ADS.filter(({ language }) => language === "de")).toHaveLength(3);
    expect(DEMO_JOB_ADS.filter(({ language }) => language === "en")).toHaveLength(3);
    expect(new Set(DEMO_JOB_ADS.map(({ id }) => id)).size).toBe(6);

    for (const ad of DEMO_JOB_ADS) {
      expect(ad.id).toMatch(/^TESTJOBAD-(DE|EN)-0[1-3]$/);
      expect(ad.title.trim()).not.toBe("");
      expect(ad.location.trim()).not.toBe("");
      expect(ad.text.startsWith(ad.title)).toBe(true);
    }
  });

  it("contains no parser guidance or expected-output oracle data", () => {
    const forbiddenPatterns = [
      /parser notes?/i,
      /besondere hinweise f(?:ü|ue)r parser/i,
      /expected extraction/i,
      /erwartete extraktion/i,
      /salary_status/i,
      /benefits_are_requirements/i,
      /leadership_scope/i,
      /remote_only/i,
    ];

    for (const ad of DEMO_JOB_ADS) {
      for (const pattern of forbiddenPatterns) {
        expect(ad.text).not.toMatch(pattern);
      }
    }
  });

  it("uses only reserved .example domains for contact addresses", () => {
    const emailPattern = /[A-Z0-9._%+-]+@([A-Z0-9.-]+)/gi;

    for (const ad of DEMO_JOB_ADS) {
      const domains = [...ad.text.matchAll(emailPattern)].map((match) => match[1]);
      expect(domains).toHaveLength(1);
      expect(domains[0]?.toLowerCase().endsWith(".example")).toBe(true);
    }
  });

  it("preserves numeric and explicitly non-numeric salary cases", () => {
    expect(byId("TESTJOBAD-DE-01").text).toContain("60.000–75.000 EUR");
    expect(byId("TESTJOBAD-EN-01").text).toContain("GBP 65,000–80,000");
    expect(byId("TESTJOBAD-EN-02").text).toContain("EUR 70,000–90,000");

    expect(byId("TESTJOBAD-DE-02").text).toContain("keine konkrete Gehaltsspanne");
    expect(byId("TESTJOBAD-DE-03").text).toContain("Keine numerische Spanne genannt");
    expect(byId("TESTJOBAD-EN-03").text).toContain("No numeric salary range provided");
  });

  it("preserves hybrid, limited-remote, and on-site distinctions", () => {
    expect(byId("TESTJOBAD-DE-01").text).toContain("Kein Remote-only-Modell");
    expect(byId("TESTJOBAD-EN-01").text).toContain("2–3 days per week in the London office");
    expect(byId("TESTJOBAD-EN-02").text).toContain("Cross-border remote work is not guaranteed");

    expect(byId("TESTJOBAD-DE-02").text).toContain("Remote innerhalb Deutschlands");
    expect(byId("TESTJOBAD-DE-02").text).toContain("quartalsweise Teamtage");

    expect(byId("TESTJOBAD-DE-03").text).toContain("Überwiegend vor Ort");
    expect(byId("TESTJOBAD-EN-03").text).toContain("Primarily on-site");
    expect(byId("TESTJOBAD-EN-03").text).toContain("One remote administration day");
  });

  it("retains leadership and separate language requirement signals", () => {
    expect(byId("TESTJOBAD-DE-02").text).toContain(
      "ohne disziplinarische Führungsverantwortung",
    );
    expect(byId("TESTJOBAD-DE-03").text).toContain(
      "Fachliche und disziplinarische Führung",
    );
    expect(byId("TESTJOBAD-DE-01").text).toContain("Deutsch: sehr gut");
    expect(byId("TESTJOBAD-DE-01").text).toContain("Englisch: gut bis sehr gut");
    expect(byId("TESTJOBAD-EN-02").text).toContain("Dutch: nice to have");
    expect(byId("TESTJOBAD-EN-03").text).toContain("Polish: nice to have");
  });
});
