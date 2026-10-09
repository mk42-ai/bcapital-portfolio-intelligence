import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-3 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 min-h-10 min-w-10",
  { variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-[#1f2937]",
        secondary: "bg-surface-2 text-foreground border border-border hover:bg-surface-3",
        ghost: "hover:bg-surface-2 text-foreground",
        outline: "border border-border bg-transparent hover:bg-surface-2",
        danger: "bg-danger text-danger-foreground hover:bg-danger-soft",
        link: "text-primary-soft underline underline-offset-4 min-h-6",
      },
      size: { default: "h-10 px-4 py-2", sm: "h-9 rounded-md px-3", lg: "h-12 rounded-xl px-6 text-base", icon: "h-10 w-10" },
    }, defaultVariants: { variant: "default", size: "default" } },
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
export { Button, buttonVariants };
