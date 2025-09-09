export const normId = (raw: string): string => {
  if (!raw) return "";
  const s = raw.trim().replace(/\s+/g, " ");
  const re =
    /^(?<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(?<year>\d{2})\s*(?<type>P|F|PT|FT)?\s*(?:-)?\s*(?<num>\d+)?$/i;
  const reAttached =
    /^(?<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(?<year>\d{2})(?<type>P|F|PT|FT)\s*(?:-)?\s*(?<num>\d+)?$/i;
  const m = s.match(re) || s.match(reAttached);
  if (!m || !m.groups) return s.toUpperCase();

  const month = m.groups.month![0].toUpperCase() + m.groups.month!.slice(1).toLowerCase();
  const year = m.groups.year!;
  let type = (m.groups.type || "").toUpperCase();
  if (type === "P") type = "PT";
  if (type === "F") type = "FT";
  const num = m.groups.num ? String(parseInt(m.groups.num, 10)) : "";

  console.log(`${month}${year}${type ? ` ${type}` : ""}${num ? ` - ${num}` : ""}`);
  return `${month}${year}${type ? ` ${type}` : ""}${num ? ` - ${num}` : ""}`;
};
