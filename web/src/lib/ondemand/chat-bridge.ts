import {
  ENDPOINT_ID,
  ENDPOINT_LABEL,
  REASONING_MODE,
  RESPONSE_MODE,
  PLUGIN_ID,
  PLUGIN_NAME,
  PLUGIN_IDS,
  DEFAULT_EXTERNAL_USER_ID,
  CHAT_FIRST_BYTE_MS,
  CHAT_TOTAL_MS,
  CHAT_HEARTBEAT_MS,
  PLUGIN_ERROR_RE,
  PLUGIN_NAMES,
  resolvePluginIds,
} from "./config-public";
import { parseFrame, type PluginRef, type UiEvent } from "./sse-adapter";
import {
  CLIENT_EVENT as CE,
  classifyThinkingDelta,
  thinkingPhaseOf,
} from "./eventMap";
import {
  markPluginBlocked,
  markPluginInvoked,
  clearPluginBlocked,
} from "@/lib/plugin-catalogue";
import { makeTextPdf } from "@/lib/artifacts/pdf";
import { reportFileName } from "@/lib/artifacts/naming";
import { sanitizeObjective, sanitizePlan } from "./plan";

/**
 * Streaming bridge: OpenUI AgentInterface (@openuidev/react-ui `fetchLLM` + `agUIAdapter`) → OnDemand Chat API. Runtime-neutral: the BROWSER runs
 * it (lib/ondemand/browser-chat.ts — the query goes straight to api.on-demand.io) and POST /api/chat runs the same code as the proxy transport.
 * Everything that needs the server (attachment text, artifact storage, the payload audit file) comes in through `BridgeDeps`.
 *
 *   input  { threadId, messages[], context{ sessionId?, externalUserId?, systemContext?, sessionContext?, pluginIds?, attachments? } }
 *   output text/event-stream body — first frame before any upstream await, then one AG-UI frame per upstream event.
 *
 * FIXED upstream configuration (no fallback chain, no plugin substitution — ever):
 *   endpointId   = predefined-deepseek-flash   (DeepSeek Flash v4.1)
 *   reasoningMode= medium
 *   responseMode = stream
 *   pluginIds    = ["plugin-1722260873"]       (Perplexity — the only plugin, on the session AND on every query)
 *
 * Client event schema (every frame is `data: <json>\n\n`; terminal `data: [DONE]`):
 *   RUN_STARTED                                             — emitted synchronously on request receipt
 *   CUSTOM ondemand.status   {phase, elapsedMs, …}          — connecting | creating-session | querying | planning | researching | answering | done
 *   CUSTOM ondemand.session  {sessionId, created, viaHeader, endpointId, reasoningMode, pluginIds}
 *   TOOL_CALL_START/ARGS/END {toolCallName: "Perplexity", args {plugin, pluginId, query, endpointId, reasoningMode}}   — plugin start (on the planning frame)
 *   CUSTOM ondemand.thinking {kind: planning|step|fulfillment, delta}                                                  — collapsible reasoning trace
 *   CUSTOM ondemand.sources  {sources[{url,title,sourceName,imageUrl?}], pluginId, pluginName, partial}                 — plugin done + citations (incremental)
 *   TOOL_CALL_RESULT         {content: {status: ok|error, plugin, sources, message?}, isError?: true}                   — plugin done / failed
 *   TEXT_MESSAGE_START / TEXT_MESSAGE_CONTENT {delta} / TEXT_MESSAGE_END                                               — answer deltas, flushed per upstream event
 *   CUSTOM ondemand.metrics  {publicMetrics{inputTokens,outputTokens,totalTokens,ragTimeSec,fulfillmentTimeSec,totalTimeSec}}
 *   CUSTOM ondemand.error    {code, message, raw}            — typed error (HTTP error, `[ERROR]:` frame, eventType error, or the plugin-failure pattern)
 *   RUN_ERROR {message, code}  /  RUN_FINISHED               — then `data: [DONE]`
 *
 * Upstream plugin failure ("Not enough credits" / "error":"Internal server error" / "tool returned an error") is NEVER delivered by OnDemand as an
 * error frame — it only appears inside fulfillment_thinking deltas and in the answer prose. The bridge detects that pattern in every delta,
 * closes the Perplexity tool call with isError:true and streams CUSTOM ondemand.error + RUN_ERROR. It never retries with another plugin.
 */
type InMsg = { role?: string; content?: unknown };
export type BridgeBody = {
  threadId?: string;
  messages?: InMsg[];
  context?: Record<string, unknown>;
};
export type AttachmentRef = {
  mediaId: string;
  name?: string;
  kind?: string;
  extractedChars?: number;
};
export type AttachmentText = {
  name: string;
  kind: string;
  text: string;
} | null;
export type ArtifactJob = {
  key: string;
  name: string;
  mime: string;
  origin: string;
  bytes?: Uint8Array;
  url?: string;
  source: "generated" | "agent";
  alias?: string;
};
export type ArtifactCtx = {
  sessionId: string | null;
  threadId: string;
  externalUserId: string;
};
export type PersistedArtifact = {
  artifact: unknown;
  media: {
    status: string;
    id: string | null;
    message: string | null;
    ms: number;
  };
};
export type BridgeDeps = {
  /** OnDemand origin, e.g. https://api.on-demand.io */
  baseUrl: string;
  key: string;
  /** Extra upstream headers (the server adds a browser user-agent for Cloudflare; a browser cannot set one). */
  headers?: Record<string, string>;
  /** Shown on the ondemand.request frame: "browser" or "/api/chat". */
  transport: string;
  /** Aborts the turn (client disconnect / Stop). */
  signal?: AbortSignal;
  /** Extracted text of uploaded attachments, keyed by media id (missing → the turn still runs, the attachment is flagged ungrounded). */
  attachmentText: (
    refs: AttachmentRef[],
  ) => Promise<Map<string, AttachmentText>>;
  /** Store a generated / agent-produced file (backend /artifacts + OnDemand Media API). */
  persistArtifact: (
    job: ArtifactJob,
    ctx: ArtifactCtx,
  ) => Promise<PersistedArtifact>;
  /** Redacted per-turn payload audit (server only). */
  audit?: (entry: Record<string, unknown>) => void;
  /** Wait up to this long for session creation so the caller can expose the id before streaming (server header fast-path). */
  sessionHeaderWaitMs?: number;
};
export type BridgeResult =
  | { ok: true; stream: ReadableStream<Uint8Array>; sessionId: string }
  | { ok: false; status: number; message: string };

