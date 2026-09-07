"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FRIENDLY_TECHNIQUE,
  RedTeamSimpleSteps,
} from "@/components/red-team/RedTeamGlossary";
import { Button } from "@/components/ui/button";
import { fetchFromBackend } from "@/lib/api";
import {
  intensityFromMatrix,
  mergeCampaignCategories,
  mutationsForIntensity,
} from "@/lib/redTeamAttackSets";
import { toast } from "@/lib/stores/toast";
import { kindLabel, type Target } from "@/lib/targets";
import { cn } from "@/lib/utils";

const ATTACK_SETS = [
  "Prompt Injection",
  "Tool Abuse",
  "Data Exfiltration",
  "Goal Manipulation",
  "Memory Poisoning",
] as const;

const FRIENDLY_SET: Record<string, string> = {
  "Prompt Injection": "Prompt Injection",
  "Tool Abuse": "Tool Abuse",
  "Data Exfiltration": "Data Exfiltration",
  "Goal Manipulation": "Goal Manipulation",
  "Memory Poisoning": "Memory Poisoning",
};

const MATRIX_ROWS = ["Injection", "Tool Abuse", "Exfiltration", "Goal Drift"] as const;
const INTENSITIES = ["Low", "Med", "High"] as const;

type PresetId = "quick" | "standard" | "thorough";

const PRESETS: Array<{
  id: PresetId;
  label: string;
  blurb: string;
  iterations: number;
  sets: string[];
  highAll: boolean;
}> = [
  {
    id: "quick",
    label: "Quick",
    blurb: "About 5 rounds — good first pass.",
    iterations: 5,
    sets: ["Prompt Injection", "Tool Abuse"],
    highAll: false,
  },
  {
    id: "standard",
    label: "Standard",
    blurb: "About 10 rounds — balanced coverage.",
    iterations: 10,
    sets: ["Prompt Injection", "Tool Abuse", "Data Exfiltration", "Goal Manipulation"],
    highAll: false,
  },
  {
    id: "thorough",
    label: "Thorough",
    blurb: "About 20 rounds — stronger pressure.",
    iterations: 20,
    sets: [...ATTACK_SETS],
    highAll: true,
  },
];

function buildMatrix(highAll: boolean): Record<string, Record<string, boolean>> {
  const init: Record<string, Record<string, boolean>> = {};
  for (const row of MATRIX_ROWS) {
    init[row] = {
      Low: true,
      Med: true,
      High: highAll || row !== "Goal Drift",
    };
  }
  return init;
}

export default function CampaignBuilderPage() {
  return (
    <Suspense fallback={<p className="text-[13px] text-muted-foreground">Loading campaign…</p>}>
      <CampaignBuilder />
    </Suspense>
  );
}

function CampaignBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetId = searchParams.get("target");
  const [target, setTarget] = useState<Target | null>(null);
  const [name, setName] = useState("Production Agent Assessment");
  const [preset, setPreset] = useState<PresetId>("standard");
  const [sets, setSets] = useState<string[]>([...PRESETS[1]!.sets]);
  const [matrix, setMatrix] = useState(() => buildMatrix(false));
  const [iterations, setIterations] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [launching, setLaunching] = useState(false);

  const categories = useMemo(() => mergeCampaignCategories(sets, matrix), [sets, matrix]);
  const intensity = useMemo(() => intensityFromMatrix(matrix), [matrix]);
  const mut = useMemo(() => mutationsForIntensity(intensity), [intensity]);

  useEffect(() => {
    if (!targetId) return;
    void fetchFromBackend<Target>(`/api/v1/targets/${encodeURIComponent(targetId)}`, {
      silent: true,
    }).then((t) => {
      if (!t) return;
      setTarget(t);
      setName((prev) =>
        prev === "Production Agent Assessment" ? `${t.name} · ${t.version}` : prev
      );
    });
  }, [targetId]);

  const applyPreset = (id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setSets([...p.sets]);
    setIterations(p.iterations);
    setMatrix(buildMatrix(p.highAll));
  };

  const toggleSet = (s: string) =>
    setSets((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const toggleCell = (row: string, col: string) =>
    setMatrix((prev) => ({
      ...prev,
      [row]: { ...prev[row], [col]: !prev[row]?.[col] },
    }));

  const launch = async () => {
    if (categories.length === 0) {
      toast("Pick at least one risk", {
        description: "Choose what you want to test before starting.",
        variant: "error",
      });
      return;
    }
    if (target && !target.authorized) {
      toast("Target is not authorized", {
        description: "Authorize it on Targets before ARTSA sends it any traffic.",
        variant: "error",
      });
      return;
    }
    setLaunching(true);
    const res = await fetchFromBackend<{ campaign_id?: string; message?: string }>(
      "/api/v1/campaigns/baseline",
      {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || "Red Team campaign",
          max_rounds: Math.max(1, Math.min(100, Math.floor(iterations) || 10)),
          categories,
          intensity,
          mutations_enabled: mut.mutations_enabled,
          max_mutations_per_attack: mut.max_mutations_per_attack,
          ...(targetId ? { target_id: targetId } : {}),
        }),
        timeoutMs: 20_000,
      }
    );
    setLaunching(false);
    if (!res?.campaign_id) {
      toast("Campaign not started", {
        description: "Add a target provider under Settings → Integrations, then try again.",
        variant: "error",
      });
      return;
    }
    toast("Campaign launched", {
      description: res.message || "Opening live Monitor…",
      variant: "success",
    });
    router.push(`/red-team/monitor/${res.campaign_id}?follow=1`);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Create campaign</h2>
        <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
          Pick a preset or customize attack sets — then launch and watch rounds in Monitor.
        </p>
      </div>

      {target ? (
        <div className="rounded-md border border-border bg-card px-3 py-2.5 text-[13px]">
          <p className="font-medium text-foreground">
            Target: {target.name}
            <span className="ml-2 font-mono text-[11px] text-muted-foreground">
              {kindLabel(target.kind)} · {target.version} · {target.provider}/{target.model}
            </span>
          </p>
          {target.authorized ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              This run uses the registered target. Results will be attributable to this system.
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-[hsl(var(--severity-high))]">
              This target is not authorized. ARTSA will refuse to send it traffic until you
              authorize it on{" "}
              <Link href="/targets" className="underline-offset-2 hover:underline">
                Targets
              </Link>
              .
            </p>
          )}
        </div>
      ) : targetId ? (
        <p className="text-[13px] text-muted-foreground">Loading target…</p>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          No target selected.{" "}
          <Link href="/targets" className="underline-offset-2 hover:underline">
            Register one
          </Link>{" "}
          so this campaign can be compared against later versions.
        </p>
      )}

      <RedTeamSimpleSteps
        steps={[
          { n: 1, title: "Name it", body: "Give the campaign a clear name you’ll recognize later." },
          { n: 2, title: "Choose depth", body: "Quick, Standard, or Thorough — or fine-tune below." },
          { n: 3, title: "Launch", body: "We’ll open Monitor as soon as the campaign starts." },
        ]}
      />

      <section className="space-y-2">
        <label className="block space-y-1 text-[12px]">
          <span className="text-muted-foreground">Campaign name</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </section>

      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-muted-foreground">How thorough?</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={cn(
                "rounded-md border px-3 py-3 text-left transition-colors",
                preset === p.id
                  ? "border-primary/40 bg-[hsl(var(--severity-info-subtle))]"
                  : "border-border bg-card hover:border-foreground/20"
              )}
            >
              <p className="text-[14px] font-medium text-foreground">{p.label}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{p.blurb}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-muted-foreground">What to test</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {ATTACK_SETS.map((s) => (
            <label
              key={s}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2.5 text-[13px]",
                sets.includes(s)
                  ? "border-primary/30 bg-[hsl(var(--severity-info-subtle))]"
                  : "border-border bg-card"
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={sets.includes(s)}
                onChange={() => toggleSet(s)}
              />
              <span>
                <span className="font-medium text-foreground">
                  {FRIENDLY_SET[s] ?? FRIENDLY_TECHNIQUE[s]?.label ?? s}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {FRIENDLY_TECHNIQUE[s]?.why ?? "Include this risk type in the test."}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide advanced options" : "Show advanced options"}
        </Button>
      </div>

      {showAdvanced ? (
        <>
          <section className="space-y-2">
            <h3 className="text-[12px] font-medium text-muted-foreground">
              Pressure levels (optional)
            </h3>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[360px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Risk</th>
                    {INTENSITIES.map((i) => (
                      <th key={i} className="px-3 py-2 font-medium">
                        {i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX_ROWS.map((row) => (
                    <tr key={row} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-foreground">{row}</td>
                      {INTENSITIES.map((col) => (
                        <td key={col} className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleCell(row, col)}
                            className={cn(
                              "text-[13px]",
                              matrix[row]?.[col] ? "text-foreground" : "text-muted-foreground/40"
                            )}
                            aria-pressed={matrix[row]?.[col]}
                          >
                            {matrix[row]?.[col] ? "On" : "Off"}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <label className="block max-w-xs space-y-1 text-[12px]">
            <span className="text-muted-foreground">How many rounds</span>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]"
              value={iterations}
              onChange={(e) => {
                const n = Number(e.target.value);
                setIterations(Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : 1);
              }}
            />
          </label>
        </>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          This preset runs about {iterations} rounds
          {categories.length ? ` across ${categories.length} risk areas` : ""}.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/red-team/campaigns">Back</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/red-team/lab">Attack Lab</Link>
        </Button>
        <Button
          size="sm"
          onClick={() => void launch()}
          disabled={launching || categories.length === 0 || (Boolean(target) && !target?.authorized)}
        >
          {launching ? "Launching…" : "Launch campaign"}
        </Button>
      </div>
    </div>
  );
}
