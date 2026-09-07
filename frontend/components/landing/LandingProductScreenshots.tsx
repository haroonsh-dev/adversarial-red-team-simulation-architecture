"use client";

import { cn } from "@/lib/utils";

export type ProductScreenId = "command" | "findings" | "redteam" | "replay" | "pipeline";

/** Miniature app chrome — pixel-faithful previews without static image assets. */
export function LandingProductScreenshot({
  screen,
  className,
}: {
  screen: ProductScreenId;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "landing-product-screenshot flex h-[11.5rem] overflow-hidden bg-[#070707] text-[7px] leading-tight sm:h-[12.5rem]",
        className
      )}
      aria-hidden
    >
      <aside className="hidden w-[18%] shrink-0 border-r border-[#313131] bg-[#141414] p-1.5 sm:block">
        <div className="mb-2 h-2 w-2 rounded bg-white" />
        {["Dashboard", "Campaigns", "Findings", "Replay"].map((label, i) => (
          <div
            key={label}
            className={cn(
              "mb-0.5 truncate rounded px-1 py-0.5",
              isActiveNav(screen, label, i) ? "bg-[#131313] text-white" : "text-[#a7a7a7]"
            )}
          >
            {label}
          </div>
        ))}
      </aside>
      <div className="min-w-0 flex-1 p-2">
        {screen === "command" && <CommandScreen />}
        {screen === "findings" && <FindingsScreen />}
        {screen === "redteam" && <RedTeamScreen />}
        {screen === "replay" && <ReplayScreen />}
        {screen === "pipeline" && <PipelineScreen />}
      </div>
    </div>
  );
}

function isActiveNav(screen: ProductScreenId, label: string, index: number) {
  const map: Record<ProductScreenId, number> = {
    command: 0,
    redteam: 1,
    findings: 2,
    replay: 3,
    pipeline: 0,
  };
  return map[screen] === index;
}

function ScreenHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-1 border-b border-[#313131] pb-1.5">
      <span className="truncate font-medium text-white">{title}</span>
      {badge ? (
        <span className="shrink-0 rounded border border-[#313131] bg-[#131313] px-1 py-px font-mono text-[6px] text-[#67b3ef]">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function CommandScreen() {
  return (
    <>
      <ScreenHeader title="Command Center" badge="LIVE" />
      <div className="mb-1.5 grid grid-cols-4 gap-1">
        {[
          { v: "42ms", l: "p99" },
          { v: "94%", l: "detect" },
          { v: "12", l: "sessions" },
          { v: "3", l: "critical" },
        ].map((s) => (
          <div key={s.l} className="rounded border border-[#313131] bg-[#131313] p-1">
            <div className="font-mono text-[8px] text-white">{s.v}</div>
            <div className="text-[6px] text-[#a7a7a7]">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-0.5">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "aspect-square rounded-[2px]",
              i % 6 === 0 ? "bg-[#67b3ef]/70" : i % 4 === 0 ? "bg-[#67b3ef]/35" : "bg-[#131313]"
            )}
          />
        ))}
      </div>
      <div className="mt-1.5 space-y-0.5">
        {["QUARANTINE · query_database", "ALLOW · read_order_status"].map((row, i) => (
          <div
            key={row}
            className={cn(
              "truncate rounded px-1 py-0.5 font-mono",
              i === 0 ? "bg-[#131313] text-[#67b3ef]" : "text-[#a7a7a7]"
            )}
          >
            {row}
          </div>
        ))}
      </div>
    </>
  );
}

function FindingsScreen() {
  const rows = [
    { id: "F-2841", sev: "CRITICAL", title: "RAG context injection" },
    { id: "F-2836", sev: "HIGH", title: "Lateral system command" },
    { id: "F-2829", sev: "MEDIUM", title: "Goal drift · support bot" },
  ];
  return (
    <>
      <ScreenHeader title="Findings" badge="Playbook v3" />
      <div className="mb-1 flex gap-1">
        {["All", "New", "Promoted"].map((t, i) => (
          <span
            key={t}
            className={cn(
              "rounded px-1 py-px",
              i === 0 ? "bg-white/10 text-white/80" : "text-white/35"
            )}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.id} className="rounded border border-white/5 bg-white/[0.02] p-1">
            <div className="flex items-center gap-1">
              <span className="font-mono text-[6px] text-white/35">{r.id}</span>
              <span
                className={cn(
                  "rounded px-0.5 font-mono text-[5px]",
                  r.sev === "CRITICAL" && "bg-[#67b3ef]/25 text-[#67b3ef]",
                  r.sev === "HIGH" && "bg-[#131313] text-white",
                  r.sev === "MEDIUM" && "bg-[#131313] text-[#a7a7a7]"
                )}
              >
                {r.sev}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[7px] text-white/75">{r.title}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function RedTeamScreen() {
  return (
    <>
      <ScreenHeader title="Red Team Console" badge="Scan 78%" />
      <div className="mb-1.5 grid grid-cols-6 gap-0.5">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "aspect-square rounded-[2px]",
              i % 5 === 0 ? "bg-[#67b3ef]/65" : i % 8 === 0 ? "bg-[#67b3ef]/30" : "bg-[#131313]"
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div className="rounded border border-[#313131] p-1">
          <div className="text-[6px] text-[#a7a7a7]">Bypasses</div>
          <div className="font-mono text-[9px] text-[#67b3ef]">3</div>
        </div>
        <div className="rounded border border-[#313131] p-1">
          <div className="text-[6px] text-[#a7a7a7]">Judge verdict</div>
          <div className="font-mono text-[9px] text-white">FAIL</div>
        </div>
      </div>
    </>
  );
}

function ReplayScreen() {
  return (
    <>
      <ScreenHeader title="Session Autopsy" badge="Film mode" />
      <div className="mb-1.5 flex gap-0.5">
        {["L1", "L2", "L3", "L4", "L5", "L6"].map((l, i) => (
          <div
            key={l}
            className={cn(
              "flex-1 rounded py-1 text-center font-mono text-[5px]",
              i >= 4 ? "bg-[#67b3ef]/40 text-white" : "bg-[#131313] text-[#a7a7a7]"
            )}
          >
            {l}
          </div>
        ))}
      </div>
      <div className="relative mb-1.5 h-1 overflow-hidden rounded-full bg-[#131313]">
        <div className="absolute inset-y-0 left-0 w-[68%] rounded-full bg-[#67b3ef]" />
      </div>
      <div className="rounded border border-[#313131] bg-[#131313] p-1">
        <div className="font-mono text-[6px] text-[#67b3ef]">QUARANTINE @ 4.2ms</div>
        <div className="mt-0.5 text-[6px] text-[#a7a7a7]">Layer 2 · Layer 8 fired</div>
      </div>
    </>
  );
}

function PipelineScreen() {
  const nodes = ["Research", "Attacker", "Target", "Defender"];
  return (
    <>
      <ScreenHeader title="Agent Pipeline" badge="4 agents" />
      <div className="relative flex items-center justify-between px-1 py-3">
        {nodes.map((n, i) => (
          <div key={n} className="relative z-10 flex flex-col items-center gap-0.5">
            <div
              className={cn(
                "h-5 w-5 rounded-md border",
                i === 1 ? "border-[#67b3ef]/50 bg-[#67b3ef]/20" : "border-[#313131] bg-[#131313]"
              )}
            />
            <span className="max-w-[2.5rem] truncate text-center text-[5px] text-[#a7a7a7]">{n}</span>
          </div>
        ))}
        <div className="absolute left-[12%] right-[12%] top-[38%] h-px bg-[#313131]" aria-hidden />
      </div>
      <div className="mt-1 space-y-0.5">
        <div className="flex justify-between text-[6px] text-[#a7a7a7]">
          <span>Integrity</span>
          <span className="text-[#67b3ef]">3/4 healthy</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[#131313]">
          <div className="h-full w-3/4 rounded-full bg-[#67b3ef]" />
        </div>
      </div>
    </>
  );
}
