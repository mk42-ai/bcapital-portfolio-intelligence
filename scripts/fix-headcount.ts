// One-off repair: headcount values that were digit-stripped (e.g. "964 (estimate, March 2026)" → 9642026) are re-parsed from the profile's leading number.
import { getDb, persist } from "../src/db/client.js";
const { raw } = await getDb();
const res = raw.exec(`select c.slug, c.employees, p.profile from companies c join company_profiles p on p.slug = c.slug`);
let fixed = 0;
for (const [slug, employees, profile] of res[0]?.values ?? []) {
  const hc = JSON.parse(String(profile)).headcount?.value; if (!hc || hc === "unknown") continue;
  const m = String(hc).replace(/,/g, "").match(/(\d{2,6})/); const n = m ? parseInt(m[1], 10) : NaN;
  if (Number.isFinite(n) && n !== Number(employees)) { raw.run(`update companies set employees = ? where slug = ?`, [n, String(slug)]); fixed++; console.log(slug, employees, "→", n); }
}
persist(); console.log(JSON.stringify({ fixed }));
