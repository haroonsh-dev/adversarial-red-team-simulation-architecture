import { describe, expect, it } from "vitest";
import { severityBarWidth } from "@/lib/commandCenterUi";

describe("severityBarWidth", () => {
  it("returns proportional width with minimum segment", () => {
    expect(severityBarWidth(2, 10)).toBe("20%");
    expect(severityBarWidth(0, 10)).toBe("0%");
    expect(severityBarWidth(1, 100)).toBe("2%");
  });
});
