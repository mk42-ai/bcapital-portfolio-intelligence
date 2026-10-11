import "server-only";
import { saveArtifact } from "./server";
import { registerWithOnDemand } from "./media";
import type { ArtifactJob, ArtifactCtx, PersistedArtifact } from "@/lib/ondemand/chat-bridge";

/** Store one chat-produced file (report PDF / agent file_written / artifact_ready): OnDemand Media API registration + backend /artifacts row.
 *  Used by POST /api/chat (proxy transport) and POST /api/chat/artifact (the browser transport, which cannot hold INGEST_SECRET). */
export async function persistChatArtifact(job: ArtifactJob, ctx: ArtifactCtx & { origin: string; key: string }): Promise<PersistedArtifact> {
  let bytes = job.bytes;
  if (!bytes && job.url) { const r = await fetch(job.url, { signal: AbortSignal.timeout(30_000), cache: "no-store" }); if (!r.ok) throw new Error(`fetch ${job.url.slice(0, 80)} → HTTP ${r.status}`); bytes = new Uint8Array(await r.arrayBuffer()); }
  if (!bytes) throw new Error("no file bytes or URL in the event");
  const media = await registerWithOnDemand({ bytes, name: job.name, mime: job.mime, origin: ctx.origin, sessionId: ctx.sessionId, externalUserId: ctx.externalUserId, key: ctx.key });
  const artifact = await saveArtifact({ bytes, name: job.name, mime: job.mime, source: job.source, mediaId: media.mediaId, mediaStatus: media.mediaStatus, mediaMessage: media.mediaMessage, mediaSourceUrl: media.sourceUrl ?? null, mediaUrlExpiresAt: media.expiresAt ?? null, mediaExternalUserId: media.externalUserId ?? null, mediaPlugins: media.plugins ?? null, threadId: ctx.threadId, sessionId: ctx.sessionId, originEvent: job.origin });
  return { artifact, media: { status: media.mediaStatus, id: media.mediaId, message: media.mediaMessage, ms: media.ms } };
}