/** Planner / step / answer prompt addenda — see docs/reference/event-ui-contract.md §4. Text only; no schema, key or event changes. */
const PROMPT_ADDENDA_FULL = `<run_style>
Planner: write "objective" as one first-person sentence that starts with "I'll", at most 22 words, in plain words - no plugin names, operation ids, JSON or markdown. Start every step "user_query" with a short action-style label in square brackets (for example "[Gathering news, prices and indicators]", "[Searching the web]", "[Comparing funding momentum]") followed by the instruction unchanged.
Step executor: keep a fixed key order per plugin call, short parameters first and long text last; never copy the [label] into a parameter.
Answer: start with the result (the steps are already on screen), cite each external fact inline with a markdown link to the exact page it came from; if a call failed, answer from what did succeed without a special failure note or "Data gap" line - never claim a success that did not happen.
Portfolio sentiment: call sentiment_score the "sentiment score" and sentiment_delta_vs_prior_run the "change vs prior run (Δ)"; rank companies by sentiment score, never by the delta, and say "first run" when there is no prior run instead of inventing movement.
</run_style>

`;
const PROMPT_ADDENDA_SHORT = `<run_style>objective = one first-person "I'll..." sentence of at most 22 words, no plugin names/ids/JSON; each step user_query starts with a short [action label]; answer starts with the result, cites inline with markdown links, no special failure note or "Data gap" line when a call failed; sentiment_score = "sentiment score", sentiment_delta_vs_prior_run = "change vs prior run (Δ)", say "first run" when there is no prior run.</run_style>

`;
type Ctx = {
  sessionId?: string;
  externalUserId?: string;
  systemContext?: string;
  sessionContext?: { key: string; value: string }[];
  pluginIds?: string[];
  attachments?: AttachmentRef[];
};
/** Per-attachment grounding cap (chars of extracted text prepended to the query). */
export const ATTACHMENT_TEXT_CHARS = 12_000;
const enc = new TextEncoder();
const frame = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const DONE = enc.encode("data: [DONE]\n\n");
const textOf = (c: unknown): string =>
  typeof c === "string"
    ? c
    : Array.isArray(c)
      ? c
          .map((p) =>
            p && typeof p === "object" && "text" in p
              ? String((p as { text: unknown }).text)
              : "",
          )
          .join("")
      : "";
export const SSE_HEADERS = (sessionId: string): Record<string, string> => ({
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
  "content-encoding": "identity",
  "x-ondemand-model": ENDPOINT_ID,
  ...(sessionId ? { "x-ondemand-session": sessionId } : {}),
});
class UpstreamError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "upstream_http",
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}
type Src = {
  url: string;
  title: string;
  sourceName: string;
  imageUrl?: string;
};
const redactHeaders = (h: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(h).map(([k, v]) => [
      k,
      k.toLowerCase() === "apikey" ? "<redacted>" : v,
    ]),
  );

/** "portfolio report" / "write a report" / "make a PDF" style asks: the bridge files the finished answer as a PDF artifact. */
const REPORT_RE =
  /\b(report|memo|brief(ing)?|one[- ]pager|pdf|document|write[- ]?up|lp update)\b/i;
