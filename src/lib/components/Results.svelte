<script lang="ts">
  import dayjs from "dayjs";
  import customParseFormat from "dayjs/plugin/customParseFormat";
  dayjs.extend(customParseFormat);

  import type { Entry } from "$lib/types";
  import TimelineBar from "./TimelineBar.svelte";

  export let courseDict: Record<string, { name: string; teacher?: string }>;
  export let entries: Entry[] = [];
  export let weekMode = false;
  export let fullByClassCourse: Map<string, Entry[]> = new Map();
  export let activeWeek = "";
  export let nextByClassCourse: Map<string, string | null> = new Map();
  export let classTotals: Map<string, number> = new Map();
  let endWeekDate = "";

  const toSunday = (ymd: string) => dayjs(ymd, "YYYY-MM-DD", true).add(6, "day").format("D MMMM YYYY");

  function nextLabel(classId: string, code: string): string | null {
    const nc = nextByClassCourse.get(`${classId}|${code}`) ?? null;
    if (!nc) return null;
    const n = courseDict[nc]?.name;
    return n ? `${nc} – ${n}` : nc;
  }

  $: visibleClassIds = (() => {
    const s = new Set<string>();
    for (const e of entries) s.add(e.classId);
    return s;
  })();

  $: filteredStudentsTotal = Array.from(visibleClassIds).reduce((sum, id) => sum + (classTotals.get(id) ?? 0), 0);

  $: grouped = (() => {
    const m = new Map<string, Map<string, Entry[]>>();
    for (const e of entries) {
      if (!m.has(e.classId)) m.set(e.classId, new Map());
      const inner = m.get(e.classId)!;
      if (!inner.has(e.courseCode)) inner.set(e.courseCode, []);
      inner.get(e.courseCode)!.push(e);
    }
    for (const map of m.values()) {
      for (const arr of map.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
    }
    return m;
  })();

  // group by class for week mode
  $: weekByClass = (() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      (m.get(e.classId) ?? m.set(e.classId, []).get(e.classId)!).push(e);
    }
    return m;
  })();
</script>

