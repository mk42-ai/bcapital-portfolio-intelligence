"use client";
/** Ported verbatim from the spec §8.3 — the building block for every row. */
import { Check, ChevronRight } from "lucide-react";
import { Children, ReactNode, useId, useState } from "react";
import { twMerge } from "tailwind-merge";
import ShimmerText from "./shimmer-text";

export type StatusAccordionStatus = "loading" | "done" | "none";
export interface IStatusAccordion {
  title?: ReactNode; meta?: ReactNode; status?: StatusAccordionStatus; tickColor?: string; icon?: ReactNode;
  collapsible?: boolean; disabled?: boolean; defaultOpen?: boolean; isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void; children?: ReactNode; className?: string;
  headerClassName?: string; titleClassName?: string; metaClassName?: string; contentClassName?: string;
  /** One-line live preview shown in the header row while the row is collapsed (e.g. streaming thinking). */
  preview?: string;
}

/** Collapse whitespace/markdown and keep the tail, so a single truncated line always shows the newest streamed text. */
export const oneLineTail = (text: string | undefined, max = 180): string => {
  const flat = (text ?? "").replace(/[`*#>_]+/g, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `…${flat.slice(-max)}` : flat;
};

const StatusAccordion = ({
  title, meta, status = "none", tickColor = "text-green-500", icon, collapsible = true,
  disabled = false, defaultOpen = false, isOpen: controlledIsOpen, onToggle, children,
  className, headerClassName, titleClassName, metaClassName, contentClassName, preview,
}: IStatusAccordion) => {
  const contentId = useId();
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const isControlled = controlledIsOpen !== undefined;
  const hasContent = Children.toArray(children).length > 0;
  const isOpen = !collapsible || (isControlled ? controlledIsOpen : internalIsOpen);
  const isLoading = status === "loading";

  const handleToggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternalIsOpen(next);
    onToggle?.(next);
  };

  const statusIcon =
    status === "loading" ? (
      <span aria-label="Loading" className="size-[14px] animate-spin rounded-full border-[1.5px] border-neutral-200 border-t-neutral-500 dark:border-neutral-600 dark:border-t-neutral-300" />
    ) : status === "done" ? (
      <span className={twMerge("flex", tickColor)}>{icon ?? <Check aria-label="Done" className="size-[14px]" />}</span>
    ) : null;

  const isTextTitle = typeof title === "string" || typeof title === "number";
  const titleNode = !isTextTitle ? title : isLoading ? (
    <ShimmerText text={String(title)} className={twMerge("text-sm", titleClassName)} />
  ) : (
    <span className={twMerge("text-sm text-neutral-400", titleClassName)}>{title}</span>
  );

  const headerContent = (
    <>
      {statusIcon && <span className="flex size-[14px] shrink-0 items-center justify-center">{statusIcon}</span>}
      {titleNode}
      {meta && <span className={twMerge("text-xs text-neutral-400", metaClassName)}>{meta}</span>}
      {collapsible && (
        <ChevronRight className={twMerge("size-4 shrink-0 text-neutral-300 transition-transform duration-300", isOpen && "rotate-90")} />
      )}
      {/* Inline one-line preview (same row): right-aligned so the NEWEST words stay visible; older text fades out on the left. */}
      {collapsible && !isOpen && !!preview && (
        <span className="flex min-w-0 flex-1 justify-end overflow-hidden whitespace-nowrap text-xs text-neutral-400 [mask-image:linear-gradient(to_right,transparent,black_32px)]" data-testid="status-preview">
          <span>{preview}</span>
        </span>
      )}
    </>
  );

  const headerClasses = twMerge("flex w-full items-center gap-3 py-1.5 text-left disabled:cursor-default", headerClassName);

  return (
    <div className={twMerge("w-full", className)}>
      {collapsible ? (
        <button type="button" onClick={handleToggle} disabled={disabled} aria-expanded={isOpen} aria-controls={contentId} className={headerClasses}>
          {headerContent}
        </button>
      ) : (
        <div className={headerClasses}>{headerContent}</div>
      )}
      {hasContent && (
        <div id={contentId} className={twMerge("grid transition-all duration-300 ease-in-out", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <div className="overflow-hidden">
            <div className={twMerge("ml-2 py-1 pl-5", collapsible && "border-l border-neutral-200 dark:border-neutral-700", contentClassName)}>
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default StatusAccordion;