/** Markdown answer → PDF sections (headings `#`, bullets `-`/`*`, citations kept as text). */
function mdToSections(
  md: string,
): { heading: string; paragraphs: string[]; bullets?: string[] }[] {
  const clean = (t: string) =>
    t
      .replace(/\[(\d+|[^\]]{1,80})\]\((https?:[^)]+)\)/g, (_m, l, u) =>
        /^\d+$/.test(l) ? `[${l}]` : `${l} (${u})`,
      )
      .replace(/[*_`]+/g, "")
      .trim();
  const out: { heading: string; paragraphs: string[]; bullets?: string[] }[] =
    [];
  let cur = {
    heading: "Summary",
    paragraphs: [] as string[],
    bullets: [] as string[],
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^\|?\s*-{3,}/.test(line)) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) {
      if (cur.paragraphs.length || cur.bullets.length) out.push(cur);
      cur = { heading: clean(h[1]).slice(0, 120), paragraphs: [], bullets: [] };
      continue;
    }
    const b = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (b) {
      cur.bullets.push(clean(b[1]));
      continue;
    }
    cur.paragraphs.push(
      clean(
        line
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .replace(/\s*\|\s*/g, " · "),
      ),
    );
  }
  if (cur.paragraphs.length || cur.bullets.length) out.push(cur);
  return out.length
    ? out
    : [{ heading: "Summary", paragraphs: [md.slice(0, 4000)] }];
}

export async function runChatBridge(
  body: BridgeBody,
  deps: BridgeDeps,
): Promise<BridgeResult> {
  const t0 = Date.now();
  const { key, baseUrl } = deps;
  const ctx = (body.context ?? {}) as Ctx;
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...msgs].reverse().find((m) => m?.role === "user");
  const query = textOf(lastUser?.content).trim();
  if (!query) return { ok: false, status: 400, message: "no user message" };
  // Attachments (chat uploads): the browser sends context.attachments[{mediaId,…}] after POST /api/media; the extracted text lives server-side
  // (globalThis media store, 2 h TTL) and is prepended to the query — the documented Submit Query body has no media field (docs/ONDEMAND_CONTRACTS.md).
  const attachmentsIn = Array.isArray(ctx.attachments)
    ? ctx.attachments
        .filter(
          (a) =>
            a &&
            typeof a.mediaId === "string" &&
            /^[A-Za-z0-9_-]{6,64}$/.test(a.mediaId),
        )
        .slice(0, 6)
    : [];
  const attachmentsP = (
    attachmentsIn.length
      ? deps.attachmentText(attachmentsIn)
      : Promise.resolve(new Map<string, AttachmentText>())
  ).catch(() => new Map<string, AttachmentText>());
  // Explicit plugin list: pinned Perplexity + exactly the ids the user toggled on (catalogue allow-list). Nothing is ever substituted.
  const { pluginIds, dropped: droppedPluginIds } = resolvePluginIds(
    ctx.pluginIds ?? PLUGIN_IDS,
    query,
  );
  const externalUserId =
    typeof ctx.externalUserId === "string" && ctx.externalUserId
      ? ctx.externalUserId.slice(0, 64)
      : DEFAULT_EXTERNAL_USER_ID;
  const H: Record<string, string> = {
    apikey: key,
    "content-type": "application/json",
    ...(deps.headers ?? {}),
  };
  const runId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const threadId = body.threadId ?? crypto.randomUUID();
  const isFirstTurn = msgs.filter((m) => m?.role === "user").length <= 1;
  // Prompt addenda (OnDemand-Run-UX-Before-After, rollout step 2 - text only, same JSON): planner objective = ONE first-person sentence
  // starting "I'll", <= 22 words, no plugin names / operation ids / JSON; every step user_query starts with a short action-style [label];
  // step executor keeps a fixed key order and never copies the [label] into a parameter; the answer starts with the result, cites every
  // external fact with a markdown link and adds no special failure note when a call failed. Sent in full on the first turn and as
  // a one-line reminder afterwards, prepended to the query because submit-query v1 exposes no separate planner/step/answer prompt slots.
  const addenda = isFirstTurn ? PROMPT_ADDENDA_FULL : PROMPT_ADDENDA_SHORT;
  const audit: Record<string, unknown> = {
    at: new Date(t0).toISOString(),
    transport: deps.transport,
    threadId,
    runId,
    endpointId: ENDPOINT_ID,
    endpointLabel: ENDPOINT_LABEL,
    reasoningMode: REASONING_MODE,
    responseMode: RESPONSE_MODE,
    pluginIds,
    requestedPluginIds: ctx.pluginIds ?? null,
    droppedPluginIds,
  };
  const rawFirst: { ms: number; raw: string }[] = [];
  let rawCount = 0;

  // One AbortController fans in: client disconnect / Stop (deps.signal) + our own deadlines.
  const ac = new AbortController();
  let abortReason = "";
  const abort = (reason: string) => {
    if (!ac.signal.aborted) {
      abortReason = reason;
      ac.abort();
    }
  };
  if (deps.signal?.aborted) abort("client");
  deps.signal?.addEventListener("abort", () => abort("client"), { once: true });
  const totalTimer = setTimeout(() => abort("deadline-total"), CHAT_TOTAL_MS);
  const timeoutMessage = (phase: string) =>
    `OnDemand did not answer within ${Math.round((Date.now() - t0) / 1000)} s (${phase}) — try again`;

  // 1. session — reuse the one the client remembered for this thread; create only when absent.
  let sessionId =
    typeof ctx.sessionId === "string" && /^[A-Za-z0-9]+$/.test(ctx.sessionId)
      ? ctx.sessionId
      : "";
  let sessionPromise: Promise<string> | null = null;
  let sessionCreated = false;
  if (!sessionId && key) {
    const sc = Array.isArray(ctx.sessionContext)
      ? ctx.sessionContext
          .slice(0, 8)
          .map((c) => ({
            key: String(c.key).slice(0, 64),
            value: String(c.value).slice(0, 2000),
          }))
      : [];
    const createBody = {
      externalUserId,
      pluginIds,
      ...(sc.length ? { contextMetadata: sc } : {}),
    };
    audit.sessionCreate = {
      url: `${baseUrl}/chat/v1/sessions`,
      headers: redactHeaders(H),
      body: {
        ...createBody,
        contextMetadata: sc.map((c) => ({
          key: c.key,
          valueChars: c.value.length,
        })),
      },
    };
    sessionPromise = (async () => {
      const r = await fetch(`${baseUrl}/chat/v1/sessions`, {
        method: "POST",
        headers: H,
        body: JSON.stringify(createBody),
        signal: ac.signal,
        cache: "no-store",
      });
      const j = (await r.json().catch(() => ({}))) as {
        message?: string;
        data?: { id?: string };
      };
      (audit.sessionCreate as Record<string, unknown>).response = {
        status: r.status,
        id: j?.data?.id ?? null,
        message: j?.message ?? null,
        elapsedMs: Date.now() - t0,
      };
      if (!r.ok || !j?.data?.id)
        throw new UpstreamError(
          `OnDemand create session failed (HTTP ${r.status}): ${j?.message ?? "no session id"}`,
          r.status === 401 || r.status === 403 ? 401 : 502,
          "session_create",
        );
      sessionCreated = true;
      return j.data.id;
    })();
    sessionPromise.catch(() => {}); // handled inside the stream
    if (deps.sessionHeaderWaitMs && deps.sessionHeaderWaitMs > 0) {
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      const raced = await Promise.race([
        sessionPromise.then(
          (id) => id,
          () => "",
        ),
        new Promise<string>((res) => {
          raceTimer = setTimeout(() => res(""), deps.sessionHeaderWaitMs);
        }),
      ]);
      clearTimeout(raceTimer);
      if (raced) {
        sessionId = raced;
        sessionPromise = null;
      }
    }
  }
  const sessionFromHeaderPath = Boolean(sessionId);

  const dec = new TextDecoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let seq = 0;
      // Every frame carries a monotonically increasing `seq` (+ runId): the client tee drops any duplicate and the recorder can prove no frame
      // was dropped (gap check) — idempotent frame ids per the step-5 integrity requirement.
      const send = (o: unknown) => {
        if (!closed) {
          try {
            controller.enqueue(
              frame(
                o && typeof o === "object"
                  ? { seq: ++seq, ...(o as Record<string, unknown>) }
                  : o,
              ),
            );
          } catch {
            closed = true;
          }
        }
      };
      const finish = () => {
        if (!closed) {
          try {
            controller.enqueue(DONE);
            controller.close();
          } catch {
            /* already closed */
          }
          closed = true;
        }
      };
      let gotFirstByte = false,
        lastSentAt = Date.now();
      let firstByteTimer: ReturnType<typeof setTimeout> | undefined;
      const heartbeat = setInterval(() => {
        if (closed) return;
        send({
          type: "CUSTOM",
          name: CE.heartbeat,
          value: {
            t: new Date().toISOString(),
            elapsedMs: Date.now() - t0,
            sinceLastFrameMs: Date.now() - lastSentAt,
          },
        });
      }, CHAT_HEARTBEAT_MS);
      // Stall watchdog: when no visible frame has gone out for >600 ms the shell shows the animated "Working…" band (ondemand.filler on), and the
      // band is withdrawn on the next real frame — so dead air never exceeds 800 ms without a visible change, whatever upstream is doing.
      let fillerOn = false;
      let stallTicks = 0;
      const stall = setInterval(() => {
        if (closed) return;
        const quiet = Date.now() - lastSentAt;
        if (!fillerOn && quiet > 600) {
          fillerOn = true;
          send({
            type: "CUSTOM",
            name: CE.filler,
            value: {
              on: true,
              derived: true,
              quietMs: quiet,
              elapsedMs: Date.now() - t0,
            },
          });
        } else if (fillerOn && quiet > 600) {
          stallTicks += 1;
          send({
            type: "CUSTOM",
            name: CE.filler,
            value: {
              on: true,
              derived: true,
              tick: stallTicks,
              quietMs: quiet,
              elapsedMs: Date.now() - t0,
            },
          });
        }
      }, 300);
      const cleanup = () => {
        clearInterval(heartbeat);
        clearInterval(stall);
        clearTimeout(firstByteTimer);
        clearTimeout(totalTimer);
      };
      const status = (phase: string, extra: Record<string, unknown> = {}) => {
        send({
          type: "CUSTOM",
          name: CE.status,
          value: { phase, elapsedMs: Date.now() - t0, ...extra },
        });
        lastSentAt = Date.now();
      };

      // Immediate frames — flushed before any upstream await (first visible event well under 400 ms).
      send({ type: "RUN_STARTED", threadId, runId });
      status("connecting", {
        endpointId: ENDPOINT_ID,
        endpointLabel: ENDPOINT_LABEL,
        reasoningMode: REASONING_MODE,
        pluginIds,
        pluginNames: pluginIds.map((id) => PLUGIN_NAMES[id] ?? id),
        droppedPluginIds,
        sessionKnown: sessionFromHeaderPath,
        transport: deps.transport,
      });

      let text = "",
        textStarted = false,
        buf = "";
      let firstTokenAt = 0;
      let firstFrameAt = 0;
      let firstToolAt = 0;
      let lastToolDoneAt = 0;
      let stepCounter = 0;
      let currentStepId = "";
      let summaryIndex = 0;
      const realSources = new Map<string, Src>();
      const pluginErr: { current: { message: string; raw: string } | null } = {
        current: null,
      };
      const startText = () => {
        if (!textStarted) {
          textStarted = true;
          send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
        }
      };
      const fillerOff = () => {
        if (fillerOn) {
          fillerOn = false;
          stallTicks = 0;
          send({
            type: "CUSTOM",
            name: CE.filler,
            value: { on: false, derived: true, elapsedMs: Date.now() - t0 },
          });
        }
      };
      const custom = (name: string, value: Record<string, unknown>) => {
        if (name !== CE.filler && name !== CE.heartbeat) fillerOff();
        send({
          type: "CUSTOM",
          name,
          value: { elapsedMs: Date.now() - t0, ...value },
        });
        lastSentAt = Date.now();
      };
      // a3 — SINGLE SOURCE OF TRUTH for "Working…": stall / bridge / "Summarising step N" states are carried ONLY by ondemand.filler frames
      // (consumed by the anchored RunStatusHeader via filler/fillerTick). They are NEVER emitted as an ondemand.status statusMessage, so no
      // consumer can turn them into an interleaved "Working…" step row between the Working rows and the Outputs/answer.
      const WORKING_RE = /^(working\b|summari[sz]ing step\b)/i;
      const fillerBridge = (
        reason: string,
        extra: Record<string, unknown> = {},
      ) => {
        fillerOn = true;
        send({
          type: "CUSTOM",
          name: CE.filler,
          value: {
            on: true,
            derived: true,
            bridge: true,
            reason,
            tick: stallTicks,
            elapsedMs: Date.now() - t0,
            ...extra,
          },
        });
        lastSentAt = Date.now();
      };
      const isWorkingText = (m: unknown): m is string =>
        typeof m === "string" && WORKING_RE.test(m.trim());
      // ---- artifacts: agent file_written / artifact_ready frames + the report PDF are persisted (backend /artifacts + OnDemand Media API)
      const artifactJobs: Promise<void>[] = [];
      const seenArtifactKeys = new Set<string>();
      const persistArtifact = (job: ArtifactJob) => {
        if (seenArtifactKeys.has(job.key)) return;
        seenArtifactKeys.add(job.key);
        custom(CE.artifact, {
          phase: "creating",
          key: job.key,
          name: job.name,
          mime: job.mime,
          origin: job.origin,
          alias: job.alias,
        });
        artifactJobs.push(
          (async () => {
            try {
              const { artifact, media } = await deps.persistArtifact(job, {
                sessionId: sessionId || null,
                threadId,
                externalUserId,
              });
              custom(CE.artifact, {
                phase: "ready",
                key: job.key,
                name: job.name,
                alias: job.alias,
                artifact,
                media,
              });
            } catch (e) {
              custom(CE.artifact, {
                phase: "failed",
                key: job.key,
                name: job.name,
                message: String((e as Error)?.message ?? e).slice(0, 300),
              });
            }
          })(),
        );
      };
      const fromAgentEvent = (
        subtype: string,
        d: Record<string, unknown> | null | undefined,
      ) => {
        if (!d) return;
        const str = (...k: string[]) => {
          for (const x of k) {
            const v = d[x];
            if (typeof v === "string" && v) return v;
          }
          return "";
        };
        const url = str(
          "url",
          "fileUrl",
          "downloadUrl",
          "signedUrl",
          "publicUrl",
          "artifactUrl",
        );
        const path = str("path", "filePath", "file_path");
        const name = (
          str("name", "fileName", "filename", "title") ||
          path.split("/").pop() ||
          url.split("?")[0].split("/").pop() ||
          "artifact"
        ).slice(0, 180);
        const mime =
          str("mime", "mimeType", "contentType", "content_type") ||
          (/\.pdf$/i.test(name)
            ? "application/pdf"
            : /\.docx$/i.test(name)
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : /\.(png)$/i.test(name)
                ? "image/png"
                : /\.jpe?g$/i.test(name)
                  ? "image/jpeg"
                  : /\.mp4$/i.test(name)
                    ? "video/mp4"
                    : /\.md$/i.test(name)
                      ? "text/markdown"
                      : "application/octet-stream");
        const content = typeof d.content === "string" ? d.content : "";
        if (url && /^https?:\/\//.test(url))
          persistArtifact({
            key: `${subtype}:${url}`,
            name,
            mime,
            url,
            origin: `ondemand_agent.${subtype}`,
            source: "agent",
          });
        else if (content)
          persistArtifact({
            key: `${subtype}:${name}:${content.length}`,
            name,
            mime: mime === "application/octet-stream" ? "text/plain" : mime,
            bytes: new TextEncoder().encode(content),
            origin: `ondemand_agent.${subtype}`,
            source: "agent",
          });
        else
          custom(CE.artifact, {
            phase: "failed",
            key: `${subtype}:${name}`,
            name,
            message: `ondemand_agent.${subtype} carried no url or content (path ${path || "n/a"}) — nothing to store`,
          });
      };
      const wantsReport = REPORT_RE.test(query);
      // ---- tool cards: one per plugin id (pinned Perplexity opens on the first planning frame; others open when the plan/agents name them)
      type Tool = {
        id: string;
        name: string;
        open: boolean;
        stepId?: string;
        startedAt: number;
      };
      const tools = new Map<string, Tool>();
      const pluginName = (id: string) => PLUGIN_NAMES[id] ?? id;
      const toolStart = (
        pid: string,
        name?: string,
        stepId?: string,
        input?: string,
      ) => {
        if (tools.has(pid)) return;
        const id = crypto.randomUUID();
        tools.set(pid, {
          id,
          name: name || pluginName(pid),
          open: true,
          stepId,
          startedAt: Date.now(),
        });
        if (!firstToolAt) firstToolAt = Date.now();
        markPluginInvoked(pid); // plugin-state `invoked` (plugin-catalogue.ts) — a tool card is open for this id in the current run
        const args = {
          plugin: name || pluginName(pid),
          pluginId: pid,
          query: (input || query).slice(0, 300),
          stepId: stepId ?? currentStepId ?? "",
          endpointId: ENDPOINT_ID,
          endpointLabel: ENDPOINT_LABEL,
          reasoningMode: REASONING_MODE,
        };
        send({
          type: "TOOL_CALL_START",
          toolCallId: id,
          toolCallName: name || pluginName(pid),
          parentMessageId: messageId,
        });
        send({
          type: "TOOL_CALL_ARGS",
          toolCallId: id,
          delta: JSON.stringify(args),
        });
        send({ type: "TOOL_CALL_END", toolCallId: id });
        status("researching", {
          plugin: name || pluginName(pid),
          pluginId: pid,
          stepId: stepId ?? currentStepId,
        });
        lastSentAt = Date.now();
      };
      const toolDone = (
        pid: string,
        st: "ok" | "error",
        extra: Record<string, unknown> = {},
      ) => {
        if (!tools.has(pid)) toolStart(pid);
        const t = tools.get(pid)!;
        if (!t.open) return;
        t.open = false;
        lastToolDoneAt = Date.now();
        const content = JSON.stringify({
          status: st,
          plugin: t.name,
          pluginId: pid,
          durationMs: Date.now() - t.startedAt,
          sources: realSources.size,
          ...extra,
        });
        send({
          type: "TOOL_CALL_RESULT",
          messageId: crypto.randomUUID(),
          toolCallId: t.id,
          role: "tool",
          content,
          ...(st === "error"
            ? { isError: true, error: String(extra.message ?? "plugin failed") }
            : {}),
        });
        lastSentAt = Date.now();
      };
      /** unit2 — tools vs answer time on `ondemand.metrics` / done: toolsMs = first tool start → last tool result; answerMs = first token → now. */
      const timingFields = () => ({
        firstTokenMs: firstTokenAt ? firstTokenAt - t0 : null,
        toolsMs:
          firstToolAt && lastToolDoneAt
            ? Math.max(0, lastToolDoneAt - firstToolAt)
            : null,
        answerMs: firstTokenAt ? Math.max(0, Date.now() - firstTokenAt) : null,
      });
      const allToolsDone = (
        st: "ok" | "error",
        extra: Record<string, unknown> = {},
      ) => {
        for (const pid of tools.keys()) toolDone(pid, st, extra);
      };
      const refsToIds = (refs: PluginRef[]) =>
        refs.map((r) =>
          /^plugin-\d+$/.test(r.id)
            ? r.id
            : (pluginIds.find(
                (id) => pluginName(id).toLowerCase() === r.name.toLowerCase(),
              ) ?? r.id),
        );
      const emitSources = (partial: boolean, pid?: string) =>
        custom(CE.sources, {
          messageId,
          pluginId: pid ?? PLUGIN_ID,
          pluginName: pluginName(pid ?? PLUGIN_ID),
          partial,
          sources: [...realSources.values()].slice(0, 25),
        });
      const typedError = (code: string, message: string, raw: string) =>
        custom(CE.error, { code, message, raw: raw.slice(0, 2000) });
      const detectPluginError = (haystack: string, raw: string) => {
        if (pluginErr.current) return;
        const m = PLUGIN_ERROR_RE.exec(haystack);
        if (!m) return;
        const hit = m[0].replace(/\s+/g, " ").trim();
        const credits = /credits/i.test(hit);
        const others = pluginIds
          .filter((id) => id !== PLUGIN_ID)
          .map((id) => pluginName(id));
        pluginErr.current = {
          message: `${PLUGIN_NAME} returned an upstream error: "${credits ? "Internal server error — Not enough credits" : hit}"${credits ? " (the OnDemand account's Perplexity credits are exhausted)" : ""}. No other plugin was substituted${others.length ? `; ${others.join(", ")} ${others.length === 1 ? "was" : "were"} also attached to this turn and any text below comes from ${others.length === 1 ? "it" : "them"} or the model's own knowledge` : ""}.`,
          raw,
        };
        typedError("plugin_error", pluginErr.current.message, raw);
        markPluginBlocked(PLUGIN_ID, pluginErr.current.message); // plugin-state `blocked` until a later run clears it (plugin-catalogue.ts)
        toolDone(PLUGIN_ID, "error", {
          message: pluginErr.current.message,
          raw: raw.slice(0, 1200),
        });
      };
      const classAcc = new Map<string, string>(); // unit1: per-channel window for classifyThinkingDelta
      let thinkingBuf = "";
      let planBuf = "";
      let planEmitted = false;
      let objectiveSent = false;
      let stepBuf = "";
      const stepEmittedFor = new Set<number>();
      let planStepTotal = 0;
      let earlyPlanSteps = 0;
      const derivedSummary = new Map<
        number,
        { title: string; hosts: string[]; n: number; closed: boolean }
      >();
      const tryParseJson = (t: string): unknown => {
        const i = t.indexOf("{");
        if (i < 0) return null;
        let depth = 0,
          inStr = false,
          esc = false;
        for (let k = i; k < t.length; k++) {
          const c = t[k];
          if (inStr) {
            if (esc) esc = false;
            else if (c === "\\") esc = true;
            else if (c === '"') inStr = false;
            continue;
          }
          if (c === '"') inStr = true;
          else if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) {
              try {
                return JSON.parse(t.slice(i, k + 1));
              } catch {
                return null;
              }
            }
          }
        }
        return null;
      };
      // a6: the plan frame carries ONLY { objective, steps:[{id,title,query?,plugins?}] } — sanitizePlan() strips JSON-looking objectives to "" and
      // rewrites operationId titles (listPortfolioCompanies → "List portfolio companies"); the raw planner text stays in ondemand.planner_payload.
      const planFromJson = (
        j: unknown,
      ): {
        objective: string;
        steps: {
          id: string;
          title: string;
          query?: string;
          plugins?: string[];
        }[];
      } => sanitizePlan(j);

      /** Translate one typed UI event into AG-UI frames. Returns true on the terminal [DONE]. */
      const dispatch = (u: UiEvent, raw: string): boolean => {
        switch (u.kind) {
          case "done":
            return true;
          case "heartbeat":
            return false;
          case "error":
            throw new UpstreamError(
              `OnDemand error frame: ${u.message}`,
              502,
              u.code,
            );
          case "metrics":
            custom(CE.metrics, {
              publicMetrics: u.publicMetrics,
              ...timingFields(),
              pluginIds,
            });
            return false;
          case "plugins_suggested":
            custom(CE.plugins, { phase: u.phase, plugins: u.plugins });
            if (u.phase === "initialized")
              status("planning", {
                statusType: "plugin_suggestion.initialized",
                statusMessage: "Finding plugins",
              });
            return false;
          case "plan": {
            const plan = sanitizePlan({
              objective: u.objective ?? "",
              steps: u.steps,
            });
            planStepTotal = Math.max(planStepTotal, plan.steps.length);
            custom(CE.plan, { objective: plan.objective, steps: plan.steps });
            status("planning", {
              statusType: "plan_created",
              statusMessage: plan.objective || "Execution plan created",
              steps: plan.steps.length,
            });
            return false;
          }
          case "step_start": {
            stepCounter += 1;
            currentStepId = u.stepId || String(stepCounter);
            custom(CE.step, {
              phase: "start",
              stepId: currentStepId,
              index: stepCounter,
              label: u.label,
              query: u.query ?? null,
            });
            // Optimistic checkpoint card for every step after the first (filled by summarize_history.completed when the agent emits it).
            if (stepCounter > 1) {
              summaryIndex = stepCounter - 1;
              custom(CE.summary, {
                phase: "start",
                index: summaryIndex,
                stepId: currentStepId,
                optimistic: true,
              });
            }
            return false;
          }
          case "agents_retrieved":
            for (const pid of refsToIds(u.plugins))
              toolStart(
                pid,
                u.plugins.find((p) => p.id === pid)?.name,
                u.stepId,
              );
            custom(CE.agents, {
              phase: "retrieved",
              stepId: u.stepId ?? currentStepId,
              plugins: u.plugins,
            });
            return false;
          case "executing":
            for (const pid of refsToIds(u.plugins))
              toolStart(
                pid,
                u.plugins.find((p) => p.id === pid)?.name,
                u.stepId,
              );
            custom(CE.agents, {
              phase: "executing",
              stepId: u.stepId ?? currentStepId,
              plugins: u.plugins,
            });
            status("researching", {
              statusType: "executing",
              stepId: u.stepId ?? currentStepId,
              plugins: u.plugins.length,
            });
            return false;
          case "execution_done": {
            const ids = refsToIds(u.plugins);
            const targets = ids.length
              ? ids
              : [...tools.keys()].filter((k) => tools.get(k)!.open);
            for (const pid of targets) {
              if (u.ok)
                toolDone(pid, "ok", { message: u.message || undefined });
              else {
                typedError(
                  "execution_failed",
                  `${pluginName(pid)}: ${u.message || "execution failed"}`,
                  raw,
                );
                toolDone(pid, "error", {
                  message: u.message || "execution failed",
                  raw: raw.slice(0, 1200),
                });
              }
            }
            custom(CE.step, {
              phase: u.ok ? "done" : "failed",
              stepId: u.stepId ?? currentStepId,
              index: stepCounter,
              message: u.message,
            });
            return false;
          }
          case "summary_start":
            summaryIndex = u.index || summaryIndex || stepCounter;
            custom(CE.summary, {
              phase: "start",
              index: summaryIndex,
              stepId: u.stepId ?? currentStepId,
              optimistic: false,
            });
            return false;
          case "summary_done":
            custom(CE.summary, {
              phase: "done",
              index: u.index || summaryIndex || stepCounter,
              stepId: u.stepId ?? currentStepId,
              text: u.text,
              at: new Date().toISOString(),
            });
            return false;
          case "thinking": {
            if (
              u.channel === "planning" ||
              u.channel === "plan" ||
              u.channel === "step" ||
              u.channel === "step_output"
            )
              toolStart(PLUGIN_ID, PLUGIN_NAME, u.stepId);
            if (
              (u.channel === "step" ||
                u.channel === "step_output" ||
                u.channel === "fulfillment") &&
              derivedSummary.size
            ) {
              const cur =
                u.channel === "fulfillment"
                  ? Number.MAX_SAFE_INTEGER
                  : Number(u.stepId) || 0;
              for (const [idx, d] of derivedSummary)
                if (!d.closed && cur > idx) {
                  d.closed = true;
                  custom(CE.summary, {
                    phase: "done",
                    index: idx,
                    stepId: String(idx),
                    derived: true,
                    text: `${d.title} — ${d.n} source${d.n === 1 ? "" : "s"}${d.hosts.length ? ` from ${d.hosts.join(", ")}` : ""}.`,
                    at: new Date().toISOString(),
                  });
                }
            }
            if (u.delta) {
              thinkingBuf = (thinkingBuf + u.delta).slice(-800);
              detectPluginError(thinkingBuf, raw);
              // unit1: planner / tool-definition JSON never reaches the Thinking block. planning_output + step_output are payload by definition;
              // a *_thinking delta is classified (classifyThinkingDelta, eventMap.ts) so fenced JSON / "pluginId" spans go to the Outputs disclosure too.
              const sid = u.stepId ?? currentStepId;
              const acc = (classAcc.get(u.channel) ?? "") + u.delta;
              classAcc.set(u.channel, acc.slice(-6000));
              if (classifyThinkingDelta(u.channel, acc, u.delta) === "payload")
                custom(CE.plannerPayload, {
                  phase: thinkingPhaseOf(u.channel),
                  stepId: sid,
                  delta: u.delta,
                  kind: u.channel,
                });
              else
                custom(CE.thinking, {
                  kind: u.channel,
                  delta: u.delta,
                  stepId: sid,
                });
            }
            // This account's stream carries the plan only as planning_output JSON text (no statusLog plan_created frame): read it while it streams
            // (UX doc "Read while it streams: the objective becomes the opening sentence") and emit ondemand.plan once it parses.
            if (u.channel === "plan" && u.delta && !planEmitted) {
              planBuf += u.delta;
              const parsed = tryParseJson(planBuf);
              if (parsed) {
                const plan = planFromJson(parsed);
                if (plan.objective || plan.steps.length) {
                  planEmitted = true;
                  planStepTotal = Math.max(planStepTotal, plan.steps.length);
                  custom(CE.plan, {
                    objective: plan.objective,
                    steps: plan.steps,
                    source: "planning_output",
                  });
                  status("planning", {
                    statusType: "plan_created",
                    statusMessage: plan.objective || "Execution plan created",
                    steps: plan.steps.length,
                  });
                }
              } else {
                const m = /"objective"\s*:\s*"((?:[^"\\]|\\.){12,})/.exec(
                  planBuf,
                );
                const earlyObjective = m
                  ? sanitizeObjective(m[1].replace(/\\"/g, '"'))
                  : "";
                if (earlyObjective && !objectiveSent) {
                  objectiveSent = true;
                  status("planning", {
                    statusType: "planning",
                    statusMessage: earlyObjective.slice(0, 200),
                  });
                }
                // Early plan: the first complete step title is enough to paint the Plan card (state "provisional"); the full plan replaces it when the JSON closes.
                const titles = [
                  ...planBuf.matchAll(
                    /"title"\s*:\s*"((?:[^"\\]|\\.){4,160})"/g,
                  ),
                ]
                  .map((x) => x[1].replace(/\\"/g, '"'))
                  .slice(1); // index 0 is the plan title itself
                if (titles.length > earlyPlanSteps) {
                  earlyPlanSteps = titles.length;
                  const early = sanitizePlan({
                    objective: earlyObjective,
                    steps: titles.map((t, i) => ({
                      id: String(i + 1),
                      title: t,
                    })),
                  });
                  custom(CE.plan, {
                    objective: early.objective,
                    steps: early.steps,
                    provisional: true,
                    source: "planning_output:early",
                  });
                }
              }
            }
            if (u.channel === "step_output" && u.delta) {
              stepBuf += u.delta;
              const parsed = tryParseJson(stepBuf);
              if (parsed && !stepEmittedFor.has(stepBuf.length)) {
                stepEmittedFor.add(stepBuf.length);
                const r = parsed as {
                  title?: string;
                  plugins?: {
                    pluginId?: string;
                    name?: string;
                    operationId?: string;
                    identifier?: string;
                    api_request_parameters?: Record<string, unknown>;
                  }[];
                };
                stepCounter += 1;
                currentStepId = u.stepId || String(stepCounter);
                custom(CE.step, {
                  phase: "start",
                  stepId: currentStepId,
                  index: stepCounter,
                  label: String(r.title ?? `Step ${stepCounter}`).slice(0, 120),
                  query: null,
                  source: "step_output",
                });
                custom(CE.stepOutput, {
                  stepId: currentStepId,
                  title: String(r.title ?? `Step ${stepCounter}`).slice(0, 160),
                  plugins: (r.plugins ?? []).map((pl) => ({
                    pluginId: String(pl.pluginId ?? ""),
                    name: pl.name
                      ? String(pl.name)
                      : pluginName(String(pl.pluginId ?? "")),
                    operationId: pl.operationId
                      ? String(pl.operationId).slice(0, 80)
                      : pl.name &&
                          /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(pl.name))
                        ? String(pl.name)
                        : null,
                    params: pl.api_request_parameters ?? null,
                  })),
                  raw: stepBuf.slice(0, 2000),
                });
                for (const pl of r.plugins ?? []) {
                  const pid = String(pl.pluginId ?? "");
                  const input = pl.api_request_parameters
                    ? String(Object.values(pl.api_request_parameters)[0] ?? "")
                    : "";
                  if (pluginIds.includes(pid))
                    toolStart(
                      pid,
                      pl.name ? pluginName(pid) : undefined,
                      currentStepId,
                      input || undefined,
                    );
                }
                stepBuf = "";
              }
            }
            if (u.channel === "step_output" && u.delta) {
              // The step JSON names the plugins it will call: open a card per named plugin as soon as its id appears.
              for (const m of thinkingBuf.matchAll(
                /"pluginId"\s*:\s*"(plugin-\d+)"/g,
              ))
                if (pluginIds.includes(m[1]))
                  toolStart(m[1], undefined, u.stepId);
            }
            return false;
          }
          case "sources": {
            for (const c of u.items)
              if (!realSources.has(c.url)) realSources.set(c.url, c);
            const pid =
              u.pluginId && pluginIds.includes(u.pluginId)
                ? u.pluginId
                : PLUGIN_ID;
            emitSources(true, pid);
            toolDone(pid, "ok", { items: u.items.length });
            // STEP_BOUNDARY (eventMap.ts): plugin_sources is the last frame of its step. When the plan has a further step, open the DERIVED
            // "Summarising step N" checkpoint now; it is closed (with the step title + source hosts) by the next step's first frame.
            const sIdx = Number(u.stepId) || stepCounter || 1;
            const hosts = [...new Set(u.items.map((c) => c.sourceName))].slice(
              0,
              4,
            );
            const moreSteps = planStepTotal > sIdx;
            if (moreSteps && !derivedSummary.has(sIdx)) {
              derivedSummary.set(sIdx, {
                title: u.stepTitle ?? `Step ${sIdx}`,
                hosts,
                n: u.items.length,
                closed: false,
              });
              custom(CE.summary, {
                phase: "start",
                index: sIdx,
                stepId: String(sIdx),
                derived: true,
                source: "plugin_sources",
                stepTitle: u.stepTitle ?? null,
              });
              custom(CE.step, {
                phase: "done",
                stepId: String(sIdx),
                index: sIdx,
                message: `${u.items.length} sources`,
                derived: true,
              });
              // a3: the checkpoint is a filler (header) state, not a status row — see fillerBridge.
              fillerBridge("summarising", {
                stepId: String(sIdx),
                stepIndex: sIdx,
                stepTitle: u.stepTitle ?? null,
              });
            } else {
              status("answering", { sources: realSources.size });
            }
            return false;
          }
          case "answer": {
            if (!firstTokenAt && u.delta) {
              firstTokenAt = Date.now();
              // a13 finding: tool rows stayed "running" while the answer streamed because results were only emitted at stream close.
              // The first fulfillment token means every plugin step has returned — close the open tool calls NOW (Perplexity with no
              // real sources closes as an honest error, everything else as ok) so each Working row flips to its done/failed state.
              for (const [pid, t] of tools)
                if (t.open)
                  toolDone(
                    pid,
                    realSources.size || pid !== PLUGIN_ID ? "ok" : "error",
                    realSources.size || pid !== PLUGIN_ID
                      ? {}
                      : {
                          message:
                            "Perplexity returned no sources for this question",
                        },
                  );
            }
            fillerOff();
            startText();
            text += u.delta;
            send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: u.delta });
            lastSentAt = Date.now();
            detectPluginError(text.slice(-600), raw);
            return false;
          }
          case "answer_complete":
            custom(CE.answerComplete, { chars: u.text.length });
            return false;
          case "clarification":
            custom(CE.clarification, {
              messageId: u.messageId ?? null,
              queries: u.queries,
            });
            status("awaiting-input", { statusType: "clarification_request" });
            return false;
          case "require_creds":
            custom(CE.requireCreds, {
              pluginId: u.pluginId ?? null,
              service: u.service ?? null,
              fields: u.fields,
              agent: u.agent ?? null,
            });
            status("awaiting-input", { statusType: "require_creds" });
            return false;
          case "awaiting_input":
            custom(CE.awaitingInput, {
              prompt: u.prompt,
              options: u.options ?? [],
              agent: u.agent ?? null,
            });
            status("awaiting-input", { statusType: "awaiting_input" });
            return false;
          case "awaiting_browser_action":
            custom(CE.awaitingBrowserAction, {
              action: u.action ?? null,
              message: u.message ?? null,
              url: u.url ?? null,
              agent: u.agent ?? null,
            });
            status("awaiting-input", { statusType: "awaiting_browser_action" });
            return false;
          case "filler":
            custom(CE.filler, { on: u.on });
            return false;
          case "agent":
            custom(CE.agent, {
              subtype: u.subtype,
              agent: u.agent ?? null,
              data: u.data ?? null,
            });
            if (u.subtype === "file_written" || u.subtype === "artifact_ready")
              fromAgentEvent(u.subtype, u.data);
            return false;
          case "status":
            if (isWorkingText(u.message)) {
              fillerBridge("upstream_status", {
                statusType: u.statusType,
                stepQuery: u.stepQuery ?? null,
              });
              return false;
            }
            status(u.statusType === "fulfilling" ? "answering" : "planning", {
              statusType: u.statusType,
              statusMessage: u.message,
              stepQuery: u.stepQuery ?? null,
            });
            return false;
          case "unknown":
            custom(CE.unknown, { eventType: u.eventType });
            return false;
        }
      };
      const handle = (ev: string, data: string): boolean =>
        dispatch(parseFrame(ev, data), data);

      try {
        // Resolve the session inside the stream when the header fast-path did not win the race.
        if (!key)
          throw new UpstreamError(
            "No OnDemand key configured: set NEXT_PUBLIC_ONDEMAND_API_KEY (browser) / ONDEMAND_API_KEY (server), or paste a key in Settings.",
            503,
            "no_key",
          );
        if (!sessionId) {
          status("creating-session");
          if (!sessionPromise)
            throw new UpstreamError(
              "session could not be created",
              502,
              "session_create",
            );
          sessionId = await sessionPromise;
        }
        send({
          type: "CUSTOM",
          name: CE.session,
          value: {
            sessionId,
            created: sessionCreated,
            viaHeader: sessionFromHeaderPath,
            endpointId: ENDPOINT_ID,
            endpointLabel: ENDPOINT_LABEL,
            reasoningMode: REASONING_MODE,
            pluginIds,
          },
        });
        audit.sessionId = sessionId;
        audit.sessionCreated = sessionCreated;
        const texts = await attachmentsP;
        const attachments = attachmentsIn.map((a) => {
          const t = texts.get(a.mediaId) ?? null;
          return {
            mediaId: a.mediaId,
            name: String(t?.name ?? a.name ?? "attachment").slice(0, 180),
            kind: String(t?.kind ?? a.kind ?? "document"),
            extractedChars: t?.text.length ?? 0,
            known: !!t,
            text: t?.text.slice(0, ATTACHMENT_TEXT_CHARS) ?? "",
          };
        });
        const attachmentPrefix = attachments.length
          ? `${attachments.map((a) => `Attached document "${a.name}" (OnDemand media ${a.mediaId}):\n${a.text || "(no text could be extracted from this file; it was uploaded to this OnDemand session as media " + a.mediaId + ")"}`).join("\n\n---\n\n")}\n\nAnswer from the attached document when it is relevant and cite it as ${attachments.map((a) => `[attachment: ${a.name}]`).join(" / ")}.\n\n`
          : "";
        // 2. query — stream
        status("querying", { sessionId });
        custom(CE.request, {
          method: "POST",
          proxy: deps.transport,
          upstream: `POST ${baseUrl.replace(/^https?:\/\//, "")}/chat/v1/sessions/{id}/query`,
          body: {
            endpointId: ENDPOINT_ID,
            endpointLabel: ENDPOINT_LABEL,
            reasoningMode: REASONING_MODE,
            responseMode: RESPONSE_MODE,
            pluginIds,
            queryChars: query.length,
            systemContextChars:
              isFirstTurn && ctx.systemContext
                ? String(ctx.systemContext).length
                : 0,
            attachments: attachments.map((a) => ({
              mediaId: a.mediaId,
              name: a.name,
              chars: a.text.length,
            })),
          },
          sessionId,
          sessionCreated,
        });
        if (attachments.length)
          custom(CE.attachments, {
            items: attachments.map((a) => ({
              mediaId: a.mediaId,
              name: a.name,
              kind: a.kind,
              extractedChars: a.extractedChars,
              grounded: a.known,
            })),
          });
        const prefix = `${addenda}${attachmentPrefix}${isFirstTurn && ctx.systemContext ? `${String(ctx.systemContext).slice(0, 6000)}\n\nQuestion: ` : "Question: "}`;
        const qBody = {
          query: prefix + query,
          endpointId: ENDPOINT_ID,
          responseMode: RESPONSE_MODE,
          pluginIds,
          reasoningMode: REASONING_MODE,
          debugMode: "on", // emits statusLog frames (plan_created / step logs) that the status view renders
        };
        const qUrl = `${baseUrl}/chat/v1/sessions/${sessionId}/query`;
        const qHeaders = { ...H, accept: "text/event-stream" };
        audit.query = {
          url: qUrl,
          headers: redactHeaders(qHeaders),
          body: {
            ...qBody,
            query: `${prefix ? `<systemContext+attachments ${prefix.length} chars> ` : ""}${query.slice(0, 300)}`,
          },
          attachments: attachments.map((a) => ({
            mediaId: a.mediaId,
            name: a.name,
            chars: a.text.length,
          })),
        };
        const up = await fetch(qUrl, {
          method: "POST",
          headers: qHeaders,
          body: JSON.stringify(qBody),
          signal: ac.signal,
          cache: "no-store",
        });
        audit.queryResponse = {
          status: up.status,
          contentType: up.headers.get("content-type"),
          elapsedMs: Date.now() - t0,
        };
        if (!up.ok || !up.body) {
          const rawBody = await up.text().catch(() => "");
          let msg = up.statusText;
          try {
            const j = JSON.parse(rawBody) as {
              message?: string;
              error?: { message?: string } | string;
            };
            msg =
              j?.message ??
              (typeof j?.error === "string" ? j.error : j?.error?.message) ??
              msg;
          } catch {
            if (rawBody) msg = rawBody.slice(0, 300);
          }
          typedError(
            "upstream_http",
            `OnDemand query failed (HTTP ${up.status}): ${msg}`,
            rawBody.slice(0, 2000),
          );
          throw new UpstreamError(
            `OnDemand query failed (HTTP ${up.status}): ${msg}`,
            up.status === 401 || up.status === 403 ? 401 : 502,
            "upstream_http",
          );
        }
        status("streaming");
        reader = up.body.getReader();
        firstByteTimer = setTimeout(() => {
          if (!gotFirstByte) abort("deadline-first-byte");
        }, CHAT_FIRST_BYTE_MS);
        // 3. translate OnDemand SSE → AG-UI SSE (flushed per upstream frame)
        let upstreamDone = false;
        while (!upstreamDone) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!gotFirstByte) {
            gotFirstByte = true;
            clearTimeout(firstByteTimer);
          }
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
            const m = /\r?\n\r?\n/.exec(buf.slice(i));
            const fr = buf.slice(0, i);
            buf = buf.slice(i + (m ? m[0].length : 2));
            rawCount++;
            if (rawFirst.length < 10)
              rawFirst.push({ ms: Date.now() - t0, raw: fr.slice(0, 600) });
            if (!firstFrameAt) {
              firstFrameAt = Date.now();
              status("planning", { firstFrameMs: firstFrameAt - t0 });
            }
            let evName = "",
              data = "";
            for (const line of fr.split(/\r?\n/)) {
              if (line.startsWith("event:")) evName = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            // Raw passthrough for the /chat-od-style status view; heartbeats carry nothing it renders.
            if (data && evName !== "heartbeat") custom(CE.raw, { event: evName || "message", data });
            if (data && handle(evName, data)) {
              upstreamDone = true;
              break;
            }
          }
        }
        if (buf.trim()) {
          for (const line of buf.split(/\r?\n/))
            if (line.startsWith("data:")) handle("", line.slice(5).trim());
        }
        startText();
        if (pluginErr.current) {
          // The plugin failed upstream: the model's prose is a disclaimer, not a researched answer. The typed error + red tool card were already
          // streamed; finish the run normally so OpenUI keeps the partial text visible (RUN_ERROR would drop the last debounced delta).
          send({ type: "TEXT_MESSAGE_END", messageId });
          status("done", {
            chars: text.length,
            sources: 0,
            ...timingFields(),
            pluginError: pluginErr.current.message,
          });
          send({ type: "RUN_FINISHED", threadId, runId });
        } else {
          for (const [pid, t] of tools)
            if (t.open)
              toolDone(
                pid,
                realSources.size || pid !== PLUGIN_ID ? "ok" : "error",
                realSources.size || pid !== PLUGIN_ID
                  ? {}
                  : {
                      message:
                        "Perplexity returned no sources for this question",
                    },
              );
          if (realSources.size) clearPluginBlocked(PLUGIN_ID); // a clean run with real sources lifts a stale `blocked` state
          send({ type: "TEXT_MESSAGE_END", messageId });
          for (const [idx, d] of derivedSummary)
            if (!d.closed) {
              d.closed = true;
              custom(CE.summary, {
                phase: "done",
                index: idx,
                stepId: String(idx),
                derived: true,
                text: `${d.title} — ${d.n} source${d.n === 1 ? "" : "s"}${d.hosts.length ? ` from ${d.hosts.join(", ")}` : ""}.`,
                at: new Date().toISOString(),
              });
            }
          if (stepCounter > 0)
            custom(CE.step, {
              phase: "done",
              stepId: currentStepId,
              index: stepCounter,
              message: "answer written",
            });
          emitSources(false);
          if (wantsReport && text.trim().length > 200) {
            const title = query.replace(/\s+/g, " ").trim().slice(0, 110);
            const srcList = [...realSources.values()].slice(0, 25);
            const sections = mdToSections(text);
            if (srcList.length)
              sections.push({
                heading: "Sources",
                paragraphs: [],
                bullets: srcList.map(
                  (x, i) => `[${i + 1}] ${x.title || x.sourceName} — ${x.url}`,
                ),
              });
            const bytes = makeTextPdf({
              title: "B Capital Portfolio Report",
              subtitle: `${title} · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${ENDPOINT_LABEL} + ${pluginIds.map((id) => PLUGIN_NAMES[id] ?? id).join(", ")}`,
              sections,
              footer:
                "B Capital Portfolio Intelligence · generated by the analyst chat · verify figures against the cited sources",
            });
            // File name from the answer's first H1 (never the typo-prone prompt): `<h1-slug>-YYYY-MM-DD.pdf`; the legacy prompt slug is kept as `alias`.
            const named = reportFileName(text, title, new Date());
            persistArtifact({
              key: `report:${messageId}`,
              name: named.name,
              mime: "application/pdf",
              bytes,
              origin: "bridge.report",
              source: "generated",
              alias: named.alias,
            });
          }
          if (artifactJobs.length) {
            status("filing", {
              statusMessage: `Saving ${artifactJobs.length} file${artifactJobs.length === 1 ? "" : "s"} to Artifacts`,
            });
            await Promise.allSettled(artifactJobs);
          }
          status("done", {
            chars: text.length,
            sources: realSources.size,
            ...timingFields(),
          });
          send({ type: "RUN_FINISHED", threadId, runId });
        }
      } catch (e) {
        const err = e as Error;
        if (abortReason === "client") {
          closed = true;
          try {
            controller.close();
          } catch {
            /* noop */
          }
        } else {
          const timedOut =
            err.name === "AbortError" || abortReason.startsWith("deadline");
          const message = timedOut
            ? timeoutMessage(
                abortReason === "deadline-first-byte"
                  ? "no first byte"
                  : abortReason === "deadline-total"
                    ? "overall deadline"
                    : reader
                      ? "upstream closed"
                      : "connecting",
              )
            : err instanceof UpstreamError
              ? err.message
              : `Upstream fetch failed: ${err.message || "stream failed"}`;
          const code = timedOut
            ? "timeout"
            : err instanceof UpstreamError
              ? err.code
              : "fetch_failed";
          if (!(err instanceof UpstreamError && err.code === "upstream_http"))
            typedError(code, message, String(err.message ?? ""));
          allToolsDone("error", { message });
          if (textStarted) send({ type: "TEXT_MESSAGE_END", messageId });
          send({ type: "RUN_ERROR", message, code });
          audit.error = { code, message };
        }
      } finally {
        audit.timings = {
          firstUpstreamFrameMs: firstFrameAt ? firstFrameAt - t0 : null,
          ...timingFields(),
          totalMs: Date.now() - t0,
          upstreamFrames: rawCount,
          answerChars: text.length,
          sources: realSources.size,
          pluginError: pluginErr.current?.message ?? null,
          abortReason: abortReason || null,
        };
        audit.firstUpstreamEvents = rawFirst;
        deps.audit?.(audit);
        cleanup();
        reader?.cancel().catch(() => {});
        finish();
      }
    },
    cancel() {
      abort("client");
      reader?.cancel().catch(() => {});
      clearTimeout(totalTimer);
    },
  });
  return { ok: true, stream, sessionId };
}
