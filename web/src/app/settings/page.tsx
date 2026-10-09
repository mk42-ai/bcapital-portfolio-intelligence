import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "@/components/shell/settings-form";
import { listCompanies } from "@/lib/api";
export const metadata: Metadata = { title: "Settings" };
export default async function SettingsPage() {
  const cs = await listCompanies();
  const options = cs.data.filter((c) => c.b_capital_role !== "firm").map((c) => ({ slug: c.slug, name: c.name, sector: c.sector })).sort((a, b) => a.name.localeCompare(b.name));
  return (<><PageHeader title="Settings" lede="Credentials stay in this browser. Every AI call goes through the OnDemand API via our same-origin proxy; every data call goes to the portfolio backend." /><SettingsForm options={options} /></>);
}
