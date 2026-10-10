import type { Metadata } from "next";
import { listCompanies } from "@/lib/api";
import { OnboardingForm } from "@/components/shell/onboarding-form";
export const metadata: Metadata = { title: "Welcome" };
export default async function OnboardingPage() {
  const cs = await listCompanies();
  const options = cs.data.filter((c) => c.b_capital_role !== "firm").map((c) => ({ slug: c.slug, name: c.name, sector: c.sector, logo_url: c.logo_url })).sort((a, b) => a.name.localeCompare(b.name));
  return <OnboardingForm options={options} />;
}
