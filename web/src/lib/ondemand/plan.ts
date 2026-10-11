/**
 * plan.ts — pure helpers that keep raw planner JSON OUT of the Plan card (owner evidence pass-3/raw-plan-json-771x332.png).
 * Used by the SSE bridge (app/api/chat/route.ts) before every `ondemand.plan` frame and by PlanStepper as a last line of defence.
 * The plan frame carries ONLY `{ objective: string, steps: [{ id, title, query?, plugins? }] }`; the raw planner text lives in the
 * `ondemand.planner_payload` channel and is rendered exclusively behind the single developer reveal (run-rail.tsx, dev-disclosure).
 */
export type SanitizedStep = { id: string; title: string; query?: string; plugins?: string[] };
export type SanitizedPlan = { objective: string; steps: SanitizedStep[] };

/** True when a string is (or starts like) a JSON document / planner envelope rather than a human sentence. */
export function looksLikeJson(t: string | null | undefined): boolean {
  if (!t) return false;
  return /^\s*(?:\{|\[\s*(?:[{\["\]]|\d))/.test(t) || /"plan_required"|"steps"\s*:|"objective"\s*:|"user_query"\s*:/.test(t) || /^\s*```/.test(t);
}

/** True for a bare operationId-style token: camelCase / PascalCase / snake_case identifier with no spaces (e.g. `listPortfolioCompanies`). */
export function looksLikeOperationId(t: string): boolean {
  const s = t.trim();
  if (!s || /\s/.test(s)) return false;
  return /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(s) || /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+$/.test(s) || /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(s);
}

/** `listPortfolioCompanies` → "List portfolio companies"; `get_company_news` → "Get company news". Sentences pass through untouched. */
export function friendlyStepTitle(t: string): string {
  const s = String(t ?? "").trim();
  if (!s) return "";
  if (looksLikeOperationId(s)) {
    const words = s.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase().split(/\s+/).filter(Boolean);
    return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
  }
  if (looksLikeJson(s)) {
    // A step title that is itself JSON — pull a title/name/user_query out of it, else drop to a neutral label.
    const m = /"(?:title|name|user_query)"\s*:\s*"((?:[^"\\]|\\.){2,160})"/.exec(s);
    return m ? friendlyStepTitle(m[1].replace(/\\"/g, "\"")) : "";
  }
  // "[Title] rest of query" → Title
  const lm = /^\s*\[([^\]]{3,80})\]/.exec(s); if (lm) return lm[1].trim();
  return s.replace(/[*_`#>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Objective → one plain first-person-friendly sentence, ≤ ~24 words; JSON-looking text is stripped to "". */
export function sanitizeObjective(t: string | null | undefined): string {
  if (!t) return "";
  if (looksLikeJson(t)) return "";
  const w = t.replace(/[*_`#>]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!w.length) return "";
  return (w.length > 26 ? `${w.slice(0, 24).join(" ")}...` : w.join(" ")).slice(0, 400);
}

/** Normalise any parsed planner JSON (or an already-shaped plan) into the strict plan frame. Never leaks raw JSON into objective/title. */
export function sanitizePlan(input: unknown): SanitizedPlan {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawObj = typeof r.objective === "string" && r.objective.trim() ? r.objective : typeof r.title === "string" ? r.title : "";
  const objective = sanitizeObjective(rawObj);
  const list = Array.isArray(r.steps) ? r.steps : [];
  const steps: SanitizedStep[] = list.map((x, i) => {
    if (typeof x === "string") return { id: String(i + 1), title: friendlyStepTitle(x) || `Step ${i + 1}` };
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const uq = typeof o.user_query === "string" ? o.user_query : typeof o.query === "string" ? o.query : "";
    const lm = /^\s*\[([^\]]{3,80})\]\s*([\s\S]*)$/.exec(uq);
    const rawTitle = typeof o.title === "string" && o.title.trim() ? o.title : typeof o.name === "string" && o.name.trim() ? o.name : lm ? lm[1] : uq;
    const title = friendlyStepTitle(rawTitle) || `Step ${i + 1}`;
    const query = uq ? (lm ? lm[2] : uq).trim().slice(0, 600) : undefined;
    const plugins = Array.isArray(o.plugins) ? o.plugins.map((p) => (typeof p === "string" ? p : String((p as Record<string, unknown>)?.name ?? (p as Record<string, unknown>)?.pluginId ?? ""))).filter(Boolean) : undefined;
    return { id: String(o.id ?? o.step_id ?? i + 1), title: title.slice(0, 160), ...(query ? { query } : {}), ...(plugins?.length ? { plugins } : {}) };
  });
  return { objective, steps };
}
