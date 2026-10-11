"use client";
/** Ported verbatim from the spec §8.3 (top/bottom fade inside scrollable thinking panels). */
import { useLayoutEffect, useState, type RefObject } from "react";
import { twMerge } from "tailwind-merge";

const ComponentShadow = ({ scrollRef, className }: { scrollRef?: RefObject<HTMLElement | null>; className?: string } = {}) => {
  const hasScrollRef = Boolean(scrollRef);
  const [showTop, setShowTop] = useState(!hasScrollRef);
  const [showBottom, setShowBottom] = useState(true);

  useLayoutEffect(() => {
    if (!scrollRef?.current) return;
    const el = scrollRef.current;
    const handleUpdate = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const hasOverflow = scrollHeight - clientHeight > 1;
      setShowTop(hasOverflow && !(scrollTop <= 0));
      setShowBottom(hasOverflow && !(scrollTop + clientHeight >= scrollHeight - 1));
    };
    handleUpdate();
    el.addEventListener("scroll", handleUpdate, { passive: true });
    const ro = new ResizeObserver(handleUpdate);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", handleUpdate); ro.disconnect(); };
  }, [scrollRef]);

  return (
    <>
      {showTop && <div className={twMerge("pointer-events-none absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-bgColor dark:from-thinkingBg ", className)} />}
      {showBottom && <div className={twMerge("pointer-events-none absolute inset-x-0 bottom-0 h-[10%] bg-gradient-to-t from-bgColor dark:from-thinkingBg", className)} />}
    </>
  );
};
export default ComponentShadow;
