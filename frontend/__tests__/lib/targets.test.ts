import { describe, expect, it } from "vitest";
import {
  DISCOVERY_STATE_COPY,
  TARGET_KINDS,
  discoveryState,
  kindLabel,
  presentCapabilities,
  surfaceCoverage,
  type Target,
  type TargetSurface,
} from "@/lib/targets";

function makeTarget(overrides: Partial<Target> = {}): Target {
  return {
    id: "t1",
    tenant_id: "acme",
    name: "Support agent",
    kind: "agent",
    version: "v1",
    description: null,
    provider: "openai",
    model: "gpt-4o-mini",
    base_url: null,
    system_prompt: null,
    authorized: false,
    tags: [],
    config: {},
    surface: null,
    discovered_at: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function makeSurface(overrides: Partial<TargetSurface> = {}): TargetSurface {
  return {
    reachable: true,
    unreachable_reason: null,
    probes_run: 6,
    reported_model: null,
    capabilities: [],
    surface: [],
    trust_boundaries: ["user → agent"],
    discovered_at: "2026-09-03T00:00:00Z",
    ...overrides,
  };
}

describe("discoveryState", () => {
  it("reports unauthorized before anything else", () => {
    // An unauthorized target must never look mapped, even with a stale surface.
    const target = makeTarget({ authorized: false, surface: makeSurface() });
    expect(discoveryState(target)).toBe("unauthorized");
  });

  it("reports undiscovered once authorized with no surface", () => {
    expect(discoveryState(makeTarget({ authorized: true }))).toBe("undiscovered");
  });

  it("distinguishes unreachable from mapped", () => {
    const unreachable = makeTarget({
      authorized: true,
      surface: makeSurface({ reachable: false, unreachable_reason: "no key" }),
    });
    expect(discoveryState(unreachable)).toBe("unreachable");

    const mapped = makeTarget({ authorized: true, surface: makeSurface() });
    expect(discoveryState(mapped)).toBe("mapped");
  });

  it("has copy for every state", () => {
    for (const state of ["unauthorized", "undiscovered", "unreachable", "mapped"] as const) {
      expect(DISCOVERY_STATE_COPY[state].label).toBeTruthy();
      expect(DISCOVERY_STATE_COPY[state].hint).toBeTruthy();
    }
  });
});

describe("surfaceCoverage", () => {
  it("reports zero open categories when unmapped", () => {
    expect(surfaceCoverage(null)).toEqual({ open: 0, total: 12 });
  });

  it("does not credit coverage for an unreachable target", () => {
    const surface = makeSurface({
      reachable: false,
      surface: [
        { taxonomy_id: "AI-01", title: "Prompt Injection", rationale: "x", from_capabilities: [] },
      ],
    });
    expect(surfaceCoverage(surface).open).toBe(0);
  });

  it("counts opened categories against the 12-category taxonomy", () => {
    const surface = makeSurface({
      surface: [
        { taxonomy_id: "AI-01", title: "Prompt Injection", rationale: "x", from_capabilities: [] },
        { taxonomy_id: "AI-04", title: "Tool Misuse", rationale: "y", from_capabilities: ["tools"] },
      ],
    });
    expect(surfaceCoverage(surface)).toEqual({ open: 2, total: 12 });
  });
});

describe("presentCapabilities", () => {
  it("returns nothing without a surface", () => {
    expect(presentCapabilities(null)).toEqual([]);
  });

  it("drops absent capabilities and orders the rest for display", () => {
    const surface = makeSurface({
      capabilities: [
        { id: "external_api", present: true, confidence: 0.6, evidence: "" },
        { id: "memory", present: false, confidence: 0.9, evidence: "No." },
        { id: "tools", present: true, confidence: 0.9, evidence: "search tool" },
      ],
    });
    expect(presentCapabilities(surface).map((c) => c.id)).toEqual(["tools", "external_api"]);
  });
});

describe("kindLabel", () => {
  it("maps every known kind to a human label", () => {
    for (const kind of TARGET_KINDS) {
      expect(kindLabel(kind.id)).toBe(kind.label);
    }
  });

  it("falls back to the raw value for an unknown kind", () => {
    expect(kindLabel("something_new")).toBe("something_new");
  });
});
