"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Landmark, X } from "lucide-react";
import { addContextChip, hasChipTransfer, readChipTransfer, removeContextChip, useContextChips, domainOf, PITCHBOOK_PLUGIN_NAME } from "./context-chips";

const COMPOSER_SEL = ".chat-shell .openui-agent-thread-composer, .chat-shell .openui-agent-welcome-screen__desktop-composer";
const HOST_CLASS = "oiu-context-chips-host";

/**
 * Removable context chips rendered DIRECTLY ABOVE the composer (a host div inserted before OpenUI's composer node, portal inside) plus the
 * document-level drop target: dragging a PitchBook chip (MIME application/x-bcap-chip) over the composer highlights it brand-green-soft and
 * dropping pushes the chip into the store. Nothing here sends a message or creates a thread.
 */
export function ContextChipsBar() {
  const chips = useContextChips();
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const ensure = () => {
      const composer = document.querySelector<HTMLElement>(COMPOSER_SEL);
      if (!composer || !composer.parentElement) { setHost(null); return; }
      let h = composer.previousElementSibling as HTMLElement | null;
      if (!h || !h.classList.contains(HOST_CLASS)) { h = document.createElement("div"); h.className = HOST_CLASS; composer.parentElement.insertBefore(h, composer); }
      setHost((prev) => (prev === h ? prev : h));
    };
    ensure();
    const mo = new MutationObserver(() => ensure()); mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    const target = () => document.querySelector<HTMLElement>(COMPOSER_SEL);
    const over = (e: DragEvent) => { if (!hasChipTransfer(e.dataTransfer)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; const t = target(); if (!t) return; t.classList.toggle("oiu-drop-active", t.contains(e.target as Node)); };
    const leave = (e: DragEvent) => { if (!hasChipTransfer(e.dataTransfer)) return; const t = target(); if (t && !t.contains(e.relatedTarget as Node | null)) t.classList.remove("oiu-drop-active"); };
    const drop = (e: DragEvent) => { if (!hasChipTransfer(e.dataTransfer)) return; e.preventDefault(); const t = target(); t?.classList.remove("oiu-drop-active"); const chip = readChipTransfer(e.dataTransfer); if (chip && t && t.contains(e.target as Node)) addContextChip(chip); };
    const end = () => target()?.classList.remove("oiu-drop-active");
    document.addEventListener("dragover", over); document.addEventListener("dragleave", leave); document.addEventListener("drop", drop); document.addEventListener("dragend", end);
    return () => { document.removeEventListener("dragover", over); document.removeEventListener("dragleave", leave); document.removeEventListener("drop", drop); document.removeEventListener("dragend", end); };
  }, []);
  if (!host || !chips.length) return null;
  return createPortal(
    <ul className="oiu-context-chips" aria-label="Context for the next message" data-testid="context-chips">
      {chips.map((c) => {
        const dom = domainOf(c.source);
        return (
          <li key={c.id} className="oiu-context-chip" data-testid="context-chip" data-field={c.field} title={`${c.company} · ${c.field}: ${c.value}${dom ? ` (source ${dom})` : ""} — sent with the next message via ${PITCHBOOK_PLUGIN_NAME}`}>
            <Landmark className="size-3 shrink-0" aria-hidden />
            <span className="oiu-context-chip__text"><span className="oiu-context-chip__co">{c.company}</span> · {c.field}: <span className="oiu-context-chip__val">{c.value}</span></span>
            <button type="button" onClick={() => removeContextChip(c.id)} aria-label={`Remove ${c.field} context`} data-testid="context-chip-remove" className="oiu-context-chip__x"><X className="size-3" aria-hidden /></button>
          </li>
        );
      })}
    </ul>, host);
}
