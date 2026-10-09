import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus-visible:outline-3 focus-visible:outline-ring disabled:opacity-50 aria-[invalid=true]:border-danger", className)} {...props} />
));
Input.displayName = "Input";
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn("flex h-10 w-full min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-3 focus-visible:outline-ring", className)} {...props} />
));
Select.displayName = "Select";
export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn("text-sm font-medium text-foreground", className)} {...p} />;
export const Field = ({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string; htmlFor: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
    {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs text-muted">{hint}</p>}
    {error && <p id={`${htmlFor}-error`} role="alert" className="text-xs text-danger">{error}</p>}
  </div>
);
