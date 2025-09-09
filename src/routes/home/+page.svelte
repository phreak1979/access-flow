<script lang="ts">
  import type { User } from "$lib/user";
  export let data: { API_URL: string; token: string; user: User };
  let API_URL = data.API_URL;
  let TOKEN = data.token;
  let user: User = data.user;
  import dayjs from "dayjs";
  import customParseFormat from "dayjs/plugin/customParseFormat";
  dayjs.extend(customParseFormat);

  import { mondayYMD, weekLabel } from "$lib/helpers/weekhelpers";
  import { formatDate } from "$lib/helpers/dateformating";
  import Results from "$lib/components/Results.svelte";
  import type { Entry, Intake, Mode } from "$lib/types";
  import type { ProgramOption, ProgramsResponse, AccessListTypeWithLabel, CourseProfile, Totals } from "$lib/api";
  import { onMount } from "svelte";
  import { parseExcelFromArrayBuffer } from "$lib/parser";
  import Calendar from "$lib/components/Calendar.svelte";
  import FilterDrawer from "$lib/components/FilterDrawer.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import TeacherLoadChart from "$lib/components/TeacherLoadChart.svelte";
  import StudentsTotalsChart from "$lib/components/StudentsTotalChart.svelte";
  import UploadExcelModal from "$lib/components/UploadExcelModal.svelte";
  import { globalProgramId } from "$lib/stores/program";
  import SkeletonTable from "$lib/components/SkeletonTable.svelte";
  type CourseDict = Record<string, { name: string; teacher?: string }>;

  let courseProfile: CourseProfile[];
  let courseDict: CourseDict = {};
  let programOptions: ProgramOption[];
  let Programs: ProgramsResponse;
  let accessList: AccessListTypeWithLabel | null = null;
  let classTotals: Map<string, number> = new Map();
  let all: Entry[] = [];
  let filtered: Entry[] = [];
  let entries: Entry[] = [];

  let isLoading = false;
  let selectedText = "Classes and Courses";
  let selectedFile = "None";
  let intake: Intake | "" = "";
  let mode: Mode | "" = "";
  let courseQuery = "";
  let classId: string = "";
  let weekDate: string = "";
  let teacherQuery = "";
  let toastMessage = "Loading...";
  let showToast = true;
  let selectedProfile: number = 0;
  let showUpload = false;
  let selectedAccessListId: string = "0";
  let profileUpdatedBy: string = "";
  let profileUpdatedOn: string = "";
  let programId: number = 0;

  function handleUpdated(e: Event) {
    void e;
    loadPrograms();

    toastMessage = "File uploaded success...";
    showToast = false; // re-trigger
    showToast = true;
    showUpload = false;
  }

  async function loadClassTotals(StudentClass: string | Totals | null) {
    if (!StudentClass) {
      console.error("Class not set got program");
      classTotals = new Map();
      return;
    }

    const raw = StudentClass;

    try {
      if (Array.isArray(raw)) {
        // [{classId:"Aug25FT", total:66}, ...]
        classTotals = new Map(raw.map((r: any) => [String(r.classId), Number(r.total) || 0]));
      } else {
        // {"Aug25FT":66, ...}

        classTotals = new Map(Object.entries(raw).map(([k, v]) => [normId(k), Number(v) || 0]));
      }
    } catch (err) {
      console.error("Error calculating student numbers:", err);
      classTotals = new Map();
    }
  }

  async function loadCourseProfile() {
    // find returns ProgramOption | undefined
    const res = await fetch(
      `${API_URL}/items/courseprofile?fields=*,user_updated.first_name,user_updated.last_name&sort[]=-id&filter[program]=${programId}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
      },
    );

    let { data } = await res.json();
    courseProfile = data;
    if (courseProfile.length >= 1) {
      selectedProfile = courseProfile[0].id;
      setSelectedProfile(Number(selectedProfile));
    } else {
      selectedProfile = 0;
    }
  }

  async function handleProfileSelect(e: Event) {
    const target = e.target as HTMLSelectElement;
    console.log(target.value);
    setSelectedProfile(Number(target.value));

    applyFilters();
  }

  async function setSelectedProfile(id: number) {
    let course = courseProfile.find((x) => x.id == id);
    courseDict = course?.profile ?? {};
  }

  async function loadPrograms() {
    try {
      const res = await fetch(
        `${API_URL}/items/programs?fields=*,accesslist.id,accesslist.filename_download,accesslist.uploaded_on,accesslist.uploaded_by.first_name,accesslist.uploaded_by.last_name&filter[manager][directus_users_id][_eq]=${user.id}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TOKEN}`,
          },
        },
      );

      programOptions = [];
      accessList = {};
      Programs = [];

      let { data } = await res.json();
      programOptions = data;
      Programs = programOptions.map((p) => ({ value: p.name, id: p.id, name: p.name }));
      if (Programs.length >= 1) {
        loadAccessListandProfiles(Programs[0].id);
      }
    } catch (err) {
      console.error("DEBUGPRINT[58]: +page.svelte:110: err=", err);
    }
  }

  function onLoaded(e: CustomEvent<{ entries: Entry[] }>) {
    all = e.detail.entries;
    buildTotals();
    applyFilters();
    selectedText = "Uploaded file used...";
  }

  // ---- class options (scoped to intake/mode) ----
  $: classOptions = Array.from(
    new Set(all.filter((e) => (!intake || e.intake === intake) && (!mode || e.mode === mode)).map((e) => e.classId)),
  ).sort();

  $: if (classId && !classOptions.includes(classId)) classId = "";

  // active week: picked date's Monday, else today's Monday
  $: activeWeek = weekDate ? mondayYMD(weekDate) : mondayYMD(dayjs().format("YYYY-MM-DD"));

  // ---- totals per class+course ----
  let totalWeeks = new Map<string, number>();

  function buildTotals() {
    const map = new Map<string, number>();
    for (const e of all) {
      const k = `${e.classId}|${e.courseCode}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    totalWeeks = map;
  }

  // ---- filtering ----
  function applyFilters(showToast: boolean = true) {
    const q = courseQuery.trim().toUpperCase();
    const tq = teacherQuery.trim().toUpperCase();
    const weekStart = weekDate ? activeWeek : "";

    filtered = all.filter((e): e is Entry => {
      if (intake && e.intake !== intake) return false;
      if (mode && e.mode !== mode) return false;
      if (classId && e.classId !== classId) return false;

      if (q && !e.courseCode.toUpperCase().includes(q)) return false;

      if (tq) {
        const teacher = (courseDict[e.courseCode]?.teacher ?? "").toUpperCase();
        if (!teacher.includes(tq)) return false;
      }

      if (weekStart && e.date !== weekStart) return false;
      return true;
    });

    if (showToast) {
      // toast
      toastMessage = "Filters applied successfully!";
      showToast = false; // re-trigger
      showToast = true;
    }
  }

  // ---- full course timelines map ----
  $: fullByClassCourse = (() => {
    const m = new Map<string, Entry[]>();
    for (const e of all) {
      const k = `${e.classId}|${e.courseCode}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
    return m;
  })();

  // Next course per class+course, computed from the FULL dataset `all`
  $: nextByClassCourse = (() => {
    // group by class -> course -> entries[]
    const byClass = new Map<string, Map<string, Entry[]>>();
    for (const e of all) {
      let inner = byClass.get(e.classId);
      if (!inner) byClass.set(e.classId, (inner = new Map()));
      (inner.get(e.courseCode) ?? inner.set(e.courseCode, []).get(e.courseCode)!).push(e);
    }
    // sort each course's entries by date
    for (const map of byClass.values()) {
      for (const arr of map.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
    }

    // for each class, sort courses by first date and fill the "next" map
    const m = new Map<string, string | null>();
    for (const [classId, courseMap] of byClass.entries()) {
      const ordered = Array.from(courseMap.entries()).sort((a, b) => a[1][0].date.localeCompare(b[1][0].date)); // compare first day of each course

      ordered.forEach(([code], i) => {
        const next = ordered[i + 1]?.[0] ?? null;
        m.set(`${classId}|${code}`, next);
      });
    }
    return m;
  })();

  // build the “active filters” chip list (reactive) ----
  type Chip = { key: string; label: string };

  $: activeFilters = [
    intake && { key: "intake", label: `Intake: ${intake}` },
    mode && { key: "mode", label: `Mode: ${mode}` },
    classId && { key: "class", label: `Class: ${classId}` },
    courseQuery && { key: "course", label: `Course: ${courseQuery}` },
    teacherQuery && { key: "teacher", label: `Teacher: ${teacherQuery}` },
    weekDate && { key: "week", label: weekLabel(activeWeek) },
  ].filter(Boolean) as Chip[];

  function clearFilter(key: string) {
    if (key === "intake") intake = "";
    else if (key === "mode") mode = "";
    else if (key === "class") classId = "";
    else if (key === "course") courseQuery = "";
    else if (key === "teacher") teacherQuery = "";
    else if (key === "week") weekDate = "";
    applyFilters();
  }

  function clearAll() {
    intake = mode = courseQuery = classId = teacherQuery = weekDate = "";
    applyFilters();
  }

  export const normId = (raw: string): string => {
    if (!raw) return "";

    const s = raw.trim().replace(/\s+/g, " "); // collapse spaces

    // Case A: month year type? number?
    const re =
      /^(?<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(?<year>\d{2})\s*(?<type>P|F|PT|FT)?\s*(?:-)?\s*(?<num>\d+)?$/i;

    // Case B: type glued to year, e.g. Jan24PT 1
    const reAttached =
      /^(?<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(?<year>\d{2})(?<type>P|F|PT|FT)\s*(?:-)?\s*(?<num>\d+)?$/i;

    const m = s.match(re) || s.match(reAttached);
    if (!m || !m.groups) return s.toUpperCase(); // fallback to old behavior

    const month = m.groups.month![0].toUpperCase() + m.groups.month!.slice(1).toLowerCase();
    const year = m.groups.year!;

    // Normalize type: always expand to PT/FT
    let type = (m.groups.type || "").toUpperCase();
    if (type === "P") type = "PT";
    if (type === "F") type = "FT";

    const num = m.groups.num ? String(parseInt(m.groups.num, 10)) : "";

    // Only add pieces if they exist
    return `${month}${year}${type ? ` ${type}` : ""}${num ? ` - ${num}` : ""}`;
  };

  export async function loadFileFromDirectus(
    fileId: string,
    directusUrl: string,
    token: string, // short-lived user token
    signal?: AbortSignal, // optional: pass in for cancellation
  ) {
    try {
      isLoading = true; // 👈 start
      const base = directusUrl.replace(/\/+$/, "");
      const url = `${base}/assets/${fileId}`; // <- correct endpoint

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Directus download failed: HTTP ${res.status} ${text}`);
      }

      const buffer = await res.arrayBuffer();

      entries = await parseExcelFromArrayBuffer(buffer);
      entries = entries.map((e) => ({ ...e, classId: normId(e.classId) }));
      all = entries;
      buildTotals();
      applyFilters();
    } catch (err) {
      isLoading = true;

      console.error("Error loading Directus file:", err);
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    loadPrograms();
  });

  async function handleFileChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedText = target.options[target.selectedIndex].text;
    selectedFile = target.value;

    await loadFileFromDirectus(selectedFile, API_URL, TOKEN);
  }

  async function handleProgramSelect(e: Event) {
    const target = e.target as HTMLSelectElement;
    loadAccessListandProfiles(Number(target.value));
  }

  async function loadAccessListandProfiles(prgId: number) {
    try {
      isLoading = true;

      let foundProgram = programOptions.find((p) => p.id == prgId);

      if (!foundProgram) {
        accessList = {};
        selectedAccessListId = "0";
        return;
      }

      globalProgramId.set(foundProgram.id);
      programId = prgId;
      console.warn("DEBUGPRINT[90]: +page.svelte:374: programId=", programId);
      console.warn("DEBUGPRINT[90]: +page.svelte:374: programId=", typeof programId);
      await loadCourseProfile();
      const al = foundProgram?.accesslist;

      accessList = al
        ? {
            id: al.id ?? "0",
            value: al.id ?? "0",
            label: al.filename_download ?? "",
            filename_download: al.filename_download ?? "",
            uploaded_by_name: `${al.uploaded_by?.first_name ?? ""} ${al.uploaded_by?.last_name ?? ""}`.trim(),
            uploaded_on: formatDate(al.uploaded_on),
          }
        : null;

      selectedAccessListId = accessList?.id ?? "0";

      await loadFileFromDirectus(selectedAccessListId, API_URL, TOKEN);
      const classSize: Totals | null | string = foundProgram.class;

      loadClassTotals(classSize);
    } catch (err) {
      console.warn("DEBUGPRINT[70]: +page.svelte:407: err=", err);
    } finally {
      isLoading = false;
    }

    {
    }
  }

  // → "2025-09-02 20:28"
  $: (weekDate, applyFilters());
  $: programId = $globalProgramId;

  // $: programId = $globalProgramId;
