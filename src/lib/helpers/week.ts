// Week starts Monday, delivery due is the Sunday.
// "Last week" = the previous full Mon→Sun window that ended last Sunday.
export function getLastWeekRange(base = new Date()) {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));

  // JS: Monday=1 ... Sunday=0; we normalize with (dow+6)%7 so Monday=0
  const dow = (d.getUTCDay() + 6) % 7;

  // End of current week (Sunday) = today + (6 - dow)
  const thisSun = new Date(d);
  thisSun.setUTCDate(thisSun.getUTCDate() + (6 - dow));

  // Last week's Sunday and Monday
  const lastSun = new Date(thisSun);
  lastSun.setUTCDate(lastSun.getUTCDate() - 7);

  const lastMon = new Date(lastSun);
  lastMon.setUTCDate(lastMon.getUTCDate() - 6);

  // Return ISO (YYYY-MM-DD) without time
  const toISODate = (x: Date) => x.toISOString().slice(0, 10);
  return {
    startISO: toISODate(lastMon), // Monday
    endISO: toISODate(lastSun), // Sunday (assignment delivery date)
  };
}

export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysUntil(iso: string, base = new Date()) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function pretty(iso: string) {
  // Format: Mon, 01 Sep 2025
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
