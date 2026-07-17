import { describe, expect, it } from "vitest";

import { extractJobAdText } from "@/lib/server/job-source";

describe("job-source extraction", () => {
  it("extracts readable text while excluding executable HTML content", () => {
    const text = extractJobAdText(
      "<article><h1>Data Engineer</h1><p>Build reliable pipelines.</p><script>ignore this</script></article>",
      "text/html",
    );
    expect(text).toContain("Data Engineer");
    expect(text).toContain("Build reliable pipelines.");
    expect(text).not.toContain("ignore this");
  });

  it("preserves plain text sources", () => {
    expect(extractJobAdText("Senior Analyst\r\nPython required", "text/plain"))
      .toBe("Senior Analyst\nPython required");
  });
});
