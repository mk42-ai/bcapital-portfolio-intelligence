/**
 * Dependency-free mock SSE body builder for the /api/chat bridge (frame schema: web/src/app/api/chat/route.ts).
 * Each frame gets a monotonically increasing `seq`, and the stream is terminated with `data: [DONE]`.
 */
export function sseFrames(frames: object[]): string {
  let seq = 0;
  const out = frames.map((o) => `data: ${JSON.stringify({ seq: ++seq, ...(o as Record<string, unknown>) })}\n\n`);
  out.push("data: [DONE]\n\n");
  return out.join("");
}

/** Response headers the client expects from the SSE bridge. */
export function sseHeaders(sessionId?: string): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
  };
  if (sessionId) h["x-ondemand-session"] = sessionId;
  return h;
}
