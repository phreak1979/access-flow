<script lang="ts">
  import type { User } from "$lib/user";
  export let data: { API_URL: string; token: string; user: User };

  import WorkloadMonthChart from "$lib/components/WorkloadMonthChart.svelte";
  import TeacherHeatStrip from "$lib/components/TeacherHeatStrip.svelte";
  import Calendar from "$lib/components/Calendar.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import TeacherStrip from "$lib/components/TeacherStrip.svelte";
  import dayjs from "dayjs";
  import customParseFormat from "dayjs/plugin/customParseFormat";
  dayjs.extend(customParseFormat);
  import { globalProgramId } from "$lib/stores/program";
  import { mondayYMD, weekLabel } from "$lib/helpers/weekhelpers";
  import { formatDate } from "$lib/helpers/dateformating";
  import { normId } from "$lib/helpers/norm-id";
  import { parseExcelFromArrayBuffer } from "$lib/parser";
  import type { Entry, Intake, Mode } from "$lib/types";
  import type { ProgramOption, ProgramsResponse, AccessListTypeWithLabel, CourseProfile, Totals } from "$lib/api";
  import { onMount } from "svelte";

  // ---------------------------
  // STATE
  // ---------------------------
  let API_URL = data.API_URL;
  let TOKEN = data.token;
  let user: User = data.user;

  let classTotals: Map<string, number> = new Map();
  let all: Entry[] = [];

  // filters (same semantics as Home)
  let intake: Intake | "" = "";
  let mode: Mode | "" = "";
  let courseQuery = "";
  let classId: string = "";
  let teacherQuery = "";

  // program/profile/access list
  type CourseDict = Record<string, { name: string; teacher?: string }>;
  let courseProfile: CourseProfile[] = [];
  let courseDict: CourseDict = {};
  let selectedProfile: number | undefined;

  let programOptions: ProgramOption[] = [];
  let Programs: ProgramsResponse = [];
  let AccessLists: AccessListTypeWithLabel[] = [];
  let selectedAccessListId = "0";

  // Calendar → active week (Mon) + end (Sun)
  let weekDate = "";
  $: weekDateYMD = weekDate ? dayjs(weekDate).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
  $: activeWeek = mondayYMD(weekDateYMD);
  $: weekEnd = dayjs(activeWeek).add(6, "day").format("YYYY-MM-DD");

  // Toasts
  let toastMessage = "";
  let showToast = false;
  function toast(msg: string) {
    toastMessage = msg;
    showToast = false;
    showToast = true;
  }

  // ---------------------------
  // HELPERS (3-month span)
  // ---------------------------
  // Mondays from the first day of the current month through end of +2 months
  function mondaysInThreeMonths(centerISO: string): string[] {
    const start = dayjs(centerISO).startOf("month");
    const end = start.add(2, "month").endOf("month"); // 3 months inclusive

    let m = dayjs(mondayYMD(start.format("YYYY-MM-DD")));
    if (m.isBefore(start, "day")) m = m.add(7, "day");

    const weeks: string[] = [];
    while (m.isBefore(end, "day") || m.isSame(end, "day")) {
      weeks.push(m.format("YYYY-MM-DD"));
      m = m.add(7, "day");
    }
    return weeks;
  }

  // ---------------------------
  // FINAL WEEK DETECTION
  // ---------------------------
  let lastWeekByClassCourse = new Map<string, string>(); // key->ISO Monday
  function buildLastWeekMap() {
    const byKey = new Map<string, string>();
    for (const e of all) {
      const key = `${e.classId}|${e.courseCode}`;
      const prev = byKey.get(key);
      if (!prev || e.date > prev) byKey.set(key, e.date);
    }
    lastWeekByClassCourse = byKey;
  }

  // ---------------------------
  // DIRECTUS
  // ---------------------------
  async function loadPrograms() {
    try {
      const res = await fetch(
        `${API_URL}/items/programs?fields=*,accesslist.id,accesslist.filename_download,accesslist.uploaded_on,accesslist.uploaded_by.first_name,accesslist.uploaded_by.last_name&filter[manager][directus_users_id][_eq]=${user.id}`,
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` } },
      );
      const { data } = await res.json();
      programOptions = data ?? [];
      Programs = programOptions.filter((p) => p.name).map((p) => ({ value: p.name, id: p.id, name: p.name }));
      loadAccessListandProfiles(programId);
    } catch (err) {
      console.warn("loadPrograms error:", err);
    }
  }

  async function loadClassTotals(studentClass: Totals | null | string) {
    if (!studentClass) {
      classTotals = new Map();
      return;
    }
    try {
      if (Array.isArray(studentClass)) {
        classTotals = new Map(studentClass.map((r: any) => [String(r.classId), Number(r.total) || 0]));
      } else {
        classTotals = new Map(Object.entries(studentClass).map(([k, v]) => [normId(k), Number(v) || 0]));
      }
    } catch (err) {
      console.error("Error calculating student numbers:", err);
      classTotals = new Map();
    }
  }

  async function loadCourseProfile(programId: number) {
    const res = await fetch(
      `${API_URL}/items/courseprofile?fields=*,user_updated.first_name,user_updated.last_name&sort[]=-id&filter[program]=${programId}`,
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` } },
    );
    const { data } = await res.json();
    courseProfile = data ?? [];
    selectedProfile = courseProfile[0]?.id;
    courseDict = courseProfile[0]?.profile ?? {};
  }

  async function handleProfileSelect(e: Event) {
    const target = e.target as HTMLSelectElement;
    const profile = courseProfile.find((x) => x.id == Number(target.value));
    courseDict = profile?.profile ?? {};
  }

  export async function loadFileFromDirectus(fileId: string, directusUrl: string, token: string, signal?: AbortSignal) {
    try {
      const url = `${directusUrl.replace(/\/+$/, "")}/assets/${fileId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
      if (!res.ok) throw new Error(`Directus download failed: HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      let entries = await parseExcelFromArrayBuffer(buffer);
      entries = entries.map((e) => ({ ...e, classId: normId(e.classId) })); // normalize like Home
      all = entries;
      toast("Access List loaded");
    } catch (err) {
      console.error("Error loading Directus file:", err);
      toast("Error loading Access List");
    }
  }

  async function handleProgramSelect(e: Event) {
    const programId = Number((e.target as HTMLSelectElement).value);
    loadAccessListandProfiles(programId);
  }
  async function loadAccessListandProfiles(prgId: Number) {
    console.warn("DEBUGPRINT[78]: +page.svelte:172: prgId=", prgId);
    AccessLists = [];
    selectedAccessListId = "0";
    all = [];
    courseProfile = [];
    courseDict = {};
    classTotals = new Map();
    lastWeekByClassCourse = new Map();
    console.warn("DEBUGPRINT[80]: +page.svelte:182: programId=", programId);

    if (!prgId) return;

    const p = programOptions.find((x) => x.id === prgId);
    console.warn("DEBUGPRINT[81]: +page.svelte:185: p=", p);

    if (p?.accesslist?.id) {
      AccessLists = [
        {
          id: p.accesslist.id,
          value: p.accesslist.id,
          label: p.accesslist.filename_download ?? "",
          filename_download: p.accesslist.filename_download,
          uploaded_by_name:
            `${p.accesslist?.uploaded_by?.first_name ?? ""} ${p.accesslist?.uploaded_by?.last_name ?? ""}`.trim(),
          uploaded_on: formatDate(p.accesslist?.uploaded_on),
        },
      ];
      selectedAccessListId = p.accesslist.id;
      console.warn("DEBUGPRINT[79]: +page.svelte:198: selectedAccessListId=", selectedAccessListId);
      await loadFileFromDirectus(selectedAccessListId, API_URL, TOKEN);
    }

    await loadClassTotals(p?.class ?? null);
    await loadCourseProfile(prgId);
  }

  async function handleFileChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    selectedAccessListId = v;
    if (v && v !== "0") await loadFileFromDirectus(v, API_URL, TOKEN);
  }

  // ---------------------------
  // WORKLOAD ENGINE
  // ---------------------------
  const DISTRIBUTION = [1, 1, 1]; // equal thirds

  type Delivery = {
    classId: string;
    courseCode: string;
    courseName: string;
    teacher: string;
    weekStart: string; // final-week Monday
    delivery: string; // final-week Sunday
    deadline: string; // delivery + 21d
    students: number; // classTotals.get(classId)
  };

  function computeDeliveries(): Delivery[] {
    if (!all.length) return [];
    if (!lastWeekByClassCourse.size) return [];

    const finals = all.filter((e) => lastWeekByClassCourse.get(`${e.classId}|${e.courseCode}`) === e.date);

    const q = courseQuery.trim().toUpperCase();
    const tq = teacherQuery.trim().toUpperCase();

    const filtered = finals.filter((e) => {
      if (intake && e.intake !== intake) return false;
      if (mode && e.mode !== mode) return false;
      if (classId && e.classId !== classId) return false;
      if (q && !e.courseCode.toUpperCase().includes(q)) return false;
      const teacher = (courseDict[e.courseCode]?.teacher ?? "").toUpperCase();
      if (tq && !teacher.includes(tq)) return false;
      return true;
    });

    return filtered.map((e) => {
      const w0 = e.date;
      const delivery = dayjs(w0).add(6, "day").format("YYYY-MM-DD");
      const deadline = dayjs(delivery).add(21, "day").format("YYYY-MM-DD");
      const students = classTotals.get(e.classId) ?? 0;
      return {
        classId: e.classId,
        courseCode: e.courseCode,
        courseName: e.courseName ?? e.courseCode,
        teacher: courseDict?.[e.courseCode]?.teacher ?? "",
        weekStart: w0,
        delivery,
        deadline,
        students,
      };
    });
  }

  type TeacherWeekRow = {
    teacher: string;
    weekStart: string;
    totalPerWeek: number;
    totalClassSize: number;
    parts: Array<{
      classId: string;
      courseCode: string;
      courseName: string;
      students: number;
      share: number;
      weekIndex: 0 | 1 | 2; // 0 = first grading week (Mon after course end), 2 = deadline week
    }>;
    overlaps: number;
  };

  function computeTeacherWeek(activeWeekISO: string): TeacherWeekRow[] {
    const deliveries = computeDeliveries();
    if (!deliveries.length) return [];

    const sum = DISTRIBUTION.reduce((a, b) => a + b, 0) || 1;
    const shares = DISTRIBUTION.map((x) => x / sum);

    const byTeacher = new Map<string, TeacherWeekRow>();

    for (const d of deliveries) {
      const wk0 = d.weekStart; // final-week Monday
      // grading weeks begin the Monday AFTER delivery
      const wk1 = dayjs(wk0).add(7, "day").format("YYYY-MM-DD");
      const wk2 = dayjs(wk0).add(14, "day").format("YYYY-MM-DD");
      const wk3 = dayjs(wk0).add(21, "day").format("YYYY-MM-DD");
      const weeks = [wk1, wk2, wk3];

      weeks.forEach((wk, idx) => {
        if (wk !== activeWeekISO) return;
        const share = shares[idx];
        const load = d.students * share;

        const key = d.teacher || "(Unassigned)";
        let row = byTeacher.get(key);
        if (!row) {
          row = { teacher: key, weekStart: wk, totalPerWeek: 0, totalClassSize: 0, parts: [], overlaps: 0 };
          byTeacher.set(key, row);
        }
        row.totalPerWeek += load;
        row.totalClassSize += d.students;
        row.parts.push({
          classId: d.classId,
          courseCode: d.courseCode,
          courseName: d.courseName,
          students: d.students,
          share,
          weekIndex: idx as 0 | 1 | 2,
        });
        row.overlaps += 1;
      });
    }

    return Array.from(byTeacher.values()).sort(
      (a, b) => b.totalPerWeek - a.totalPerWeek || a.teacher.localeCompare(b.teacher),
    );
  }

  // ---------------------------
  // THREE-MONTH SERIES FOR THE LINE CHART
  // ---------------------------
  let teacherRows: TeacherWeekRow[] = [];
  let perTeacher: Array<{ teacher: string; weekStart: string; total: number }> = [];
  let quarterWeeks: string[] = [];

  function rebuildQuarterSeries() {
    quarterWeeks = mondaysInThreeMonths(weekDateYMD);

    // per-teacher totals for each week (what the line chart needs)
    perTeacher = quarterWeeks.flatMap((wk) => {
      const rows = computeTeacherWeek(wk);
      return rows.map((r) => ({
        teacher: r.teacher || "(Unassigned)",
        weekStart: wk,
        total: r.totalPerWeek,
      }));
    });
  }

  // reactive recomputes
  $: if (all.length) buildLastWeekMap();

  $: {
    // recompute table rows for selected week
    const _deps = {
      activeWeek,
      allLen: all.length,
      selectedAccessListId,
      selectedProfile,
      classTotalsSize: classTotals.size,
      courseDictSize: Object.keys(courseDict).length,
      intake,
      mode,
      classId,
      courseQuery,
      teacherQuery,
    };
    teacherRows = computeTeacherWeek(activeWeek);
  }

  $: {
    // recompute the 3-month line chart whenever anything important changes
    const _deps = {
      monthKey: weekDateYMD.slice(0, 7),
      allLen: all.length,
      selectedAccessListId,
      selectedProfile,
      classTotalsSize: classTotals.size,
      courseDictSize: Object.keys(courseDict).length,
      intake,
      mode,
      classId,
      courseQuery,
      teacherQuery,
      DISTRIBUTION: JSON.stringify(DISTRIBUTION),
    };
    rebuildQuarterSeries();
  }

  // heat strip helpers
  $: shares = (() => {
    const sum = DISTRIBUTION.reduce((a, b) => a + b, 0) || 1;
    return DISTRIBUTION.map((x) => x / sum);
  })();

  function threeSliceForRow(t: TeacherWeekRow): number[] {
    const total = t.parts.reduce((s, p) => s + p.students, 0);
    return [0, 1, 2].map((i) => total * shares[i]);
  }

  // dropdown options
  $: classOptions = Array.from(
    new Set(all.filter((e) => (!intake || e.intake === intake) && (!mode || e.mode === mode)).map((e) => e.classId)),
  ).sort();
  $: if (classId && !classOptions.includes(classId)) classId = "";

  // misc UI helpers
  $: globalMaxHeat = Math.max(1, ...teacherRows.flatMap((r) => threeSliceForRow(r)));
  onMount(loadPrograms);

  const fmt = (n: number) => Intl.NumberFormat().format(Math.round(n));
  function weekBadge(i: 0 | 1 | 2): string {
    if (i === 0) return "W1/3";
    if (i === 1) return "W2/3";
    return "W3/3";
  }
  function weekLong(i: 0 | 1 | 2): string {
    if (i === 0) return "Week 1 of 3 (after delivery)";
    if (i === 1) return "Week 2 of 3";
    return "Week 3 of 3 (deadline week)";
  }

  $: console.log(weekDate);
  $: programId = $globalProgramId;
