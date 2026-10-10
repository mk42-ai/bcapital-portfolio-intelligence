"use client";
/**
 * App-owned composer row — ONE flex row whose direct children are, in order: Attach button · textarea · mic button · send/stop button.
 * It replaces OpenUI's built-in <Composer> (passed as <AgentInterface.Composer>) so the layout is deterministic: no MutationObserver
 * portals racing for a slot, no second thread column, and the row is pinned to the bottom of the full-width thread canvas (shell.css).
 * Sending still goes through OpenUI's `processMessage` (same thread, same OnDemand session, same plugin selection, same plan rail).
 * The draft lives in composerStore so "Ask in chat" chips (PitchBook drawer / company page) land in THIS textarea.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useThread } from "@openuidev/react-ui";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import { attachmentsStore, useAttachments, AttachmentChip, ACCEPT_ATTR, DROP_HINT } from "./attachments";
import { composerStore, registerComposerSlot, useDraft } from "./composer-store";
import { MODEL_LABEL } from "@/lib/plugins";

const PLACEHOLDER = "Ask about any portfolio company…";

export function AppComposer() {
  const processMessage = useThread((s) => s.processMessage);
  const cancelMessage = useThread((s) => s.cancelMessage);
  const isRunning = useThread((s) => s.isRunning);
  const isLoadingMessages = useThread((s) => s.isLoadingMessages);
  const draft = useDraft();
  const att = useAttachments();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const micSlot = useRef<HTMLSpanElement>(null);
  const panelSlot = useRef<HTMLDivElement>(null);
  const aboveSlot = useRef<HTMLDivElement>(null);
  // Slots for the voice dock (mic button + voice panel) and the context-chips bar: registered once, no DOM polling.
  useLayoutEffect(() => {
    registerComposerSlot("mic", micSlot.current); registerComposerSlot("panel", panelSlot.current); registerComposerSlot("above", aboveSlot.current);
    return () => { registerComposerSlot("mic", null); registerComposerSlot("panel", null); registerComposerSlot("above", null); };
  }, []);
  // Auto-grow (max ~8 lines).
  useLayoutEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = "0px"; el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 200)}px`; }, [draft]);
  useEffect(() => { if (!isLoadingMessages) inputRef.current?.focus({ preventScroll: true }); }, [isLoadingMessages]);

  const uploading = att.items.some((a) => a.status === "uploading");
  const canSend = draft.trim().length > 0 && !isRunning && !isLoadingMessages && !uploading;
  const send = useCallback(() => {
    const text = composerStore.get().trim(); if (!text || isRunning || isLoadingMessages) return;
    composerStore.clear();
    void processMessage({ role: "user", content: text });
  }, [processMessage, isRunning, isLoadingMessages]);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };
  // Drag-and-drop / paste files anywhere over the composer.
  const onDrop = (e: React.DragEvent) => { if (!Array.from(e.dataTransfer.types).includes("Files")) return; e.preventDefault(); attachmentsStore.setDragging(false); attachmentsStore.add(e.dataTransfer.files); };
  const onDragOver = (e: React.DragEvent) => { if (!Array.from(e.dataTransfer.types).includes("Files")) return; e.preventDefault(); attachmentsStore.setDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; attachmentsStore.setDragging(false); };
  const onPaste = (e: React.ClipboardEvent) => { const fl = e.clipboardData?.files; if (fl && fl.length) { e.preventDefault(); attachmentsStore.add(fl); } };
  const ready = att.items.filter((a) => a.status === "ready").length;
  return (
    <div className={`oiu-composer${att.dragging ? " oiu-composer--over" : ""}`} data-testid="composer" onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave} onPaste={onPaste}>
      <div ref={aboveSlot} className="oiu-composer__above" data-testid="composer-above" />
      <div ref={panelSlot} className="oiu-composer__panel" data-testid="composer-panel-slot" />
      {att.items.length > 0 && (
        <div className="oiu-att" data-testid="attachment-bar" data-count={att.items.length} data-ready={ready}>
          <ul className="oiu-att__chips" aria-label="Attachments">{att.items.map((a) => <AttachmentChip key={a.id} a={a} />)}</ul>
        </div>
      )}
      {att.dragging && att.items.length === 0 && <p className="oiu-composer__drop" data-testid="attachment-dropzone-empty">{DROP_HINT}</p>}
      <div className="oiu-composer__row" data-testid="composer-row">
        <input ref={fileRef} type="file" multiple accept={ACCEPT_ATTR} className="oiu-att__input" data-testid="attachment-input" tabIndex={-1} aria-hidden onChange={(e) => { if (e.currentTarget.files?.length) attachmentsStore.add(e.currentTarget.files); e.currentTarget.value = ""; }} />
        <button type="button" className="oiu-composer__btn oiu-composer__attach" data-testid="attachment-button" aria-label="Attach a file" title={`Attach a file — ${DROP_HINT}`} onClick={() => fileRef.current?.click()}>
          <Paperclip className="size-4" aria-hidden />
        </button>
        <textarea ref={inputRef} className="oiu-composer__input" data-testid="composer-input" rows={1} value={draft} placeholder={PLACEHOLDER} aria-label="Message"
          onChange={(e) => composerStore.set(e.target.value)} onKeyDown={onKeyDown} disabled={isLoadingMessages} />
        <span ref={micSlot} className="oiu-composer__mic-slot" data-testid="composer-mic-slot" />
        <button type="button" className={`oiu-composer__btn oiu-composer__send${isRunning ? " oiu-composer__send--stop" : ""}`} data-testid="composer-send"
          aria-label={isRunning ? "Cancel message" : "Send message"} title={isRunning ? "Stop" : "Send (Enter)"} onClick={isRunning ? cancelMessage : send} disabled={!isRunning && !canSend}>
          {isRunning ? <Square className="size-3.5" fill="currentColor" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />}
        </button>
      </div>
      <p className="oiu-composer__hint" data-testid="composer-hint">{uploading ? "Waiting for the upload to finish…" : `${MODEL_LABEL} · Enter to send · Shift+Enter for a new line`}</p>
      <p className="sr-only" role="status" aria-live="polite" data-testid="attachment-live">{att.live}</p>
    </div>
  );
}
