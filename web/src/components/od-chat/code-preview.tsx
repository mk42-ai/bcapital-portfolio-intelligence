"use client";
/** Code-preview side panel for the §8.9 code-fence cards (this app has no preview panel; a minimal right-side drawer stands in). */
import { X } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type CodePreview = { key: string; language: string; code: string };
type Ctx = { preview: CodePreview | null; open: (p: CodePreview) => void; close: () => void };
const CodePreviewContext = createContext<Ctx>({ preview: null, open: () => {}, close: () => {} });
export const useCodePreview = () => useContext(CodePreviewContext);

export function CodePreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const value = useMemo<Ctx>(() => ({ preview, open: setPreview, close: () => setPreview(null) }), [preview]);
  return <CodePreviewContext.Provider value={value}>{children}</CodePreviewContext.Provider>;
}

export function CodePreviewDrawer() {
  const { preview, close } = useCodePreview();
  if (!preview) return null;
  return (
    <aside aria-label="Code preview" className="flex h-full w-full max-w-[520px] shrink-0 flex-col border-l border-border1 bg-card">
      <div className="flex items-center justify-between border-b border-border1 px-4 py-2">
        <span className="text-sm font-medium uppercase">{preview.language || "code"}</span>
        <button type="button" onClick={close} aria-label="Close preview" className="rounded p-1 text-neutral-400 hover:text-neutral-700"><X className="size-4" /></button>
      </div>
      <pre className="yScrollbar min-h-0 flex-1 overflow-auto p-4 text-xs leading-5"><code>{preview.code}</code></pre>
    </aside>
  );
}
