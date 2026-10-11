import * as React from "react";
import { cn } from "@/lib/utils";
import "@/components/overview/bento.css";
/** `elevate` (a21) opts a card into the hover-elevation treatment (`.card-elevate`); default rendering is unchanged. */
export type CardProps = React.HTMLAttributes<HTMLDivElement> & { elevate?: boolean };
export const Card = ({ className, elevate, ...p }: CardProps) => <div className={cn("card min-w-0", elevate && "card-elevate", className)} {...p} />;
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col gap-1 p-5 pb-2", className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-base font-semibold leading-tight tracking-tight", className)} {...p} />;
export const CardDescription = ({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn("text-sm text-muted", className)} {...p} />;
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("p-5 pt-2", className)} {...p} />;
