"use client";
import { Moon, Sun } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
export function ThemeToggle({ className }: { className?: string }) {
  const [s, set] = useSettings();
  const next = s.theme === "dark" ? "light" : "dark";
  return (
    <Button variant="outline" size="sm" className={className} onClick={() => set({ theme: next })} aria-label={`Switch to ${next} theme`} aria-pressed={s.theme === "light"}>
      {s.theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}<span>{s.theme === "dark" ? "Light theme" : "Dark theme"}</span>
    </Button>
  );
}
