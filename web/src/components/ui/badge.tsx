import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("chip", { variants: { tone: {
  default: "border-border bg-surface-2 text-foreground", primary: "border-[#bfdbfe] bg-[#eff6ff] text-primary-soft", accent: "border-border-strong bg-surface-3 text-foreground",
  info: "border-border bg-surface-2 text-muted-2", muted: "border-border bg-transparent text-muted", danger: "border-[#fecaca] bg-[#fef2f2] text-danger-soft",
  solid: "border-foreground bg-foreground text-background",
} }, defaultVariants: { tone: "default" } });
export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
