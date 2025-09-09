<script lang="ts">
  export let data: { API_URL: string; token: string; user };
  import dayjs from "dayjs";
  import customParseFormat from "dayjs/plugin/customParseFormat";
  dayjs.extend(customParseFormat);

  import type { Dayjs } from "dayjs";
  const ymd = "2025-02-01";

  const out: Dayjs = dayjs(ymd, "YYYY-MM-DD", true).add(6, "day");
  console.log(data.API_URL);
  console.log(data.user);
  console.log(data.user.id);
  console.log("token " + data.token);
</script>

<h1>test</h1>

{out}
{data.API_URL}
