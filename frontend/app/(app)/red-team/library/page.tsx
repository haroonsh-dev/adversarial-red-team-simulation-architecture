"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFromBackend } from "@/lib/api";

type LibraryTemplate = {
  id?: string;
  name?: string;
  category?: string;
  severity?: string;
  template?: string;
};

type LibraryResponse = {
  categories?: Array<{ code: string; name: string; description?: string }>;
  templates?: LibraryTemplate[];
  total_templates?: number;
};

const OWASP_HINT: Record<string, string> = {
  DPI: "OWASP LLM01",
  IPI: "OWASP LLM01",
  JBK: "ATLAS AML.T0054",
  SPE: "OWASP LLM07",
  DEX: "OWASP LLM06",
  PEX: "OWASP LLM08",
  MSE: "ATLAS",
  TPA: "OWASP LLM08",
};

/** Live attack library from `/api/v1/attack-library` — no static demo list. */
export default function LibraryPage() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetchFromBackend<LibraryResponse>("/api/v1/attack-library", {
        silent: true,
      });
      if (cancelled) return;
      if (!res) {
        setError("Could not load attack library from API.");
        setData(null);
      } else {
        setError(null);
        setData(res);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const templates = useMemo(() => {
    const rows = data?.templates ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((t) => {
      const blob = `${t.name ?? ""} ${t.category ?? ""} ${t.id ?? ""}`.toLowerCase();
      return blob.includes(needle);
    });
  }, [data, q]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of data?.templates ?? []) {
      const cat = String(t.category || "UNK");
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return map;
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Templates from ARTSA that you can run in Attack Lab.
            {data?.total_templates != null ? ` · ${data.total_templates} templates` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href="/red-team/lab">Open Attack Lab</Link>
        </Button>
      </div>

      {data?.categories?.length ? (
        <div className="flex flex-wrap gap-2">
          {data.categories.map((c) => (
            <span
              key={c.code}
              className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground"
              title={c.description}
            >
              {c.code} · {byCategory.get(c.code) ?? 0}
            </span>
          ))}
        </div>
      ) : null}

      <label className="block max-w-md space-y-1 text-[12px]">
        <span className="text-muted-foreground">Filter</span>
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, category, id…"
        />
      </label>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
          {error} Check API connection, then refresh.
        </p>
      ) : templates.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
          No templates returned from API.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {templates.slice(0, 80).map((t) => {
            const cat = String(t.category || "—");
            const name = String(t.name || t.id || "Template");
            return (
              <li
                key={String(t.id || name)}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {cat}
                    {OWASP_HINT[cat] ? ` · ${OWASP_HINT[cat]}` : ""}
                    {t.id ? ` · ${t.id}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/red-team/lab?technique=${encodeURIComponent(name)}`}>Use in Lab</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