</script>

<svelte:head><title>Teacher Grading Workload</title></svelte:head>

<main class="container-fluid pt-2">
  <!-- Header -->
  <div class="row g-3 align-items-start">
    <div class="col">
      <h2 class="mb-1">Teacher Grading Workload</h2>
      <div class="small text-muted">
        Week: {weekLabel(activeWeek)} • Mon {activeWeek} → Sun {dayjs(activeWeek).add(6, "day").format("YYYY-MM-DD")}
        • Grading window = 3 weeks after delivery (starts Mon after course end; deadline = Sun + 21d)
      </div>
    </div>
  </div>

  <!-- Main: left controls/table, right calendar -->
  <div class="row g-3">
    <div class="col-12 col-lg-9 d-flex flex-column gap-3">
      <!-- Program / Access list / Profile -->
      <div class="card">
        <div class="card-header">Program Options</div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-12 col-md-4">
              <label class="form-label fw-semibold"><i class="fa-solid fa-square-binary"></i> Programs</label>
              <select class="form-select" on:change={handleProgramSelect} bind:value={programId}>
                <option value="0" selected>No Program Selected...</option>
                {#each Programs as program}
                  <option value={program.id}>{program.name}</option>
                {/each}
              </select>
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label fw-semibold"><i class="fa-solid fa-fingerprint"></i> Access List</label>
              <select class="form-select" bind:value={selectedAccessListId} on:change={handleFileChange}>
                <option value="0" selected>No Access List selected...</option>
                {#each AccessLists as list}
                  <option value={list.value}>{list.label}</option>
                {/each}
              </select>
              {#if Array.isArray(AccessLists) && AccessLists.length > 0 && AccessLists[0]?.uploaded_by_name}
                <small class="text-muted"
                  >Uploaded by: {AccessLists[0].uploaded_by_name} on {AccessLists[0].uploaded_on}</small
                >
              {/if}
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label fw-semibold"><i class="fa-solid fa-user"></i> Profile</label>
              <select class="form-select" bind:value={selectedProfile} on:change={handleProfileSelect}>
                <option value="0" selected>Select course profile...</option>
                {#each courseProfile as profile}
                  <option value={profile.id}>{profile.name}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Workload table -->
      <div class="card h-100">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span
            >Workload by Teacher for {weekLabel(activeWeek)} [<span class="dot bg-success me-1"></span> 1–10,
            <span class="dot bg-warning me-1"></span>
            11–20, <span class="dot bg-danger me-1"></span> 20+]</span
          >
          <span class="small text-muted">Distribution across grading weeks: {DISTRIBUTION.join(":")}</span>
        </div>
        <div class="card-body">
          {#if !teacherRows.length}
            <div class="alert alert-warning mb-0">No grading workload in the selected week (with current filters).</div>
          {:else}
            <div class="table-responsive">
              <table class="table table-sm align-middle">
                <thead class="table-light">
                  <tr>
                    <th>Teacher</th>
                    <th class="text-end">Per-week workload</th>
                    <th class="text-end">Overlaps</th>
                    <th>3-week strip</th>
                    <th class="text-end">Raw class size (sum)</th>
                    <th>Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {#each teacherRows as t}
                    <tr>
                      <td class="fw-semibold">{t.teacher || "(Unassigned)"}</td>
                      <td class="text-end">{fmt(t.totalPerWeek)}</td>
                      <td class="text-end">{t.overlaps}</td>
                      <td><TeacherHeatStrip values={threeSliceForRow(t)} globalMax={globalMaxHeat} /></td>
                      <td class="text-end">{fmt(t.totalClassSize)}</td>
                      <td>
                        {#each t.parts as p}
                          <span
                            class="badge bg-info-subtle me-1 mb-1 week-badge border border-info"
                            title={weekLong(p.weekIndex)}
                          >
                            {p.classId}&nbsp;·&nbsp;{p.courseCode}
                            <span
                              class="ms-2 badge rounded-pill week-badge
                                {p.weekIndex === 2
                                ? 'text-bg-danger'
                                : p.weekIndex === 1
                                  ? 'text-bg-warning'
                                  : 'text-bg-success'}"
                            >
                              {weekBadge(p.weekIndex)}
                            </span>
                            <span class="ms-2 text-muted week-badge">
                              ({fmt(p.students * p.share)} this week of {fmt(p.students)})
                            </span>
                          </span>
                        {/each}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Calendar -->
    <div class="col-12 col-lg-3">
      <div class="card position-sticky" style="top: 12px;">
        <!-- <div class="card-body pt-3"> -->
        <Calendar bind:value={weekDate} />
        <!-- /div> -->
      </div>
    </div>
  </div>

  <!-- 3-month teacher line chart -->
  <div class="row pt-4">
    <div class="col">
      <WorkloadMonthChart
        {activeWeek}
        weeks={quarterWeeks}
        {perTeacher}
        on:select={(e) => (weekDate = e.detail.weekStart)}
      />
    </div>
  </div>

  <Toast bind:message={toastMessage} bind:show={showToast} />
</main>

<style>
  .week-badge {
    font-size: 0.6rem;
    padding: 0.35em 0.65em;
  }
  .dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
</style>