</script>

<svelte:head><title>Access Flow | Teacher Classes</title></svelte:head>
<!-- <NewProfileModal bind:show={showUpload} /> -->
<UploadExcelModal bind:show={showUpload} {programId} directusUrl={API_URL} token={TOKEN} on:updated={handleUpdated} />
<div class="row">
  <div class="col">
    <h2>{selectedText}</h2>
  </div>
</div>

<div class="card">
  <div class="card-header">Program Options</div>
  <div class="card-body">
    <div class="row">
      <div class="col-4">
        <label for="programSelect" class="form-label fw-semibold me-2 text-nowrap">
          <i class="fa-solid fa-square-binary"></i> Programs
        </label>
        <select id="programSelect" class="form-select" on:change={handleProgramSelect} bind:value={programId}>
          <option value="0" selected>No Program Selected...</option>

          {#each Programs as program}
            <option value={program.id}>{program.name}</option>
          {/each}
        </select>
      </div>
      <div class="col-4">
        <label for="fileSelect" class="form-label fw-semibold me-2 text-nowrap">
          <i class="fa-solid fa-fingerprint"></i> Access List
        </label>

        <div class="d-flex gap-2">
          <select
            id="fileSelect"
            class="form-select flex-grow-1"
            bind:value={selectedAccessListId}
            on:change={handleFileChange}
          >
            <option value="0" selected>No Access List selected...</option>
            <!-- {#each accessList as list} -->
            <option value={accessList?.value}>{accessList?.label}</option>
            <!-- {/each} -->
          </select>

          <button type="button" class="btn btn-primary text-nowrap" on:click={() => (showUpload = true)}>
            <i class="fa-solid fa-upload"></i>
          </button>
        </div>
      </div>

      <!-- Second select: 4 columns -->
      <div class="col-4">
        <label for="courseSelect" class="form-label fw-semibold me-2"><i class="fa-solid fa-user"></i> Profile</label>
        <select class="form-select" id="courseSelect" bind:value={selectedProfile} on:change={handleProfileSelect}>
          <option value="0" selected>Select course profile...</option>

          {#each courseProfile as profile}
            <option value={profile.id}>{profile.name}</option>
          {/each}
        </select>
      </div>
    </div>
    <div class="row">
      <div class="col-4"></div>
      <div class="col-4">
        {#if accessList?.uploaded_by_name}
          <small>
            Uploaded by: {accessList.uploaded_by_name} on {accessList.uploaded_on ?? "-"}
          </small>
        {/if}
      </div>
      <div class="col-4">
        {#if profileUpdatedBy != ""}
          <small>Updated by: {profileUpdatedBy} on {profileUpdatedOn}</small>
        {/if}
      </div>
    </div>
  </div>
</div>

<div class="row align-items-center mb-3">
  <div class="row align-items-stretch">
    <div class="col-7">
      <TeacherLoadChart entries={filtered} {courseDict} {classTotals} title="Weekly load (filtered data)" />
    </div>

    <div class="col-2 pt-5">
      <StudentsTotalsChart {classTotals} title="Students per class" />
    </div>

    <div class="col-3 pt-2">
      <div class="card-header d-flex align-items-center justify-content-between">
        <!-- optional: any quick actions -->
      </div>
      <div class="card-body pt-4">
        <!-- Calendar fills the card body -->
        <Calendar bind:value={weekDate} />
      </div>
      <!-- </div> -->
    </div>
  </div>
  <!-- Count + active-filter chips -->
  <div class="mt-2 text-secondary small">
    Showing {filtered.length} rows ({new Set(filtered.map((f) => f.classId)).size} classes).
    {#if activeFilters.length}
      <span class="ms-2">• Filters:</span>
      {#each activeFilters as f}
        <span class="badge bg-info-subtle text-info-emphasis ms-1 d-inline-flex align-items-center">
          {f.label}
          <button
            type="button"
            class="btn btn-sm btn-link p-0 ms-1 text-info-emphasis text-decoration-none d-flex align-items-center"
            aria-label="Clear filter"
            on:click={() => clearFilter(f.key)}
          >
            <i class="fa fa-times"></i>
          </button>
        </span>
      {/each}
      <button class="btn btn-sm btn-outline-info ms-2 py-0" on:click={clearAll}> Clear all </button>
    {/if}
  </div>
</div>

<div class="row">
  <div class="col-12">
    {#if isLoading}
      <SkeletonTable rows={12} cols={8} title="Loading…" />
    {:else}
      <Results
        entries={filtered}
        weekMode={!!weekDate}
        {activeWeek}
        {fullByClassCourse}
        {courseDict}
        {classTotals}
        {nextByClassCourse}
      />
    {/if}
  </div>
</div>

<div class="col-12">
  <FilterDrawer
    bind:intake
    bind:mode
    bind:courseQuery
    bind:classId
    bind:weekDate
    bind:teacherQuery
    {classOptions}
    on:change={applyFilters}
    on:loaded={(e) => onLoaded(e)}
  />
</div>
<Toast bind:message={toastMessage} bind:show={showToast} />
