"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GitCompare,
  Search,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchFromBackend } from "@/lib/api";
import { toast } from "@/lib/stores/toast";
import type { Session, ToolCallEvent } from "@/lib/types";
import { FlowEmptyState } from "@/components/shared/FlowEmptyState";
import { EmptyState } from "@/components/shared/EmptyState";
import AutopsyReplayModal from "@/components/AutopsyReplayModal";
import { ReplayTheaterHeader } from "@/components/replay/ReplayTheaterHeader";
import { ReplayFilmTimeline } from "@/components/replay/ReplayFilmTimeline";
import { ReplayStage } from "@/components/replay/ReplayStage";
import { ReplayForensicsPanel } from "@/components/replay/ReplayForensicsPanel";
import { type EvaluationView } from "@/components/replay/ReplayEventInspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield } from "lucide-react";

interface TimelineEntry {
  event: ToolCallEvent;
  evaluation?: Record<string, unknown> | null;
}

interface ApprovalRequest {
  id: string;
  session_id: string;
  tool_name: string;
  operation_sha256: string;
  findings: Array<{ detector?: string; category?: string }>;
  status: string;
  expires_at: string;
}

type SessionAction = "KILL" | "QUARANTINE";
type EventFilter = "all" | "breached" | "high";

export default function RoundReplayPage() {
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessionParam);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDiff, setShowDiff] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [forensics, setForensics] = useState<Record<string, unknown> | null>(null);
  const [forensicsLoading, setForensicsLoading] = useState(false);
  const [autopsyOpen, setAutopsyOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [eventQuery, setEventQuery] = useState("");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const entry = timeline[selectedIndex];
  const current = entry?.event;
  const evaluation = entry?.evaluation;
  const previous = selectedIndex > 0 ? timeline[selectedIndex - 1]?.event : null;

  const timelineViews = useMemo(
    () =>
      timeline.map((t, index) => ({
        index,
        toolName: t.event.tool_name,
        risk: typeof t.evaluation?.risk_score === "number" ? (t.evaluation.risk_score as number) : 0,
        verdict: String(t.evaluation?.verdict ?? "—"),
        timestamp: t.event.timestamp,
      })),
    [timeline]
  );

  const trajectorySteps = useMemo(
    () =>
      timelineViews.map((v) => ({
        index: v.index,
        turn: v.index + 1,
        action: v.verdict,
        tool: v.toolName,
        risk: v.risk,
        verdict: v.verdict,
      })),
    [timelineViews]
  );

  const filteredViews = useMemo(() => {
    const q = eventQuery.trim().toLowerCase();
    return timelineViews.filter((v) => {
      if (eventFilter === "breached" && v.verdict !== "BREACHED") return false;
      if (eventFilter === "high" && v.risk < 50) return false;
      if (q && !v.toolName.toLowerCase().includes(q) && !v.verdict.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [timelineViews, eventFilter, eventQuery]);

  const breachedCount = timelineViews.filter((v) => v.verdict === "BREACHED").length;
  const peakRisk = timelineViews.reduce((max, v) => Math.max(max, v.risk), 0);

  useEffect(() => {
    fetchFromBackend<Session[]>("/api/v1/sessions?limit=50", { silent: true }).then((data) => {
      if (Array.isArray(data) && data.length) {
        setSessions(data);
        if (!sessionParam) setSelectedSessionId(data[0].id);
      }
      setLoadingSessions(false);
    });
  }, [sessionParam]);

  const refreshApprovals = useCallback(async () => {
    const data = await fetchFromBackend<ApprovalRequest[]>("/api/v1/approvals", { silent: true });
    if (Array.isArray(data)) setApprovals(data.filter((row) => row.status === "PENDING"));
  }, []);

  useEffect(() => {
    void refreshApprovals();
  }, [refreshApprovals]);

  const decideApproval = async (id: string, decision: "APPROVE" | "DENY") => {
    setApprovalLoading(id);
    const result = await fetchFromBackend(`/api/v1/approvals/${id}/decision`, {
      method: "POST", body: JSON.stringify({ decision }),
    });
    if (result) {
      toast(decision === "APPROVE" ? "Retry authorized once" : "Approval denied", { variant: "success" });
      await refreshApprovals();
    }
    setApprovalLoading(null);
  };

  useEffect(() => {
    if (sessionParam) setSelectedSessionId(sessionParam);
  }, [sessionParam]);

  useEffect(() => {
    if (!selectedSessionId) {
      setTimeline([]);
      setSelectedIndex(0);
      return;
    }

    setLoadingTimeline(true);
    fetchFromBackend<TimelineEntry[]>(`/api/v1/sessions/${selectedSessionId}/timeline`, {
      silent: true,
    }).then((data) => {
      if (Array.isArray(data) && data.length) {
        setTimeline(data);
        setSelectedIndex(0);
      } else {
        setTimeline([]);
        setSelectedIndex(0);
      }
      setForensics(null);
      setLoadingTimeline(false);
    });
  }, [selectedSessionId]);

  const selectEvent = useCallback(
    (index: number) => {
      setSelectedIndex(Math.max(0, Math.min(timeline.length - 1, index)));
    },
    [timeline.length]
  );

  const navigateFiltered = useCallback(
    (direction: 1 | -1) => {
      const pos = filteredViews.findIndex((v) => v.index === selectedIndex);
      const next = filteredViews[pos + direction];
      if (next) selectEvent(next.index);
    },
    [filteredViews, selectedIndex, selectEvent]
  );

  const posInFilter = filteredViews.findIndex((v) => v.index === selectedIndex);
  const canPrev = posInFilter > 0;
  const canNext = posInFilter >= 0 && posInFilter < filteredViews.length - 1;

  useEffect(() => {
    if (!playing || filteredViews.length === 0) return;
    const id = window.setInterval(() => {
      const pos = filteredViews.findIndex((v) => v.index === selectedIndex);
      if (pos >= filteredViews.length - 1) {
        setPlaying(false);
        return;
      }
      selectEvent(filteredViews[pos + 1].index);
    }, 1200);
    return () => window.clearInterval(id);
  }, [playing, filteredViews, selectedIndex, selectEvent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;

      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        navigateFiltered(1);
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        navigateFiltered(-1);
      } else if (event.key === " ") {
        event.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateFiltered]);

  const runForensics = async () => {
    if (!timeline.length) return;
    setForensicsLoading(true);
    const events = timeline.map((t) => ({
      tool_name: t.event.tool_name,
      arguments: t.event.arguments,
      response: t.event.response,
      risk_score: t.evaluation?.risk_score,
      verdict: t.evaluation?.verdict,
    }));
    const result = await fetchFromBackend("/api/v1/forensics/analyze", {
      method: "POST",
      body: JSON.stringify({ events, session_id: selectedSessionId }),
    });
    setForensics(result as Record<string, unknown>);
    setForensicsLoading(false);
  };

  const runSessionAction = async (action: SessionAction) => {
    if (!selectedSessionId) return;
    setActionLoading(true);
    try {
      await fetchFromBackend(`/api/v1/sessions/${selectedSessionId}/action`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      toast(`Session ${action.toLowerCase()} enforced`, { variant: "success" });
      const refreshed = await fetchFromBackend<Session[]>("/api/v1/sessions?limit=50", { silent: true });
      if (Array.isArray(refreshed)) setSessions(refreshed);
    } catch {
      toast("Action failed", { variant: "error" });
    }
    setActionLoading(false);
  };

  const exportTimeline = () => {
    const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `artsa-session-${selectedSessionId ?? "timeline"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!loadingSessions && sessions.length === 0) {
    return (
      <div className="replay-theater">
        <FlowEmptyState title="No sessions yet" />
      </div>
    );
  }

  return (
    <div className="replay-theater space-y-4">
      <ReplayTheaterHeader
        sessions={sessions}
        selectedSession={selectedSession}
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
        peakRisk={peakRisk}
        breachedCount={breachedCount}
        eventCount={timeline.length}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
        onPrev={() => navigateFiltered(-1)}
        onNext={() => navigateFiltered(1)}
        canPrev={canPrev}
        canNext={canNext}
        onExport={exportTimeline}
        onForensics={() => void runForensics()}
        forensicsLoading={forensicsLoading}
        exportDisabled={!timeline.length}
        actionLoading={actionLoading}
        onQuarantine={() => void runSessionAction("QUARANTINE")}
        onKill={() => void runSessionAction("KILL")}
      />

      {approvals.length > 0 && (
        <section className="replay-theater-panel p-4" aria-label="Pending approvals">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Pending operator approvals</h2>
              <p className="text-xs text-muted-foreground">Only digest and detector metadata are retained.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void refreshApprovals()}>Refresh</Button>
          </div>
          <div className="space-y-2">
            {approvals.map((approval) => (
              <div key={approval.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-xs">
                <div className="min-w-0">
                  <p className="font-medium">{approval.tool_name}</p>
                  <p className="truncate text-muted-foreground">SHA-256 {approval.operation_sha256}</p>
                  <p className="text-muted-foreground">{approval.findings.map((f) => f.category ?? f.detector).filter(Boolean).join(", ") || "Policy review"} · expires {new Date(approval.expires_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={approvalLoading === approval.id} onClick={() => void decideApproval(approval.id, "DENY")}>Deny</Button>
                  <Button size="sm" disabled={approvalLoading === approval.id} onClick={() => void decideApproval(approval.id, "APPROVE")}>Approve</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="replay-theater-panel">
        {loadingTimeline ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-96 w-full rounded-lg" />
          </div>
        ) : !current ? (
          <EmptyState
            icon={Shield}
            title="Nothing in this session yet"
            description="This session has no actions yet. Connect an app or run Attack Lab to generate activity."
            action={
              <Button asChild size="sm">
                <Link href="/get-started">API Keys</Link>
              </Button>
            }
            className="min-h-[420px] border-0 bg-transparent shadow-none"
          />
        ) : (
          <>
            <ReplayFilmTimeline
              entries={filteredViews.length ? filteredViews : timelineViews}
              steps={trajectorySteps}
              selectedIndex={selectedIndex}
              onSelect={selectEvent}
            />

            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 sm:px-5">
              <div className="relative min-w-[140px] flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={eventQuery}
                  onChange={(e) => setEventQuery(e.target.value)}
                  placeholder="Filter turns…"
                  className="h-8 pl-8 text-xs"
                  aria-label="Filter turns"
                />
              </div>
              <Tabs value={eventFilter} onValueChange={(v) => setEventFilter(v as EventFilter)}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  <TabsTrigger value="high" className="text-xs">High risk</TabsTrigger>
                  <TabsTrigger value="breached" className="text-xs">Breached</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                size="sm"
                variant={showDiff ? "default" : "outline"}
                className="gap-1.5 text-xs"
                onClick={() => setShowDiff(!showDiff)}
                disabled={!previous}
              >
                <GitCompare className="h-3.5 w-3.5" />
                Compare turns
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setAutopsyOpen(true)}>
                Cinema view
              </Button>
            </div>

            <ReplayStage
              event={current}
              evaluation={evaluation as EvaluationView | null | undefined}
              previousEvent={previous}
              showDiff={showDiff}
              turn={selectedIndex + 1}
              totalTurns={timeline.length}
            />
          </>
        )}
      </div>

      {forensics && <ReplayForensicsPanel data={forensics} />}

      <AutopsyReplayModal
        isOpen={autopsyOpen}
        onClose={() => setAutopsyOpen(false)}
        sessionId={selectedSessionId}
      />
    </div>
  );
}
