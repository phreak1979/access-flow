<script lang="ts">
  import type { User } from "$lib/user";
  export let data: { API_URL: string; token: string; user: User };
  let API_URL = data.API_URL;
  let TOKEN = data.token;
  let user: User = data.user;

  import dayjs from "dayjs";
  import customParseFormat from "dayjs/plugin/customParseFormat";
  dayjs.extend(customParseFormat);

  import Calendar from "$lib/components/Calendar.svelte";
  import Toast from "$lib/components/Toast.svelte";

  import { mondayYMD, weekLabel } from "$lib/helpers/weekhelpers";
  import { formatDate } from "$lib/helpers/dateformating";
  import { normId } from "$lib/helpers/norm-id";

  import { parseExcelFromArrayBuffer } from "$lib/parser";

  import type { Entry, Intake, Mode } from "$lib/types";
  import type { ProgramOption, ProgramsResponse, AccessListTypeWithLabel, CourseProfile, Totals } from "$lib/api";

  import { onMount } from "svelte";

  // ---------------------------
  // STATE (aligns with Home)
  // ---------------------------
  let classTotals: Map<string, number> = new Map();
  let all: Entry[] = []; // full parsed access list
  let rowsForWeek: Entry[] = []; // subset for the selected week (final-week only)
  let grouped: GroupRow[] = []; // table rows

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

  // ---------------------------
  // WEEK SELECTION (Calendar)
  // ---------------------------
  let weekDate = ""; // bound to <Calendar/>
  $: weekDateYMD = weekDate ? dayjs(weekDate).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
  $: activeWeek = mondayYMD(weekDateYMD); // Monday of picked week
  $: weekEnd = dayjs(activeWeek).add(6, "day").format("YYYY-MM-DD"); // Sunday of picked week

  // toasts
  let toastMessage = "";
  let showToast = false;
  function toast(msg: string) {
    toastMessage = msg;
    showToast = false;
    showToast = true;
  }

  // ---------------------------
  // FINAL-WEEK MAP
  // ---------------------------
  // For each classId|courseCode, track the last (max) weekStart found in `all`
  let lastWeekByClassCourse = new Map<string, string>();

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
  // DIRECTUS INTEGRATIONS
  // ---------------------------
  async function loadPrograms() {
    try {
      const res = await fetch(
        `${API_URL}/items/programs?fields=*,accesslist.id,accesslist.filename_download,accesslist.uploaded_on,accesslist.uploaded_by.first_name,accesslist.uploaded_by.last_name&filter[manager][directus_users_id][_eq]=${user.id}`,
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` } },
      );
      const { data } = await res.json();
      programOptions = data ?? [];
      Programs = programOptions.map((p) => ({ value: p.name, id: p.id, name: p.name }));
      console.warn("DEBUGPRINT[83]: +page.svelte:96: programOptions=", programOptions);
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
        // [{classId:"Aug25 FT - 1", total: 66}, ...]
        classTotals = new Map(studentClass.map((r: any) => [String(r.classId), Number(r.total) || 0]));
      } else {
        // {"Aug25 FT - 1": 66, ...}
        classTotals = new Map(Object.entries(studentClass).map(([k, v]) => [normId(k), Number(v) || 0]));
      }
    } catch (err) {
      console.error("Error calculating student numbers:", err);
      classTotals = new Map();
    }
  }

  async function loadCourseProfile(programId: number) {
    console.warn("DEBUGPRINT[125]: +page.svelte:123: programId=", programId);
    const res = await fetch(
      `${API_URL}/items/courseprofile?fields=*,user_updated.first_name,user_updated.last_name&sort[]=-id&filter[program]=${programId}`,
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` } },
    );
    const { data } = await res.json();
    courseProfile = data ?? [];
    console.warn("DEBUGPRINT[124]: +page.svelte:128: courseProfile=", courseProfile);
    selectedProfile = courseProfile[0]?.id;
    courseDict = courseProfile[0]?.profile ?? {};
  }

  async function handleProfileSelect(e: Event) {
    const target = e.target as HTMLSelectElement;
    const profile = courseProfile.find((x) => x.id == Number(target.value));
    courseDict = profile?.profile ?? {};
    // filters will re-run via reactive deps below
  }

  export async function loadFileFromDirectus(fileId: string, directusUrl: string, token: string, signal?: AbortSignal) {
    try {
      console.log("Load file from directus");
      const base = directusUrl.replace(/\/+$/, "");
      const url = `${base}/assets/${fileId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
      if (!res.ok) throw new Error(`Directus download failed: HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      console.warn("DEBUGPRINT[85]: +page.svelte:146: buffer=", buffer);
      let entries = await parseExcelFromArrayBuffer(buffer);
      console.warn("DEBUGPRINT[84]: +page.svelte:147: entries=", entries);

      // normalize classId exactly like Home
      entries = entries.map((e) => ({ ...e, classId: normId(e.classId) }));

      all = entries;
      // final-week map & filters will re-run via reactive deps below
      toast("Access List loaded");
    } catch (err) {
      console.error("Error loading Directus file:", err);
      toast("Error loading Access List");
    }
  }

  async function handleProgramSelect(e: Event) {
    const target = e.target as HTMLSelectElement;
    const programId = Number(target.value);

    // reset view state
    AccessLists = [];
    selectedAccessListId = "0";
    all = [];
    rowsForWeek = [];
    grouped = [];
    courseProfile = [];
    courseDict = {};
    classTotals = new Map();
    lastWeekByClassCourse = new Map();

    if (!programId) return;

    const p = programOptions.find((x) => x.id === programId);

    // access list (latest)
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
      await loadFileFromDirectus(selectedAccessListId, API_URL, TOKEN);
    }

    // class totals
    await loadClassTotals(p?.class ?? null);

    // course profile (teacher map)
    await loadCourseProfile(programId);
  }

  async function handleFileChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedAccessListId = target.value;
    if (selectedAccessListId && selectedAccessListId !== "0") {
      await loadFileFromDirectus(selectedAccessListId, API_URL, TOKEN);
    }
  }

  // ---------------------------
  // BUILD (FINAL-WEEK ONLY) + GROUPING
  // ---------------------------
  type GroupRow = {
    key: string; // `${classId}|${courseCode}`
    classId: string;
    courseCode: string;
    courseName: string;
    teacher?: string;
    weekStart: string; // activeWeek (Mon)
    delivery: string; // Mon + 6 (Sun)
    gradingDeadline: string; // delivery + 21 days
    daysLeft: number; // from today
    totalStudents: number; // from classTotals
    submittedCount: number; // optional, if tracked
    missingCount: number; // total - submitted
  };

  function groupRows() {
    const delivery = weekEnd; // Sunday for this week
    const deadline = dayjs(delivery).add(21, "day").format("YYYY-MM-DD");
    const today0 = dayjs().startOf("day");

    const map = new Map<string, GroupRow>();

    for (const r of rowsForWeek) {
      const key = `${r.classId}|${r.courseCode}`;
      if (!map.has(key)) {
        const teacher = courseDict?.[r.courseCode]?.teacher;
        const total = classTotals.get(r.classId) ?? 0;

        map.set(key, {
          key,
          classId: r.classId,
          courseCode: r.courseCode,
          courseName: r.courseName ?? r.courseCode,
          teacher,
          weekStart: activeWeek,
          delivery,
          gradingDeadline: deadline,
          daysLeft: dayjs(deadline).diff(today0, "day"),
          totalStudents: total,
          submittedCount: 0,
          missingCount: total,
        });
      }

      // If your rows contain a submission flag/date, count here:
      if ((r as any).submitted_at) {
        const g = map.get(key)!;
        g.submittedCount += 1;
        g.missingCount = Math.max(0, g.totalStudents - g.submittedCount);
      }
    }

    grouped = Array.from(map.values()).sort(
      (a, b) => a.classId.localeCompare(b.classId) || a.courseCode.localeCompare(b.courseCode),
    );
  }

  // ---------------------------
  // FILTERS (final-week only)
  // ---------------------------
  function applyFilters() {
    if (!all.length) {
      rowsForWeek = [];
      grouped = [];
      return;
    }

    // Base: entries for the selected calendar week AND only those pairs whose
    // final (max) week equals this selected week.
    const base = all.filter((e) => {
      if (e.date !== activeWeek) return false;
      const key = `${e.classId}|${e.courseCode}`;
      return lastWeekByClassCourse.get(key) === e.date;
    });

    const q = courseQuery.trim().toUpperCase();
    const tq = teacherQuery.trim().toUpperCase();

    rowsForWeek = base.filter((e) => {
      if (intake && e.intake !== intake) return false;
      if (mode && e.mode !== mode) return false;
      if (classId && e.classId !== classId) return false;
      if (q && !e.courseCode.toUpperCase().includes(q)) return false;

      if (tq) {
        const t = (courseDict[e.courseCode]?.teacher ?? "").toUpperCase();
        if (!t.includes(tq)) return false;
      }
      return true;
    });

    groupRows();
  }

  // class dropdown shows ALL classes (planning)
  $: classOptions = Array.from(
    new Set(all.filter((e) => (!intake || e.intake === intake) && (!mode || e.mode === mode)).map((e) => e.classId)),
  ).sort();
  $: if (classId && !classOptions.includes(classId)) classId = "";

  // CSV export
  function exportCSV() {
    const header = [
      "classId",
      "courseCode",
      "courseName",
      "teacher",
      "weekStart",
      "delivery",
      "gradingDeadline",
      "daysLeft",
      "totalStudents",
      "submittedCount",
      "missingCount",
    ];
    const lines = [header.join(",")];

    for (const g of grouped) {
      lines.push(
        [
          g.classId,
          g.courseCode,
          g.courseName,
          g.teacher ?? "",
          g.weekStart,
          g.delivery,
          g.gradingDeadline,
          String(g.daysLeft),
          String(g.totalStudents),
          String(g.submittedCount),
          String(g.missingCount),
        ]
          .map((x) => JSON.stringify(x))
          .join(","),
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grading_deadlines_${activeWeek}_to_${weekEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------
  // REACTIVE WIRING (this is the key fix)
  // ---------------------------

  // 1) Rebuild the final-week map whenever the access list changes
  $: if (all.length) {
    buildLastWeekMap();
  }

  // 2) Re-apply filters whenever ANY relevant dependency changes
  //    (calendar week, access list switch, profile/teacher map, class totals, or UI filters)
  $: {
    // Touch dependencies so Svelte tracks them:
    const _deps = {
      weekDateYMD,
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
    // Now re-filter:
    applyFilters();
  }

  onMount(loadPrograms);
</script>

<svelte:head><title>Grading deadlines</title></svelte:head>

<main class="container-fluid pt-2">
  <!-- Header + calendar -->
  <div class="row g-3 align-items-start">
    <div class="col-9">
      <h2 class="mb-1">Grading deadlines</h2>
      <div class="small text-muted">
        Final-week view • Week: {weekLabel(activeWeek)} • Mon {activeWeek} → Sun {weekEnd} • Deadline = +21 days
      </div>
    </div>
    <div class="col-3">
      <div class="card">
        <div class="card-body pt-3">
          <Calendar bind:value={weekDate} />
        </div>
      </div>
    </div>
  </div>

  <!-- Program / Access list / Profile -->
  <div class="card mt-3">
    <div class="card-header">Program Options</div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-4">
          <label class="form-label fw-semibold"><i class="fa-solid fa-square-binary"></i> Programs</label>
          <select class="form-select" on:change={handleProgramSelect}>
            <option value="0" selected>No Program Selected...</option>
            {#each Programs as program}
              <option value={program.id}>{program.name}</option>
            {/each}
          </select>
        </div>

        <div class="col-4">
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

        <div class="col-4">
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

  <!-- Filters -->
  <div class="card mt-3">
    <div class="card-header">Filters</div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-2">
          <label class="form-label">Intake</label>
          <input class="form-control" bind:value={intake} placeholder="e.g. Jan24" />
        </div>
        <div class="col-2">
          <label class="form-label">Mode</label>
          <input class="form-control" bind:value={mode} placeholder="PT / FT" />
        </div>
        <div class="col-3">
          <label class="form-label">Class</label>
          <select class="form-select" bind:value={classId}>
            <option value="">All classes</option>
            {#each classOptions as c}
              <option value={c}>{c}</option>
            {/each}
          </select>
        </div>
        <div class="col-3">
          <label class="form-label">Course code</label>
          <input class="form-control" bind:value={courseQuery} placeholder="e.g. FE101" />
        </div>
        <div class="col-2">
          <label class="form-label">Teacher</label>
          <input class="form-control" bind:value={teacherQuery} placeholder="name" />
        </div>
      </div>
      <div class="mt-2 text-secondary small">
        Showing {grouped.length} course groups (final weeks only) in {weekLabel(activeWeek)}.
      </div>
    </div>
  </div>

  <!-- Table -->
  <div class="card mt-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span>Deadlines by Class & Course (Final Week)</span>
      <div class="d-flex align-items-center gap-2">
        <span class="small text-muted">Delivery = Sun, Deadline = +21 days</span>
        <button class="btn btn-sm btn-outline-secondary" on:click={exportCSV}>
          <i class="fa-solid fa-file-csv me-1"></i> Export CSV
        </button>
      </div>
    </div>
    <div class="card-body">
      {#if grouped.length === 0}
        <div class="alert alert-warning mb-0">No final-week courses in the selected week. Pick another date.</div>
      {:else}
        <div class="table-responsive">
          <table class="table table-sm align-middle">
            <thead class="table-light">
              <tr>
                <th>Class</th>
                <th>Course</th>
                <th>Teacher</th>
                <th>Week (Mon)</th>
                <th>Delivery (Sun)</th>
                <th>Grading deadline</th>
                <th>Time</th>
                <th class="text-end">Students</th>
                <th class="text-end">Submitted</th>
                <th class="text-end">Missing</th>
              </tr>
            </thead>
            <tbody>
              {#each grouped as g}
                <tr>
                  <td>{g.classId}</td>
                  <td><span class="fw-semibold">{g.courseCode}</span> <span class="text-muted">{g.courseName}</span></td
                  >
                  <td>{g.teacher ?? "-"}</td>
                  <td>{g.weekStart}</td>
                  <td>{g.delivery}</td>
                  <td>{g.gradingDeadline}</td>
                  <td>
                    {#if g.daysLeft > 10}
                      <span class="badge bg-success">{g.daysLeft} days left</span>
                    {:else if g.daysLeft >= 0}
                      <span class="badge bg-warning text-dark">{g.daysLeft} days left</span>
                    {:else}
                      <span class="badge bg-danger">{Math.abs(g.daysLeft)} days overdue</span>
                    {/if}
                  </td>
                  <td class="text-end">{g.totalStudents}</td>
                  <td class="text-end">{g.submittedCount}</td>
                  <td class="text-end">{g.missingCount}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>

  <Toast bind:message={toastMessage} bind:show={showToast} />
</main>
