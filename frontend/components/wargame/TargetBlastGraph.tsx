"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TargetBlastNode } from "@/lib/redTeamTargetBlast";

const VIEW = 320;
const CX = VIEW / 2;
const CY = VIEW / 2;
const HUB_R = 36;
const SPOKE_R = 22;
const ORBIT = 110;

function riskColor(risk: number | null): string {
  if (risk == null) return "#454545";
  if (risk >= 75) return "#f87171";
  if (risk >= 50) return "#fbbf24";
  if (risk >= 25) return "#67b3ef";
  return "#4ade80";
}

interface TargetBlastGraphProps {
  node: TargetBlastNode;
  className?: string;
}

/** Radial blast graph: one target hub → campaign spokes from real scan history. */
export function TargetBlastGraph({ node, className }: TargetBlastGraphProps) {
  const spokes = node.spokes.slice(0, 8);
  const empty = spokes.length === 0;

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-background", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="truncate text-[13px] font-medium text-foreground">{node.targetName}</p>
        <span className="font-mono text-[9px] uppercase text-muted-foreground">
          {spokes.length} campaign{spokes.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="mx-auto h-[240px] w-full" role="img" aria-label="Target blast graph">
          {empty ? (
            <text
              x={CX}
              y={CY + 60}
              textAnchor="middle"
              className="fill-[#454545]"
              style={{ fontSize: 11 }}
            >
              No campaigns against this target yet
            </text>
          ) : null}

          {spokes.map((s, i) => {
            const angle = (Math.PI * 2 * i) / Math.max(spokes.length, 1) - Math.PI / 2;
            const x = CX + Math.cos(angle) * ORBIT;
            const y = CY + Math.sin(angle) * ORBIT;
            const color = riskColor(s.riskScore);
            return (
              <g key={s.campaignId}>
                <line
                  x1={CX}
                  y1={CY}
                  x2={x}
                  y2={y}
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={0.7}
                />
                <a href={`/campaigns/${s.campaignId}`}>
                  <circle cx={x} cy={y} r={SPOKE_R} fill="hsl(var(--muted))" stroke={color} strokeWidth={1.5} />
                  <text
                    x={x}
                    y={y + 3}
                    textAnchor="middle"
                    className="fill-white"
                    style={{ fontSize: 8, fontFamily: "ui-monospace, monospace" }}
                  >
                    {s.riskScore != null ? `${s.riskScore}%` : "—"}
                  </text>
                </a>
              </g>
            );
          })}

          <circle
            cx={CX}
            cy={CY}
            r={HUB_R}
            fill={node.configured ? "hsl(var(--brand-subtle))" : "hsl(var(--muted))"}
            stroke={node.configured ? "#67b3ef" : "#454545"}
            strokeWidth={2}
          />
          <text
            x={CX}
            y={CY - 4}
            textAnchor="middle"
            className="fill-white"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            Target
          </text>
          <text
            x={CX}
            y={CY + 10}
            textAnchor="middle"
            className="fill-[#7c7c7c]"
            style={{ fontSize: 8, fontFamily: "ui-monospace, monospace" }}
          >
            {node.model.length > 14 ? `${node.model.slice(0, 14)}…` : node.model}
          </text>
        </svg>
      </div>
      {!empty ? (
        <ul className="max-h-28 space-y-1 overflow-y-auto border-t border-border px-3 py-2">
          {spokes.map((s) => (
            <li key={s.campaignId} className="flex items-center justify-between gap-2 text-[11px]">
              <Link href={`/campaigns/${s.campaignId}`} className="truncate text-muted-foreground hover:text-foreground">
                {s.label}
              </Link>
              <span className="shrink-0 font-mono text-[10px]" style={{ color: riskColor(s.riskScore) }}>
                {s.riskScore != null ? `${s.riskScore}%` : s.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
