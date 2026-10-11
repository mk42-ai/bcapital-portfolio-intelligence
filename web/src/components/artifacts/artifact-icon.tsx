/* eslint-disable @next/next/no-img-element */
import type { ArtifactKind, ArtifactSource } from "@/lib/artifacts/types";
import "./artifacts.css";

/** Upload lifecycle state. "ok" (default) = show the per-type icon. */
export type ArtifactIconState = "ok" | "idle" | "uploading" | "success" | "failed";
/** Every icon name available under /public/icons/artifacts/<name>.png. */
export type ArtifactIconName =
  | "pdf" | "document" | "spreadsheet" | "presentation" | "image" | "video" | "audio" | "chart" | "code" | "json" | "archive" | "link" | "generic"
  | "upload-idle" | "upload-progress" | "upload-success" | "upload-failed";

/** PNG → webp variant mapping (web/public/assets/artifacts/<name>-256.webp; upload states live under /assets/upload/). */
const WEBP: Partial<Record<ArtifactIconName, string>> = {
  pdf: "/assets/artifacts/pdf", document: "/assets/artifacts/doc", spreadsheet: "/assets/artifacts/spreadsheet", presentation: "/assets/artifacts/presentation",
  image: "/assets/artifacts/image", video: "/assets/artifacts/video", audio: "/assets/artifacts/audio", chart: "/assets/artifacts/chart", code: "/assets/artifacts/code",
  json: "/assets/artifacts/json", archive: "/assets/artifacts/archive", link: "/assets/artifacts/link", generic: "/assets/artifacts/generic",
  "upload-idle": "/assets/upload/idle", "upload-progress": "/assets/upload/in-progress", "upload-success": "/assets/upload/success", "upload-failed": "/assets/upload/failed",
};
const LABEL: Record<ArtifactIconName, string> = {
  pdf: "PDF", document: "Document", spreadsheet: "Spreadsheet", presentation: "Presentation", image: "Image", video: "Video", audio: "Audio", chart: "Chart", code: "Code",
  json: "Data file", archive: "Archive", link: "Link", generic: "File", "upload-idle": "Ready to upload", "upload-progress": "Uploading", "upload-success": "Uploaded", "upload-failed": "Upload failed",
};

const ext = (name: string) => { const n = name.toLowerCase().split(/[?#]/)[0]; const i = n.lastIndexOf("."); return i >= 0 ? n.slice(i + 1) : ""; };

/**
 * Pure, unit-testable icon picker. Precedence: upload state → link → mime/extension family → kind → generic.
 * `source` is optional: "link" (or an http(s) name) → link icon.
 */
export function iconFor(kind?: ArtifactKind | "upload" | string | null, mime?: string | null, name?: string | null, state: ArtifactIconState = "ok", source?: ArtifactSource | "link" | string | null): ArtifactIconName {
  if (state === "failed") return "upload-failed";
  if (state === "uploading") return "upload-progress";
  if (state === "success") return "upload-success";
  if (state === "idle") return "upload-idle";
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  const n = (name ?? "").trim();
  const e = ext(n);
  if (source === "link" || /^https?:\/\//i.test(n) || ["url", "webloc", "desktop"].includes(e) || m === "text/uri-list" || m === "application/internet-shortcut") return "link";
  if (m === "application/pdf" || e === "pdf") return "pdf";
  if (/^application\/(zip|x-zip-compressed|x-tar|gzip|x-gzip|x-7z-compressed|x-rar-compressed|x-bzip2)$/.test(m) || ["zip", "tar", "gz", "tgz", "7z", "rar", "bz2"].includes(e)) return "archive";
  if (m.includes("spreadsheet") || m === "application/vnd.ms-excel" || m === "text/csv" || ["xlsx", "xls", "csv", "tsv", "ods"].includes(e)) return "spreadsheet";
  if (m.includes("presentation") || m === "application/vnd.ms-powerpoint" || ["pptx", "ppt", "odp", "key"].includes(e)) return "presentation";
  if (m === "application/json" || /\+json$/.test(m) || m.includes("yaml") || ["json", "yaml", "yml", "ndjson", "toml"].includes(e)) return "json";
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "sh", "bash", "html", "htm", "css", "scss", "sql", "go", "rs", "java", "rb"].includes(e) || /^(text\/(html|css|javascript|x-python|x-sh)|application\/(javascript|x-javascript|x-sh|xhtml\+xml))$/.test(m)) return "code";
  // chart: "chart|graph|plot" in the name, or an SVG the agent/bridge generated under a report (generated/agent source) — uploads stay "image".
  const generated = source === "generated" || source === "agent";
  const isSvg = m === "image/svg+xml" || e === "svg";
  const chartName = /chart|graph|plot/i.test(n) || (isSvg && generated);
  if (m.startsWith("image/") || kind === "image" || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "tiff"].includes(e)) return chartName ? "chart" : "image";
  if (m.startsWith("video/") || kind === "video" || ["mp4", "webm", "mov", "m4v", "mkv"].includes(e)) return "video";
  if (m.startsWith("audio/") || kind === "audio" || ["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(e)) return "audio";
  if (m.includes("word") || m === "application/msword" || m === "application/rtf" || m.startsWith("text/") || ["docx", "doc", "txt", "md", "rtf", "odt", "log"].includes(e)) return "document";
  if (kind === "document") return "document";
  return "generic";
}

/** Human label for an icon name (also used for the kind badge). */
export const iconLabel = (name: ArtifactIconName): string => LABEL[name];

/** Short file-type badge text, e.g. "PDF", "XLSX", "PNG", "Image". */
export function kindBadge(kind: ArtifactKind | string, mime: string, name: string): string {
  const e = ext(name).toUpperCase();
  if (e && e.length <= 5) return e;
  const sub = (mime.split("/")[1] ?? "").split(";")[0].toUpperCase();
  if (sub && sub.length <= 5) return sub;
  return kind ? kind[0].toUpperCase() + kind.slice(1) : "File";
}

/**
 * Per-type artifact icon from the saved set (/icons/artifacts/<name>.png, webp variant preferred). Pass either `name` (pre-resolved via
 * iconFor) or kind/mime/fileName/state/source to resolve here. PNGs are large: explicit size + lazy/async decoding.
 */
export function ArtifactIcon({ name, kind, mime, fileName, source, state = "ok", size = 32, className, title }: {
  name?: ArtifactIconName; kind?: ArtifactKind | "upload" | string; mime?: string | null; fileName?: string | null; source?: ArtifactSource | "link" | string | null;
  state?: ArtifactIconState; size?: number; className?: string; title?: string;
}) {
  const icon = name ?? iconFor(kind, mime, fileName, state, source);
  const webp = WEBP[icon];
  const png = `/icons/artifacts/${icon}.png`;
  const cls = ["art-kind-icon", className].filter(Boolean).join(" ");
  const img = <img src={png} width={size} height={size} alt={title ?? LABEL[icon]} className={cls} style={{ width: size, height: size }} loading="lazy" decoding="async" draggable={false} data-icon={icon} />;
  if (!webp) return img;
  return (
    <picture className="art-kind-icon-wrap" style={{ width: size, height: size }}>
      <source type="image/webp" srcSet={`${webp}-256.webp 1x, ${webp}-512.webp 2x`} />
      {img}
    </picture>
  );
}
