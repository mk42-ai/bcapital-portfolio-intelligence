"use client";
/**
 * Composer enhancer (Agent 23): ONE row — [Attach] [textarea] [mic] [send]. OpenUI's composer markup is kept (textarea + submit in
 * `.openui-agent-thread-composer__input-wrapper`); composer.css turns the wrapper into a row and this component portals Agent 6's
 * <AttachButton/> into a host inserted BEFORE the textarea (the voice dock keeps its own host in the action bar, before the send button).
 * It also applies ui-store `draft` injections (PitchBook ask-in-chat / starters) into the EXISTING textarea via the native value setter.
 */
import "./composer.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip } from "lucide-react";
import * as Att from "./attachments";
import { useUi } from "./ui-store";

const WRAPPER = ".chat-shell .openui-agent-thread-composer__input-wrapper";
const HOST = "oiu-attach-host";

function FallbackAttach() {
  return <button type="button" className="oiu-att__attach-btn" aria-label="Attach a file" data-testid="attachment-button" onClick={() => document.querySelector<HTMLInputElement>("[data-testid=attachment-input]")?.click()}><Paperclip className="size-4" aria-hidden /></button>;
}
const AttachButton: React.ComponentType = (Att as unknown as { AttachButton?: React.ComponentType }).AttachButton ?? FallbackAttach;

function useAttachHost() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let current: HTMLElement | null = null;
    const ensure = () => {
      const wrap = document.querySelector<HTMLElement>(WRAPPER);
      if (!wrap) { if (current) { current.remove(); current = null; setHost(null); } return; }
      if (current && current.parentElement === wrap) return;
      current?.remove();
      let h = wrap.querySelector<HTMLElement>(`:scope > .${HOST}`);
      if (!h) { h = document.createElement("span"); h.className = HOST; wrap.insertBefore(h, wrap.firstChild); }
      current = h; setHost(h);
    };
    ensure(); const mo = new MutationObserver(ensure); mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); current?.remove(); };
  }, []);
  return host;
}

/** Writes `text` into the React-controlled textarea (native setter + input event) and focuses it. */
export function injectDraft(text: string): boolean {
  const ta = document.querySelector<HTMLTextAreaElement>(".chat-shell textarea");
  if (!ta) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(ta, text); ta.dispatchEvent(new Event("input", { bubbles: true })); ta.focus();
  try { ta.setSelectionRange(text.length, text.length); } catch { /* ignore */ }
  return true;
}

export function Composer() {
  const host = useAttachHost();
  const ui = useUi(); const applied = useRef(0);
  useEffect(() => {
    if (!ui.draftVersion || ui.draftVersion === applied.current || !ui.draft) return;
    let tries = 0; const t = setInterval(() => { tries++; if (injectDraft(ui.draft) || tries > 40) { applied.current = ui.draftVersion; clearInterval(t); } }, 100);
    return () => clearInterval(t);
  }, [ui.draft, ui.draftVersion]);
  return host ? createPortal(<AttachButton />, host) : null;
}
