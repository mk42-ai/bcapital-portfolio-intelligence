// Side-effect stylesheet imports (`import "./globals.css"`). Next.js types only declare `*.module.css`, so TypeScript ≥5.9 editors
// with noUncheckedSideEffectImports report TS2882 on plain .css imports; this declares them (CSS modules keep Next's typed declaration).
declare module "*.css";
