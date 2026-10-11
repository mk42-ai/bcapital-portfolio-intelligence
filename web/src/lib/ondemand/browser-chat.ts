import { PUBLIC_ONDEMAND_BASE_URL } from "./config-public";
import {
  runChatBridge,
  SSE_HEADERS,
  type AttachmentText,
  type BridgeBody,
} from "./chat-bridge";

/**
 * BROWSER transport for the chat query: the page calls api.on-demand.io directly (create session + POST /chat/v1/sessions/{id}/query, CORS-allowed)
 * and translates the OnDemand stream into the same AG-UI frames POST /api/chat produces, returned as a synthetic `Response` so the shell's
 * fetchLLM → agUIAdapter → teeStream pipeline is unchanged. Only work that needs the server stays there:
 *   attachment text → GET /api/media?id=…&text=1        artifact filing → POST /api/chat/artifact (INGEST_SECRET + media blob relay)
 * The payload audit file (proof/chat-payload-audit.json) is written only by the proxy transport.
 */
let reachable: Promise<boolean> | null = null;
/** OnDemand's CORS is an ORIGIN ALLOW-LIST, not `*` (probed 2026-10-12): any *.vercel.app, localhost:3000, localhost:5173 and app.on-demand.io pass;
 *  the *.vercel.run sandboxes, other localhost ports, 127.0.0.1 and custom domains are refused. Probe once per page (the OPTIONS request needs the
 *  same preflight as the real calls) so a refused origin falls back to POST /api/chat instead of failing the turn. */
export const browserCanReachOnDemand = (): Promise<boolean> =>
  (reachable ??= fetch(`${PUBLIC_ONDEMAND_BASE_URL}/chat/v1/sessions`, { method: "OPTIONS", headers: { apikey: "probe", "content-type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(5000) }).then(() => true, () => false));

export async function browserChat(
  body: BridgeBody,
  key: string,
  signal?: AbortSignal | null,
): Promise<Response> {
  const r = await runChatBridge(body, {
    baseUrl: PUBLIC_ONDEMAND_BASE_URL,
    key,
    transport: "browser",
    signal: signal ?? undefined,
    attachmentText: async (refs) =>
      new Map(
        await Promise.all(
          refs.map(async (a): Promise<[string, AttachmentText]> => {
            try {
              const res = await fetch(
                `/api/media?id=${encodeURIComponent(a.mediaId)}&text=1`,
                { cache: "no-store", headers: { accept: "application/json" } },
              );
              const j = (await res.json()) as {
                known?: boolean;
                name?: string | null;
                kind?: string | null;
                text?: string | null;
              };
              return [
                a.mediaId,
                j.known && j.text
                  ? {
                      name: j.name ?? a.name ?? "attachment",
                      kind: j.kind ?? a.kind ?? "document",
                      text: j.text,
                    }
                  : null,
              ];
            } catch {
              return [a.mediaId, null];
            }
          }),
        ),
      ),
    persistArtifact: async (job, ctx) => {
      const fd = new FormData();
      if (job.bytes)
        fd.set(
          "file",
          new Blob([job.bytes as BlobPart], { type: job.mime }),
          job.name,
        );
      else if (job.url) fd.set("url", job.url);
      for (const [k, v] of Object.entries({
        key: job.key,
        name: job.name,
        mime: job.mime,
        origin: job.origin,
        source: job.source,
        alias: job.alias ?? "",
        sessionId: ctx.sessionId ?? "",
        threadId: ctx.threadId,
        externalUserId: ctx.externalUserId,
      }))
        fd.set(k, v);
      const res = await fetch("/api/chat/artifact", {
        method: "POST",
        body: fd,
        headers: { "x-ondemand-key": key },
      });
      const j = (await res.json().catch(() => ({}))) as {
        message?: string;
        artifact?: unknown;
        media?: {
          status: string;
          id: string | null;
          message: string | null;
          ms: number;
        };
      };
      if (!res.ok || !j.media)
        throw new Error(j.message ?? `artifact upload HTTP ${res.status}`);
      return { artifact: j.artifact, media: j.media };
    },
  });
  if (!r.ok)
    return Response.json(
      { error: { message: r.message } },
      { status: r.status },
    );
  return new Response(r.stream, {
    status: 200,
    headers: SSE_HEADERS(r.sessionId),
  });
}
