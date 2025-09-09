
function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "";

  const d = new Date(isoString);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0"); // months are 0-based
  const dd = String(d.getDate()).padStart(2, "0");

  const HH = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${HH}:${min}`;
}

export { formatDate }
