"use client";
/** §8.10 Loader — the brand logo spinning (`spinAnimation`), its colour toggling every 1000 ms between primary-400 and neutral-400. */
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import BrandLogo from "./brand-logo";

const Loader = ({ className }: { className?: string }) => {
  const [alt, setAlt] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setAlt((v) => !v), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={twMerge("flex h-full w-full items-center justify-center", className)}>
      <BrandLogo className={twMerge("spinAnimation", alt ? "text-neutral-400 dark:text-neutral-300" : "text-primary-400")} />
    </div>
  );
};
export default Loader;