<div class="results-root">
  {#if !entries.length}
    <div class="text-secondary">No results.</div>
  {:else if weekMode}
    <!-- Week-at-a-glance -->
    <div class="card border-secondary py-4">
      <div class="card-header">
        <strong>
          Week view
          <span class="badge bg-warning bg-opacity-10 text-warning border border-warning ms-2 fs-6 px-3 py-2">
            {filteredStudentsTotal} filtered students
          </span>
        </strong>
      </div>
      <div class="table-responsive">
        <table class="table table mb-0 align-middle table-striped table-hover">
          <thead>
            <tr>
              <th class="border-info ps-4">Class</th>
              <th class="fw-bold border-info">Course</th>
              <th class="fst-italic border-info">Teacher</th>
              <th class="fst-italic border-info">Week end date: {endWeekDate}</th>
              <th class="border-info">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {#each Array.from(weekByClass.keys()).sort() as classId}
              {#each weekByClass.get(classId) ?? [] as e}
                {#key `${classId}|${e.courseCode}`}
                  <tr>
                    <td class="fw-semibold ps-4 text-secondary">
                      {classId}
                      {#if classTotals.has(classId)}
                        <span class="badge bg-info bg-opacity-10 text-info border border-info">
                          {classTotals.get(classId)} students
                        </span>
                      {/if}
                    </td>
                    <td>
                      <div class="text-secondary fw-semibold">{e.courseCode}</div>
                      <div class="small">
                        {courseDict[e.courseCode]?.name}
                      </div>
                    </td>
                    <td>{courseDict[e.courseCode]?.teacher}</td>
                    <td>
                      Week {e.courseWeek}
                      <span hidden>{(endWeekDate = toSunday(e.date))}</span>
                    </td>
                    <td class="position-relative tl-cell">
                      <div class="timeline-wrap d-inline-flex align-items-center gap-2">
                        <TimelineBar
                          items={fullByClassCourse.get(`${classId}|${e.courseCode}`) ?? [e]}
                          {activeWeek}
                          showNumbers={true}
                        />
                        {#if nextLabel(classId, e.courseCode)}
                          <small class="ms-2 tl-label">
                            <i class="fa-regular fa-circle-right"></i>
                            <span>{nextLabel(classId, e.courseCode)}</span>
                          </small>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/key}
              {/each}
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else}
    <!-- Full timelines per class -->
    {#each Array.from(grouped.keys()) as classId}
      <div
        class="card py-4
            {classId.includes('FT') ? 'border-primary' : ''}
            {classId.includes('PT') ? 'border-secondary' : ''}"
      >
        <div
          class="card-header d-flex justify-content-between align-items-center
          {classId.includes('FT') ? 'border-secondary' : ''}
          {classId.includes('PT') ? 'border-secondary' : ''}"
        >
          <div class="d-flex align-items-center gap-2">
            <strong>{classId}</strong>
            {#if classTotals.has(classId)}
              <span class="badge bg-info bg-opacity-10 text-info border border-info">
                {classTotals.get(classId)} students
              </span>
            {/if}
          </div>
          <small class="text-secondary">
            {entries.find((e) => e.classId === classId)?.intake}
            {" "}{entries.find((e) => e.classId === classId)?.year}
            {" "}{entries.find((e) => e.classId === classId)?.mode}
          </small>
        </div>

        <!-- <div class="card-body p-0"> -->
        <div class="table-responsive">
          <table class="table table mb-0 align-middle table-striped table-hover">
            <thead>
              <tr>
                <th class="border-info ps-4">Course</th>
                <th class="border-info">Teacher</th>
                <th class="border-info">From</th>
                <th class="border-info">To</th>
                <th class="border-info">Timeline</th>
              </tr>
            </thead>
            <tbody>
              {#each Array.from(grouped.get(classId)?.entries() ?? []) as [courseCode, arr]}
                {#if arr && arr.length}
                  <tr>
                    <td class="ps-4">
                      <div class="text-secondary fw-semibold">{courseCode}</div>
                      <div class="small">
                        {courseDict[courseCode]?.name}
                      </div>
                    </td>
                    <td>{courseDict[courseCode]?.teacher}</td>
                    <td class="text-nowrap">
                      {dayjs(arr[0].date, "YYYY-MM-DD", true).format("D MMMM YYYY")}
                    </td>
                    <td class="text-nowrap">
                      {toSunday(arr[arr.length - 1].date)}
                    </td>
                    <td class="position-relative tl-cell">
                      <div class="timeline-wrap d-inline-flex align-items-center gap-2">
                        <TimelineBar items={arr} {activeWeek} showIndexLabel={false} />
                        {#if nextLabel(classId, courseCode)}
                          <small class="tl-label">
                            <i class="fa-regular fa-circle-right"></i>
                            <span>{nextLabel(classId, courseCode)}</span>
                          </small>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      </div>
      <!-- </div> -->
    {/each}
  {/if}
</div>

<style>
  /* Wrap the entire component in its own low z plane to avoid fighting modals */
  .results-root {
    position: relative;
    isolation: isolate; /* contain future effects/filters here */
    z-index: 0; /* modal/backdrop are 1055/1050 on <body> */
  }

  /* Make each timeline cell a safe positioning context */
  .tl-cell {
    position: relative;
    z-index: 0;
    isolation: isolate;
  }

  /* Timeline container never captures global clicks */
  .timeline-wrap {
    position: relative;
    z-index: 0;
    pointer-events: none; /* inert drawing area */
  }

  /* Allow the small text label next to the bar to be interactive if needed */
  .timeline-wrap .tl-label,
  .timeline-wrap .tl-label * {
    pointer-events: auto;
  }

  /* Table wrappers stay in the normal flow (no rogue fixed layers) */
  .table-responsive {
    position: relative;
    z-index: 0;
    overflow: auto; /* default, but explicit here */
  }
</style>
