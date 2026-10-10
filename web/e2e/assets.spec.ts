/**
 * Asset pipeline contract (Agent 1): every illustration in web/public/assets is served locally with the right content-type,
 * the manifest lists exactly the twelve names, and no page ships a runtime blob URL or a retired /fallbacks/ path.
 * No API key, no live data needed — safe against any deploy.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ASSET, ASSET_CONTENT_TYPE, ASSET_EXTS, ASSET_NAMES, ASSET_SIZES, asset, isLocalAssetPath } from "../src/lib/assets";

const ASSETS_DIR = join(__dirname, "..", "public", "assets");
const FORBIDDEN = ["blob.core.windows.net", "/fallbacks/"] as const;

test.describe("assets: local pipeline", () => {
  test("ASSET_NAMES × {256,512} × {webp,png} are served with the right content-type", async ({ request }) => {
    expect(ASSET_NAMES.length).toBe(12);
    const failures: string[] = [];
    for (const name of ASSET_NAMES) {
      for (const size of ASSET_SIZES) {
        for (const ext of ASSET_EXTS) {
          const path = asset(name, size, ext);
          const res = await request.get(path, { timeout: 30_000 });
          const ct = (res.headers()["content-type"] ?? "").toLowerCase();
          const body = await res.body();
          if (res.status() !== 200) failures.push(`${path} → HTTP ${res.status()}`);
          else if (!ct.startsWith(ASSET_CONTENT_TYPE[ext])) failures.push(`${path} → content-type "${ct}"`);
          else if (body.length < 200) failures.push(`${path} → ${body.length} bytes`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("every ASSET.* entry is a local /assets path", () => {
    for (const [key, src] of Object.entries(ASSET)) {
      expect(isLocalAssetPath(src), `${key} = ${src}`).toBe(true);
    }
  });

  test("manifest.json lists exactly the 12 assets with local paths and byte sizes", () => {
    const manifest = JSON.parse(readFileSync(join(ASSETS_DIR, "manifest.json"), "utf8")) as Record<string, { [k: string]: unknown; bytes?: Record<string, number>; transparent_pct?: number }>;
    const keys = Object.keys(manifest);
    expect(keys.length).toBe(12);
    expect([...keys].sort()).toEqual([...ASSET_NAMES].sort());
    for (const name of ASSET_NAMES) {
      const e = manifest[name];
      for (const size of ASSET_SIZES) {
        for (const ext of ASSET_EXTS) {
          const k = `${ext}${size}` as const;
          expect(e[k], `${name}.${k}`).toBe(asset(name, size, ext));
          const onDisk = statSync(join(ASSETS_DIR, `${name}-${size}.${ext}`)).size;
          expect(e.bytes?.[k], `${name}.bytes.${k}`).toBe(onDisk);
        }
      }
      expect(typeof e.transparent_pct).toBe("number");
      expect(e.transparent_pct as number).toBeGreaterThan(0);
    }
  });

  test("manifest.json is also served from the deploy", async ({ request }) => {
    const res = await request.get("/assets/manifest.json", { timeout: 30_000 });
    expect(res.status()).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).length).toBe(12);
  });

  for (const route of ["/chat", "/"]) {
    test(`${route} HTML contains no blob URL and no /fallbacks/ reference`, async ({ request }) => {
      const res = await request.get(route, { timeout: 60_000 });
      expect(res.status(), `${route} status`).toBeLessThan(400);
      const html = await res.text();
      for (const needle of FORBIDDEN) {
        const idx = html.indexOf(needle);
        expect(idx, `${route}: found "${needle}" near …${html.slice(Math.max(0, idx - 80), idx + 80)}…`).toBe(-1);
      }
    });
  }

  test("public/ has no fallbacks directory left", () => {
    let exists = true;
    try { statSync(join(__dirname, "..", "public", "fallbacks")); } catch { exists = false; }
    expect(exists).toBe(false);
  });
});
