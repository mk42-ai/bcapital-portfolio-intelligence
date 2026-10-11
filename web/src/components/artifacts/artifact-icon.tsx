/* eslint-disable @next/next/no-img-element */
import type { ArtifactKind, ArtifactSource } from "@/lib/artifacts/types";
import "./artifacts.css";

export type ArtifactIconState = "ok" | "uploading" | "failed";
const SRC: Record<string, string> = { document: "document", image: "image", video: "video", audio: "document", file: "document", upload: "upload" };
/** Type icon from /public/icons/artifacts/*.png. `state="failed"` swaps to upload-failed; `uploading` uses the upload glyph. */
/** File-type glyph from the restored icon set (web/public/icons/artifacts): pdf · spreadsheet · presentation · chart · code · json · archive · link · audio · video · image · document · generic. */
export function iconNameFor(kind: ArtifactKind | "upload", name?: string | null, mime?: string | null): string {
  const n = (name ?? "").toLowerCase(); const m = (mime ?? "").toLowerCase();
  if (kind === "image") return "image"; if (kind === "video") return "video"; if (kind === "audio") return "audio";
  if (/\.pdf$/.test(n) || m.includes("pdf")) return "pdf";
  if (/\.(xlsx?|csv|tsv)$/.test(n) || m.includes("spreadsheet") || m.includes("excel") || m.includes("csv")) return "spreadsheet";
  if (/\.(pptx?|key)$/.test(n) || m.includes("presentation")) return "presentation";
  if (/\.json$/.test(n) || m.includes("json")) return "json";
  if (/\.(zip|tar|gz|tgz|7z|rar)$/.test(n) || m.includes("zip") || m.includes("compressed")) return "archive";
  if (/\.(ts|tsx|js|jsx|py|go|rs|java|rb|sh|sql|yaml|yml|toml|css|html?)$/.test(n) || m.includes("javascript") || m.includes("typescript") || m.includes("x-sh")) return "code";
  if (/\.(url|webloc)$/.test(n) || m.includes("uri-list")) return "link";
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(n) || m.startsWith("image/")) return "image";
  if (/\.(docx?|md|txt|rtf|odt)$/.test(n) || m.startsWith("text/") || m.includes("word") || m.includes("document")) return "document";
  return kind === "document" ? "document" : "generic";
}
export function ArtifactIcon({ kind, source, state = "ok", size = 32, className, name: fileName, mime }: { kind: ArtifactKind | "upload"; source?: ArtifactSource; state?: ArtifactIconState; size?: number; className?: string; name?: string | null; mime?: string | null }) {
  const name = state === "failed" ? "upload-failed" : state === "uploading" ? "upload-progress" : (fileName || mime ? iconNameFor(kind, fileName, mime) : (source === "upload" && kind !== "image" && kind !== "video" ? "upload" : SRC[kind] ?? "document"));
  const label = state === "failed" ? "Upload failed" : state === "uploading" ? "Uploading" : `${kind} file`;
  return <img src={`/icons/artifacts/${name}.png`} width={size} height={size} alt={label} className={["art-kind-icon", className].filter(Boolean).join(" ")} style={{ width: size, height: size }} draggable={false} />;
}
