"use client";
/** Host-app plugin logo lookup for §8.6 / §8.8: (name, agentId) → url. "agent-123" and "plugin-123" are the same plugin. */
import { useCallback } from "react";
import { pluginMeta } from "@/lib/plugin-catalogue";
import { pluginIconFor } from "@/lib/plugin-icons";

export const DEFAULT_PLUGIN_LOGO_URL = "/plugins/ondemand.svg";

export const usePluginLogo = () =>
  useCallback((name: string, agentId: string): string | undefined => {
    const pid = (agentId || "").replace(/^agent-/, "plugin-");
    return pluginIconFor(pid, name, pluginMeta(pid)?.logoUrl ?? null).src;
  }, []);
