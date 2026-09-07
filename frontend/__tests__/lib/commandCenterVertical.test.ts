import { describe, expect, it } from "vitest";
import { CONTAINMENT_MESH, VERTICAL_COMPARE } from "@/lib/commandCenterVertical";

describe("commandCenterVertical", () => {
  it("defines a full containment mesh path", () => {
    expect(CONTAINMENT_MESH.nodes.length).toBeGreaterThanOrEqual(5);
    expect(CONTAINMENT_MESH.edges.some((e) => e.from === "tool" && e.to === "ingest")).toBe(true);
    expect(CONTAINMENT_MESH.edges.some((e) => e.to === "action")).toBe(true);
  });

  it("contrasts generic SOC vs ARTSA vertical", () => {
    expect(VERTICAL_COMPARE.generic.length).toBe(3);
    expect(VERTICAL_COMPARE.artsa.length).toBe(3);
    expect(VERTICAL_COMPARE.artsa[0].label.toLowerCase()).toContain("agent");
  });
});
