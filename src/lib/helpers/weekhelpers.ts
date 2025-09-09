
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);

import type { Dayjs } from "dayjs";
// ---- week helpers ----
function mondayYMD(d: string) {
  const dt = dayjs(d);
  const dow = dt.day(); // 0=Sun, 1=Mon ...
  return dt.subtract((dow + 6) % 7, "day").format("YYYY-MM-DD");
}
const weekLabel = (ymd: string) =>
  `Week of ${dayjs(ymd, "YYYY-MM-DD", true).format("D MMM YYYY")}`;


export { mondayYMD, weekLabel }

