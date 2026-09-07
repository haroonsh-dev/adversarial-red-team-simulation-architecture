import { describe, it, expect } from "vitest";
import * as React from "react";
import { cn } from "@/lib/utils";
import { navSections, flattenNavItems, type NavItem } from "@/lib/navigation";
import { formatPayload, formatResponse } from "@/lib/replayFormat";

describe("cn (className merge)", () => {
  it("merges plain class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("drops falsy values", () => {
    expect(cn("px-2", false, null, undefined, "py-1")).toBe("px-2 py-1");
  });

  it("lets tailwind-merge resolve conflicting utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});

describe("navigation", () => {
  it("defines the product-lifecycle sections in order", () => {
    expect(navSections.map((s) => s.label)).toEqual([
      "",
      "Discover",
      "Assess",
      "Red Team",
      "Detect",
      "Investigate",
      "Report",
      "Admin",
    ]);
  });

  it("marks the Admin section as admin-only", () => {
    const admin = navSections.find((s) => s.label === "Admin");
    expect(admin?.adminOnly).toBe(true);
    expect(admin?.items.map((i) => i.href)).toEqual([
      "/settings/integrations",
      "/admin/providers",
      "/get-started",
      "/settings/team",
      "/settings",
    ]);
  });

  it("gives every nav item a name, href and a renderable icon", () => {
    const items = navSections.flatMap((s) => flattenNavItems(s.items));
    expect(items.length).toBeGreaterThanOrEqual(10);
    for (const item of items) {
      expect(typeof item.name).toBe("string");
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.href.startsWith("/")).toBe(true);
      expect(React.isValidElement(React.createElement(item.icon))).toBe(true);
    }
  });

  it("gates privileged routes behind RBAC capabilities", () => {
    const byHref = new Map<string, NavItem>(
      navSections.flatMap((s) => flattenNavItems(s.items)).map((i) => [i.href, i])
    );
    expect(byHref.get("/admin/policies")?.capability).toBe("can_manage_policies");
    expect(byHref.get("/red-team/campaigns")?.capability).toBe("can_run_campaigns");
  });

  it("puts Targets first in Discover", () => {
    const discover = navSections.find((s) => s.label === "Discover");
    expect(discover?.items.map((i) => i.name)).toEqual([
      "Targets",
      "AI Assets",
      "Agents",
      "Connections",
    ]);
  });

  it("lists Red Team items as a flat section", () => {
    const redTeam = navSections.find((s) => s.label === "Red Team");
    expect(redTeam?.items.map((c) => c.name)).toEqual([
      "Attack Lab",
      "Campaigns",
      "Attack Library",
    ]);
  });
});

describe("replayFormat", () => {
  it("passes through string payloads verbatim", () => {
    expect(formatPayload({ payload: "raw tool arguments" })).toBe("raw tool arguments");
  });

  it("pretty-prints non-string payloads", () => {
    const args = { payload: 42, detail: { a: 1 } };
    expect(formatPayload(args)).toBe(JSON.stringify(args, null, 2));
    expect(formatPayload({})).toBe("{}");
  });

  it("falls back when no defender response was captured", () => {
    expect(formatResponse(null)).toBe("No defender response captured.");
    expect(formatResponse(undefined)).toBe("No defender response captured.");
  });

  it("passes through response text and stringifies structured responses", () => {
    expect(formatResponse({ text: "blocked by guardrail" })).toBe("blocked by guardrail");
    const structured = { detail: { reason: "policy" } };
    expect(formatResponse(structured)).toBe(JSON.stringify(structured, null, 2));
  });
});

describe("workspace relatedness", () => {
  it("returns related links and a next action for core routes", async () => {
    const { workspaceFor } = await import("@/lib/workspace");
    const dash = workspaceFor("/command-center");
    expect(dash.related.length).toBeGreaterThan(0);
    expect(dash.next?.href).toBe("/red-team/lab");
    expect(workspaceFor("/logs").next?.href).toBe("/replay");
    expect(workspaceFor("/library").next?.href).toBe("/red-team/lab");
  });
});
