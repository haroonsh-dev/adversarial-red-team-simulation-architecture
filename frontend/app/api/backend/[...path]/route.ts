import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side BFF proxy for ARTSA.
 *
 * Proxies to the containment API only. On upstream failure / timeout, returns
 * an explicit error — never invents campaigns, metrics, providers, or auth tokens.
 */
export const dynamic = "force-dynamic";

const SERVER_API_KEY = process.env.ARTSA_API_KEY || "";

function isOfflinePreviewBearer(authHeader: string | null): boolean {
  if (!authHeader) return true;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return !token || token === "demo_preview_token" || token.startsWith("admin_token_");
}

function applyUpstreamAuth(headers: Headers, request: NextRequest): void {
  const xApiKey = request.headers.get("x-api-key");
  const auth = request.headers.get("authorization");

  if (xApiKey) {
    headers.set("x-api-key", xApiKey);
    return;
  }

  // Stale or demo JWTs block SERVER_API_KEY injection and cause 401 spam — skip them.
  if (auth && !isOfflinePreviewBearer(auth)) {
    headers.set("authorization", auth);
    return;
  }

  if (SERVER_API_KEY) {
    headers.set("x-api-key", SERVER_API_KEY);
  }
}

/** Default read timeout — long enough for real DB/LLM-adjacent endpoints. */
const PROXY_TIMEOUT_MS = 12_000;
const LONG_PROXY_TIMEOUT_MS = 35_000;

function proxyTimeoutMs(path: string, method: string): number {
  const lower = path.toLowerCase();
  if (lower.includes("/test") || lower.endsWith("/test")) return LONG_PROXY_TIMEOUT_MS;
  if (lower.includes("campaigns/run") || lower.includes("campaigns/execute")) {
    return LONG_PROXY_TIMEOUT_MS;
  }
  if (lower.includes("playground/evaluate") || lower.includes("rag")) {
    return LONG_PROXY_TIMEOUT_MS;
  }
  if (method !== "GET" && method !== "HEAD" && lower.includes("providers")) {
    return 8_000;
  }
  return PROXY_TIMEOUT_MS;
}

function upstreamUnavailable(err: unknown, path: string, timeoutMs: number): NextResponse {
  const message = err instanceof Error ? err.message : "Backend proxy error";
  const timedOut =
    message.includes("TimeoutError") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("AbortError");

  return NextResponse.json(
    {
      success: false,
      error: {
        message: timedOut
          ? `ARTSA API timed out after ${timeoutMs}ms (${path}). Start the backend and retry.`
          : `ARTSA API unreachable (${path}). ${message}`,
        detail: timedOut
          ? `ARTSA API timed out after ${timeoutMs}ms (${path}). Start the backend and retry.`
          : `ARTSA API unreachable (${path}). ${message}`,
        code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      },
    },
    { status: timedOut ? 504 : 502 }
  );
}

async function proxy(
  request: NextRequest,
  ctx: { params: { path: string[] } | Promise<{ path: string[] }> }
) {
  const resolvedParams = await Promise.resolve(ctx?.params);
  const pathSegments = resolvedParams?.path || [];
  const path = Array.isArray(pathSegments) ? pathSegments.join("/") : String(pathSegments);
  const query = request.nextUrl.search;
  const baseUrl = (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
  const target = `${baseUrl}/${path.replace(/^\/+/, "")}${query}`;

  const headers = new Headers();
  applyUpstreamAuth(headers, request);

  const tenantId = request.headers.get("x-tenant-id");
  if (tenantId) {
    headers.set("x-tenant-id", tenantId);
  }

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const method = request.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const timeoutMs = proxyTimeoutMs(path, method);

  try {
    const res = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    const responseBody = await res.arrayBuffer();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (err) {
    return upstreamUnavailable(err, path, timeoutMs);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
