/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { ArtifactsPageClient } from "@/components/artifacts/artifacts-page-client";
import "@/components/artifacts/artifacts.css";
export const metadata: Metadata = { title: "Artifacts" };
export const dynamic = "force-dynamic";
export default function ArtifactsPage() {
  return (
    <div data-testid="artifacts-page" style={{ minHeight: "100dvh" }}>
      <header className="art-page-header mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="flex items-center gap-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            <picture><source type="image/webp" srcSet="/assets/artifacts-ui/artifacts-header-256.webp 1x, /assets/artifacts-ui/artifacts-header-512.webp 2x" /><img src="/icons/artifacts/artifacts-header.png" alt="" width={44} height={44} className="art-page-mark" decoding="async" /></picture>
            Artifacts
          </h1>
          <p className="mt-2 text-sm text-muted sm:text-base">Every report, image, video and upload across all threads</p>
        </div>
      </header>
      <ArtifactsPageClient />
    </div>
  );
}
