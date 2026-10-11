/* eslint-disable @next/next/no-img-element */
import type { ArtifactKind, ArtifactSource } from "@/lib/artifacts/types";
import "./artifacts.css";

export type ArtifactIconState = "ok" | "uploading" | "failed";
const SRC: Record<string, string> = { document: "document", image: "image", video: "video", audio: "document", file: "document", upload: "upload" };
/** Type icon from /public/icons/artifacts/*.png. `state="failed"` swaps to upload-failed; `uploading` uses the upload glyph. */
export function ArtifactIcon({ kind, source, state = "ok", size = 32, className }: { kind: ArtifactKind | "upload"; source?: ArtifactSource; state?: ArtifactIconState; size?: number; className?: string }) {
  const name = state === "failed" ? "upload-failed" : state === "uploading" ? "upload" : (source === "upload" && kind !== "image" && kind !== "video" ? "upload" : SRC[kind] ?? "document");
  const label = state === "failed" ? "Upload failed" : state === "uploading" ? "Uploading" : `${kind} file`;
  return <img src={`/icons/artifacts/${name}.png`} width={size} height={size} alt={label} className={["art-kind-icon", className].filter(Boolean).join(" ")} style={{ width: size, height: size }} draggable={false} />;
}
