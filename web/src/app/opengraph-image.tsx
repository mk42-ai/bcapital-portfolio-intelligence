import { ImageResponse } from "next/og";
export const runtime = "edge";
export const alt = "B Capital Portfolio Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
/** Plain white OG card: the Lucide `hexagon` glyph (monochrome, open source, ISC) + the product name. No photography, no AI imagery. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", color: "#111827", fontFamily: "Inter, Arial, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <svg width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: -1 }}>B Capital Portfolio Intelligence</div>
            <div style={{ fontSize: 28, color: "#5f6b7a", marginTop: 12 }}>Catalysts. Questioners. Visionaries.</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
