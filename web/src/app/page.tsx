import { redirect } from "next/navigation";
// Kept as a fallback; the primary / → /overview redirect is a 307 from next.config.ts `redirects()`.
export const dynamic = "force-dynamic";
export default function Home() { redirect("/overview"); }
