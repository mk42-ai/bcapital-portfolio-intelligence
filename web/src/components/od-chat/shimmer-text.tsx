"use client";
/** Ported verbatim from the spec §8.3 (ShimmerText — title sweep animation while loading). */
import { memo, useMemo, type CSSProperties } from "react";
import { twMerge } from "tailwind-merge";

const THEME_VARS =
  "[--shimmer-base:#9F9F9F] [--shimmer-highlight:#475467] " +
  "dark:[--shimmer-base:theme(colors.neutral.300)] dark:[--shimmer-highlight:theme(colors.neutral.200)]";

const BASE_STYLE: CSSProperties = {
  backgroundImage: "linear-gradient(90deg, var(--shimmer-base) 0%, var(--shimmer-base) 38%, var(--shimmer-highlight) 50%, var(--shimmer-base) 62%, var(--shimmer-base) 100%)",
  backgroundSize: "220% 100%",
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  color: "transparent",
};

const ShimmerText = ({ text, className, color, shimmerColor }: { text: string; className?: string; color?: string; shimmerColor?: string }) => {
  const style = useMemo(() => {
    if (!color && !shimmerColor) return BASE_STYLE;
    return { ...BASE_STYLE, ...(color && { "--shimmer-base": color }), ...(shimmerColor && { "--shimmer-highlight": shimmerColor }) } as CSSProperties;
  }, [color, shimmerColor]);
  return (
    <span className={twMerge("inline-block animate-text-shimmer motion-reduce:animate-none", THEME_VARS, className)} style={style}>
      {text}
    </span>
  );
};
export default memo(ShimmerText);
