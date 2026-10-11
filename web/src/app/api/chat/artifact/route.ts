import { NextRequest } from "next/server";
import { serverApiKey } from "@/lib/ondemand/config";
import { persistChatArtifact } from "@/lib/artifacts/chat";
import { originFrom } from "@/lib/artifacts/media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/chat/artifact — artifact filing for the BROWSER chat transport. The query runs client-side, but storing a report PDF / agent file needs
 * INGEST_SECRET (backend /artifacts) and the 2 h blob relay the OnDemand Media API fetches from, so the browser hands the file over here.
 *   multipart: file (bytes) | url (agent file to fetch server-side — avoids browser CORS), + key, name, mime, origin, source, alias?, sessionId?, threadId, externalUserId
 *   → 200 { artifact, media{status,id,message,ms} }  |  4xx/5xx { message }
 */
export async function POST(req: NextRequest) {
  let fd: FormData;
  try { fd = await req.formData(); } catch { return Response.json({ message: "expected multipart/form-data" }, { status: 400 }); }
  const str = (k: string, max = 400) => { const v = fd.get(k); return typeof v === "string" ? v.slice(0, max) : ""; };
  const file = fd.get("file"); const url = str("url", 2000);
  if (!(file instanceof Blob) && !/^https?:\/\//.test(url)) return Response.json({ message: "needs a 'file' or an http(s) 'url'" }, { status: 400 });
  if (file instanceof Blob && file.size > 25 * 1024 * 1024) return Response.json({ message: "Max 25 MB per file" }, { status: 413 });
  const source = str("source") === "agent" ? "agent" : "generated";
  try {
    const out = await persistChatArtifact(
      { key: str("key"), name: str("name", 180) || "artifact", mime: str("mime", 200) || "application/octet-stream", origin: str("origin", 120), source, alias: str("alias", 180) || undefined, ...(file instanceof Blob ? { bytes: new Uint8Array(await file.arrayBuffer()) } : { url }) },
      { sessionId: str("sessionId", 64) || null, threadId: str("threadId", 120), externalUserId: str("externalUserId", 64), origin: originFrom(req), key: req.headers.get("x-ondemand-key")?.trim() || serverApiKey() },
    );
    return Response.json(out, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ message: String((e as Error)?.message ?? e).slice(0, 300) }, { status: 502 });
  }
}
