"use client";

import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Database, Rocket, ScrollText } from "lucide-react";
import { COMMAND_CENTER_UI } from "@/lib/getStartedLabels";

export default function RagAstraGuidePage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="RAG + Astra integration"
        description="Connect your document-search app to ARTSA so we can check retrieved content — not just alerts on the side."
        icon={<Database className="h-5 w-5" />}
      />
      <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
        <p>
          <strong className="text-foreground">Astra webhook → your URL</strong> does not monitor RAG queries in ARTSA.
          Call <code className="text-xs">POST /api/v1/ingest</code> from your app when users search and before the LLM runs.
        </p>
        <ol className="list-decimal pl-5 space-y-2 text-sm">
          <li>Guard the user query (<code className="text-xs">vector_search</code>)</li>
          <li>Run Astra search in your code</li>
          <li>Guard retrieved chunks (<code className="text-xs">rag_context_to_llm</code>)</li>
          <li>Call the LLM</li>
        </ol>
        <p className="text-sm">
          Python SDK: <code className="text-xs">client.guard_rag_search()</code> and{" "}
          <code className="text-xs">client.guard_rag_context()</code>. Example:{" "}
          <code className="text-xs">backend/examples/rag_astra_guard/</code>
        </p>
        <p className="text-sm">{COMMAND_CENTER_UI.outboundVsIngestNote}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/get-started">
            <Rocket className="h-4 w-4" />
            Run readiness test
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/rag-scanner">RAG Scanner</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/command-center">
            <ScrollText className="h-4 w-4" />
            Command Center
          </Link>
        </Button>
      </div>
    </div>
  );
}
