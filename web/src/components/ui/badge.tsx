import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("chip", { variants: { tone: {
  default: "border-border bg-surface-2 text-foreground", primary: "border-primary/60 bg-primary/15 text-primary-soft", accent: "border-accent/60 bg-accent/15 text-accent-soft",
  info: "border-info/60 bg-info/15 text-info-soft", muted: "border-border bg-transparent text-muted", danger: "border-danger/60 bg-danger/15 text-danger-soft",
  solid: "border-primary bg-primary text-primary-foreground",
} }, defaultVariants: { tone: "default" } });
export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
