import { describe, it, expect } from "vitest";

describe("navigation", () => {
  it("exports all primary routes", async () => {
    const { navSections, flattenNavItems } = await import("@/lib/navigation");
    const hrefs = navSections.flatMap((s) => flattenNavItems(s.items).map((i) => i.href));
    expect(hrefs).toContain("/command-center");
    expect(hrefs).toContain("/targets");
    expect(hrefs).toContain("/pipeline");
    expect(hrefs).toContain("/logs");
    expect(hrefs).toContain("/findings");
    expect(hrefs).toContain("/red-team/campaigns");
    expect(hrefs).toContain("/admin/policies");
    expect(hrefs).toContain("/replay");
    expect(hrefs).toContain("/reports");
  });
});

describe("ingest snippet", () => {
  it("builds curl with default localhost backend", async () => {
    const { buildIngestCurlSnippet } = await import("@/lib/ingestSnippet");
    const curl = buildIngestCurlSnippet();
    expect(curl).toContain("http://localhost:8000/api/v1/ingest");
    expect(curl).toContain("X-API-Key");
    expect(curl).toContain("read_file");
  });
});

describe("risk score formatting", () => {
  it("formats scores consistently", async () => {
    const { formatRiskScore } = await import("@/lib/utils");
    expect(formatRiskScore(92.4)).toBe("92.4");
  });
});
