<script lang="ts">
  // ====== CONFIG ======
  import type { User } from "$lib/user";
  export let data: { API_URL: string; token: string; user: User };
  export let baseUrl = "http://192.168.137.63:85";
  export let token: string = data.token;
  export let programId: number = 4;

  // ====== Types ======
  type ApiList<T> = { data: T[] };

  type NormCat = "KNOWLEDGE" | "SKILL" | "GENERAL_COMPETENCE";
  const CAT_ORDER: NormCat[] = ["KNOWLEDGE", "SKILL", "GENERAL_COMPETENCE"];
  const CAT_LABEL: Record<NormCat, string> = {
    KNOWLEDGE: "Knowledge",
    SKILL: "Skill",
    GENERAL_COMPETENCE: "General Competence",
  };

  type RawLOS = Record<string, any> | null;
  type LOSBuckets = Record<NormCat, string[]>;
  type LOSKeyNames = { knowledgeKey: string; skillKey: string; competenceKey: string };

  // API rows
  type ProgramRow = { id: number; los: RawLOS };
  type CourseRow = { id: number; los: RawLOS; name: string; order?: number | null };
  type LessonRow = {
    id: number;
    name: string;
    topics?: string | null;
    module: number;
    los: RawLOS;
  };
  type ModuleRow = {
    id: number;
    course: number;
    name?: string | null;
    title?: string | null;
    order?: number | null;
    lessons: LessonRow[];
  };

  // UI models
  type PLO = { text: string; normCat: NormCat };
  type CLO = { text: string; normCat: NormCat };
  type Lesson = {
    id: number;
    title: string;
    topics?: string | null;
    moduleId: number;
    los: CLO[];
    losKeys: LOSKeyNames; // preserve keys for PATCH
  };
  type Module = {
    id: number;
    course: number;
    name?: string | null;
    title?: string | null;
    order?: number | null;
    lessons: Lesson[];
  };
  type Course = { id: number; name: string; order?: number | null };

  // ====== State ======
  let loading = false;
  let errorMsg: string | null = null;

  let programPlos: PLO[] = [];

  let courses: Course[] = [];
  let selectedCourseId: number | null = null;

  let modules: Module[] = [];
  let lessons: Lesson[] = []; // flattened
  let courseClos: CLO[] = [];

  // Remember exact LOS keys for the selected course (for PATCH)
  let courseLosKeyNames: LOSKeyNames = {
    knowledgeKey: "knowledge",
    skillKey: "skill",
    competenceKey: "competence",
  };

  // ====== Helpers ======
  function getErrMessage(e: unknown): string {
    if (e && typeof e === "object" && "message" in e) {
      // @ts-ignore
      return String((e as any).message);
    }
    return String(e);
  }

  function coerceStrArray(v: any): string[] {
    if (!v) return [];
    const arr = Array.isArray(v) ? v : [v];
    return arr.map(String).filter((s) => s != null && s !== "");
  }

  function pickExistingKey(obj: any, logical: "knowledge" | "skill" | "competence", fallback: string) {
    if (obj && typeof obj === "object") {
      const hit = Object.keys(obj).find((k) => k.toLowerCase() === logical);
      if (hit) return hit;
    }
    return fallback;
  }
  // READ: flex normalize (case-insensitive)
  function normalizeLOSFlexible(raw: RawLOS): LOSBuckets {
    const obj = raw || {};
    const lower: Record<string, any> = {};
    for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
    return {
      KNOWLEDGE: coerceStrArray(lower["knowledge"]),
      SKILL: coerceStrArray(lower["skill"]),
      GENERAL_COMPETENCE: coerceStrArray(lower["competence"]),
    };
  }
  // READ + remember keys
  function normalizeLOSWithKeys(raw: RawLOS): { buckets: LOSBuckets; keys: LOSKeyNames } {
    const obj = raw || {};
    const knowledgeKey = pickExistingKey(obj, "knowledge", "knowledge");
    const skillKey = pickExistingKey(obj, "skill", "skill");
    const competenceKey = pickExistingKey(obj, "competence", "competence");
    const buckets: LOSBuckets = {
      KNOWLEDGE: coerceStrArray(obj?.[knowledgeKey]),
      SKILL: coerceStrArray(obj?.[skillKey]),
      GENERAL_COMPETENCE: coerceStrArray(obj?.[competenceKey]),
    };
    return { buckets, keys: { knowledgeKey, skillKey, competenceKey } };
  }

  function entriesFromLOS(los: LOSBuckets): CLO[] {
    const out: CLO[] = [];
    for (const cat of CAT_ORDER) for (const t of los[cat]) out.push({ text: t, normCat: cat });
    return out;
  }

  function groupBy<T, K>(arr: T[], key: (x: T) => K): Map<K, T[]> {
    const m = new Map<K, T[]>();
    for (const item of arr) {
      const k = key(item);
      (m.get(k) || m.set(k, [] as T[]).get(k)!).push(item);
    }
    return m;
  }

  function selectedCourseName(): string {
    const c = courses.find((x) => x.id === selectedCourseId);
    return c?.name ?? String(selectedCourseId ?? "");
  }
  function cloKey(o: CLO) {
    return `${o.normCat}::${o.text}`;
  }

  // ====== Fetcher ======
  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...(init || {}),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${txt ? ` — ${txt}` : ""}`);
    }
    return res.json() as Promise<T>;
  }

  // ====== Loaders ======
  async function loadProgramOutcomes() {
    const res = await fetchJson<ApiList<ProgramRow>>(`/items/programs?fields=id,los`);
    const row = (res.data || []).find((r) => r.id === programId);
    const los = normalizeLOSFlexible(row?.los ?? null);
    programPlos = entriesFromLOS(los);
  }

  async function loadCoursesForProgram() {
    const res = await fetchJson<ApiList<CourseRow>>(
      `/items/courses?fields=id,los,name,order&sort=order&filter[program]=${programId}`,
    );
    courses = (res.data || [])
      .map((c) => ({ id: c.id, name: c.name, order: c.order ?? null }))
      .sort((a, b) => {
        const ao = a.order ?? Number.POSITIVE_INFINITY;
        const bo = b.order ?? Number.POSITIVE_INFINITY;
        if (ao !== bo) return ao - bo;
        return a.id - b.id;
      });

    if (courses.length >= 1) {
      selectedCourseId = courses[0].id;
      selectCourseByID(selectedCourseId);
    }
  }

  async function loadCourseClos(courseId: number) {
    const res = await fetchJson<ApiList<CourseRow>>(
      `/items/courses?fields=id,los,name&filter[id][_eq]=${courseId}&filter[program]=${programId}`,
    );
    const row = (res.data || [])[0];
    const { buckets, keys } = normalizeLOSWithKeys(row?.los ?? null);
    courseLosKeyNames = keys;
    courseClos = entriesFromLOS(buckets).sort((a, b) =>
      a.normCat === b.normCat ? a.text.localeCompare(b.text) : a.normCat.localeCompare(b.normCat),
    );
  }

  async function loadModulesAndLessons(courseId: number) {
    const res = await fetchJson<ApiList<ModuleRow>>(
      `/items/modules?fields=id,course,name,title,order,lessons.*&filter[course]=${courseId}`,
    );
    modules = (res.data || []).map((m) => ({
      id: m.id,
      course: m.course,
      name: m.name ?? null,
      title: m.title ?? null,
      order: m.order ?? null,
      lessons: (m.lessons || []).map((l) => {
        const { buckets, keys } = normalizeLOSWithKeys(l.los ?? null);
        return {
          id: l.id,
          title: l.name,
          topics: l.topics ?? null,
          moduleId: m.id,
          los: entriesFromLOS(buckets),
          losKeys: keys,
        };
      }),
    }));
    lessons = modules.flatMap((m) => m.lessons);
  }

  // ====== Derivations ======
  $: byCatPLO = groupBy(programPlos, (o) => o.normCat);
  $: countByCatPLO = new Map<NormCat, number>(CAT_ORDER.map((c) => [c, (byCatPLO.get(c) || []).length]));

  $: byCatCLO = groupBy(courseClos, (o) => o.normCat);
  $: countByCatCLO = new Map<NormCat, number>(CAT_ORDER.map((c) => [c, (byCatCLO.get(c) || []).length]));

  $: usedCloKeySet = new Set(lessons.flatMap((l) => l.los.map(cloKey)));
  $: unassignedCountByCatCLO = new Map<NormCat, number>(
    CAT_ORDER.map((c) => [c, (byCatCLO.get(c) || []).filter((o) => !usedCloKeySet.has(cloKey(o))).length]),
  );
  $: totalUnassignedCLO = courseClos.filter((o) => !usedCloKeySet.has(cloKey(o))).length;

  $: lessonsByModule = groupBy(lessons, (l) => l.moduleId);

  $: moduleLos = new Map<number, CLO[]>();
  $: {
    moduleLos.clear();
    for (const [mid, arr] of lessonsByModule.entries()) {
      const uniq = new Map<string, CLO>();
      for (const le of arr)
        for (const lo of le.los) {
          const k = cloKey(lo);
          if (!uniq.has(k)) uniq.set(k, lo);
        }
      moduleLos.set(mid, Array.from(uniq.values()));
    }
  }

  // ====== UI helpers ======
  function shortCat(c: NormCat) {
    return c === "KNOWLEDGE" ? "K" : c === "SKILL" ? "S" : "GC";
  }
  function catBadgeClass(c: NormCat) {
    return c === "KNOWLEDGE" ? "text-bg-info" : c === "SKILL" ? "text-bg-yellow" : "text-bg-success";
  }
  function moduleHeading(m: Module) {
    const base = m.title ?? m.name ?? `Module ${m.id}`;
    return m.order != null ? `Module ${m.order} — ${base}` : base;
  }

  // ====== CLO: add / edit / delete ======
  let showAddCloModal = false;
  let cloName = "";
  let cloCat: NormCat = "KNOWLEDGE";
  let cloSaving = false;
  let cloError: string | null = null;
  let editingClo: CLO | null = null; // when set, we're editing this CLO

  function openAddCloModal() {
    editingClo = null;
    cloName = "";
    cloCat = "KNOWLEDGE";
    cloError = null;
    showAddCloModal = true;
  }
  function openEditCloModal(clo: CLO) {
    editingClo = clo;
    cloName = clo.text;
    cloCat = clo.normCat;
    cloError = null;
    showAddCloModal = true;
  }

  // shared helper: fetch current course row, get buckets+keys, let mutator change buckets, then PATCH
  async function mutateCourseLos(mutator: (b: LOSBuckets) => void) {
    const res = await fetchJson<ApiList<CourseRow>>(
      `/items/courses?fields=id,los&filter[id][_eq]=${selectedCourseId}&filter[program]=${programId}`,
    );
    const row = (res.data || [])[0] ?? { los: null };
    const { buckets, keys } = normalizeLOSWithKeys(row.los ?? null);

    mutator(buckets);

    const payload = {
      los: {
        [keys.knowledgeKey]: buckets.KNOWLEDGE,
        [keys.skillKey]: buckets.SKILL,
        [keys.competenceKey]: buckets.GENERAL_COMPETENCE,
      },
    };
    await fetchJson(`/items/courses/${selectedCourseId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function saveClo() {
    if (!cloName.trim()) {
      cloError = "Please enter an outcome description.";
      return;
    }
    if (!selectedCourseId) {
      cloError = "No course selected.";
      return;
    }
    cloSaving = true;
    cloError = null;
    try {
      if (editingClo) {
        // EDIT: remove old (by exact text+cat), then add new (maybe same cat)
        const original = editingClo;
        await mutateCourseLos((b) => {
          const removeFrom =
            original.normCat === "KNOWLEDGE"
              ? b.KNOWLEDGE
              : original.normCat === "SKILL"
                ? b.SKILL
                : b.GENERAL_COMPETENCE;
          const idx = removeFrom.findIndex((t) => t.trim() === original.text.trim());
          if (idx !== -1) removeFrom.splice(idx, 1);

          const toAdd = cloName.trim();
          const addTo = cloCat === "KNOWLEDGE" ? b.KNOWLEDGE : cloCat === "SKILL" ? b.SKILL : b.GENERAL_COMPETENCE;

          if (!addTo.some((t) => t.trim() === toAdd)) addTo.push(toAdd);
        });
      } else {
        // ADD
        await mutateCourseLos((b) => {
          const toAdd = cloName.trim();
          const list = cloCat === "KNOWLEDGE" ? b.KNOWLEDGE : cloCat === "SKILL" ? b.SKILL : b.GENERAL_COMPETENCE;
          if (!list.some((t) => t.trim() === toAdd)) list.push(toAdd);
        });
      }

      await loadCourseClos(selectedCourseId);
      showAddCloModal = false;
      editingClo = null;
    } catch (e) {
      cloError = getErrMessage(e);
    } finally {
      cloSaving = false;
    }
  }

  async function deleteClo(clo: CLO) {
    if (!selectedCourseId) return;
    const ok = confirm(`Delete this course outcome?\n\n[${CAT_LABEL[clo.normCat]}] ${clo.text}`);
    if (!ok) return;
    try {
      await mutateCourseLos((b) => {
        const bucket =
          clo.normCat === "KNOWLEDGE" ? b.KNOWLEDGE : clo.normCat === "SKILL" ? b.SKILL : b.GENERAL_COMPETENCE;
        const idx = bucket.findIndex((t) => t.trim() === clo.text.trim());
        if (idx !== -1) bucket.splice(idx, 1);
      });
      await loadCourseClos(selectedCourseId);
    } catch (e) {
      alert(getErrMessage(e));
    }
  }

  // ====== Modules: add / edit / delete ======
  let showAddModuleModal = false;
  let moduleSaving = false;
  let moduleError: string | null = null;
  let moduleName = "";
  let moduleTitle = "";
  let moduleOrder: number | null = null;
  let editingModule: Module | null = null;

  function openAddModuleModal() {
    editingModule = null;
    moduleName = "";
    moduleTitle = "";
    moduleOrder = null;
    moduleError = null;
    showAddModuleModal = true;
  }
  function openEditModuleModal(m: Module) {
    editingModule = m;
    moduleName = m.name ?? "";
    moduleTitle = m.title ?? "";
    moduleOrder = m.order ?? null;
    moduleError = null;
    showAddModuleModal = true;
  }

  async function saveModule() {
    if (!selectedCourseId) {
      moduleError = "No course selected.";
      return;
    }
    moduleSaving = true;
    moduleError = null;
    try {
      if (editingModule) {
        // PATCH existing module
        const payload: any = {};
        payload.name = moduleName.trim() || null;
        payload.title = moduleTitle.trim() || null;
        if (moduleOrder != null && !Number.isNaN(moduleOrder)) payload.order = moduleOrder;
        else payload.order = null;

        await fetchJson(`/items/modules/${editingModule.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        // POST new module
        const payload: any = { course: selectedCourseId };
        if (moduleName.trim()) payload.name = moduleName.trim();
        if (moduleTitle.trim()) payload.title = moduleTitle.trim();
        if (moduleOrder != null && !Number.isNaN(moduleOrder)) payload.order = moduleOrder;
        await fetchJson(`/items/modules`, { method: "POST", body: JSON.stringify(payload) });
      }

      await loadModulesAndLessons(selectedCourseId);
      showAddModuleModal = false;
      editingModule = null;
    } catch (e) {
      moduleError = getErrMessage(e);
    } finally {
      moduleSaving = false;
    }
  }

  async function deleteModule(mid: number) {
    if (!selectedCourseId) return;
    const ok = confirm(`Delete module #${mid}? This will remove the module and its lessons.`);
    if (!ok) return;
    try {
      await fetchJson(`/items/modules/${mid}`, { method: "DELETE" });
      await loadModulesAndLessons(selectedCourseId);
    } catch (e) {
      alert(getErrMessage(e));
    }
  }

  // ====== Lessons: add / edit / delete ======
  let showAddLessonModal = false;
  let lessonSaving = false;
  let lessonError: string | null = null;
  let lessonModuleId: number | null = null;
  let lessonName = "";
  let lessonTopics = "";
  let editingLesson: Lesson | null = null;

  function openAddLessonModal(moduleId: number) {
    editingLesson = null;
    lessonModuleId = moduleId;
    lessonName = "";
    lessonTopics = "";
    lessonError = null;
    showAddLessonModal = true;
  }
  function openEditLessonModal(l: Lesson) {
    editingLesson = l;
    lessonModuleId = l.moduleId;
    lessonName = l.title;
    lessonTopics = l.topics ?? "";
    lessonError = null;
    showAddLessonModal = true;
  }

  async function saveLesson() {
    if (!selectedCourseId || !lessonModuleId) {
      lessonError = "No course/module selected.";
      return;
    }
    if (!lessonName.trim()) {
      lessonError = "Please enter a lesson title.";
      return;
    }
    lessonSaving = true;
    lessonError = null;
    try {
      if (editingLesson) {
        await fetchJson(`/items/lessons/${editingLesson.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: lessonName.trim(), topics: lessonTopics.trim() || null }),
        });
      } else {
        await fetchJson(`/items/lessons`, {
          method: "POST",
          body: JSON.stringify({
            name: lessonName.trim(),
            topics: lessonTopics.trim() || null,
            module: lessonModuleId,
            los: null,
          }),
        });
      }
      await loadModulesAndLessons(selectedCourseId);
      showAddLessonModal = false;
      editingLesson = null;
    } catch (e) {
      lessonError = getErrMessage(e);
    } finally {
      lessonSaving = false;
    }
  }

  async function deleteLesson(l: Lesson) {
    if (!selectedCourseId) return;
    const ok = confirm(`Delete lesson "${l.title}" (#${l.id})?`);
    if (!ok) return;
    try {
      await fetchJson(`/items/lessons/${l.id}`, { method: "DELETE" });
      await loadModulesAndLessons(selectedCourseId);
    } catch (e) {
      alert(getErrMessage(e));
    }
  }

  // ====== DnD: attach/remove LOs on lessons ======
  function onCloDragStart(e: DragEvent, clo: CLO) {
    e.dataTransfer?.setData("application/json", JSON.stringify({ normCat: clo.normCat, text: clo.text }));
    e.dataTransfer!.effectAllowed = "copy";
  }
  function onLessonDragOver(e: DragEvent) {
    e.preventDefault(); // allow drop
    e.dataTransfer!.dropEffect = "copy";
  }
  async function onLessonDrop(e: DragEvent, l: Lesson) {
    e.preventDefault();
    try {
      const raw = e.dataTransfer?.getData("application/json");
      if (!raw) return;
      const dropped: CLO = JSON.parse(raw);
      await addLoToLesson(l, dropped);
    } catch (err) {
      alert(getErrMessage(err));
    }
  }

  function toBucketsFromCLOs(arr: CLO[]): LOSBuckets {
    return {
      KNOWLEDGE: arr.filter((a) => a.normCat === "KNOWLEDGE").map((a) => a.text),
      SKILL: arr.filter((a) => a.normCat === "SKILL").map((a) => a.text),
      GENERAL_COMPETENCE: arr.filter((a) => a.normCat === "GENERAL_COMPETENCE").map((a) => a.text),
    };
  }

  async function addLoToLesson(l: Lesson, clo: CLO) {
    if (l.los.some((x) => x.normCat === clo.normCat && x.text === clo.text)) return; // already present
    const next = [...l.los, clo];
    const buckets = toBucketsFromCLOs(next);
    const payload = {
      los: {
        [l.losKeys.knowledgeKey]: buckets.KNOWLEDGE,
        [l.losKeys.skillKey]: buckets.SKILL,
        [l.losKeys.competenceKey]: buckets.GENERAL_COMPETENCE,
      },
    };
    await fetchJson(`/items/lessons/${l.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    await loadModulesAndLessons(selectedCourseId!);
  }

  async function removeLoFromLesson(l: Lesson, clo: CLO) {
    const next = l.los.filter((x) => !(x.normCat === clo.normCat && x.text === clo.text));
    const buckets = toBucketsFromCLOs(next);
    const payload = {
      los: {
        [l.losKeys.knowledgeKey]: buckets.KNOWLEDGE,
        [l.losKeys.skillKey]: buckets.SKILL,
        [l.losKeys.competenceKey]: buckets.GENERAL_COMPETENCE,
      },
    };
    await fetchJson(`/items/lessons/${l.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    await loadModulesAndLessons(selectedCourseId!);
  }

  // ====== Course selector handler ======
  async function onSelectCourse(e: Event) {
    const id = Number((e.target as HTMLSelectElement).value || 0);
    await selectCourseByID(Number(id));
  }

  async function selectCourseByID(id: number) {
    selectedCourseId = id || null;
    if (!selectedCourseId) return;
    loading = true;
    errorMsg = null;
    try {
      await Promise.all([loadCourseClos(selectedCourseId), loadModulesAndLessons(selectedCourseId)]);
    } catch (err) {
      errorMsg = getErrMessage(err);
    } finally {
      loading = false;
    }
  }

  // ====== Tabs ======
  let activeTabPLO: NormCat = "KNOWLEDGE";
  let activeTabCLO: NormCat = "KNOWLEDGE";

  // ====== Initial load ======
  (async () => {
    loading = true;
    try {
      await Promise.all([loadProgramOutcomes(), loadCoursesForProgram()]);
    } catch (e) {
      errorMsg = getErrMessage(e);
    } finally {
      loading = false;
    }
  })();
</script>

<div class="container py-4">
  <div class="d-flex align-items-center justify-content-between mb-3">
    <h1 class="h4 mb-0">Study Plan Planner</h1>
    <div class="d-flex gap-2">
      <button class="btn btn-sm btn-outline-secondary" disabled title="Program LOs come from program.los">
        + Program Outcome
      </button>
      {#if selectedCourseId}
        <button class="btn btn-sm btn-outline-primary" on:click={openAddCloModal}>+ Course Outcome</button>
        <button class="btn btn-sm btn-outline-success" on:click={openAddModuleModal}>+ Module</button>
      {/if}
    </div>
  </div>

  {#if errorMsg}<div class="alert alert-danger">{errorMsg}</div>{/if}

  <!-- Course selector -->
  <div class="mb-3">
    <label class="form-label">Course</label>
    <select class="form-select" on:change={onSelectCourse} bind:value={selectedCourseId}>
      <option value={0}>Select a course…</option>
      {#each courses as c}
        <option value={c.id}>
          {c.order != null ? `${c.order}. ` : ""}{c.name}
        </option>
      {/each}
    </select>
  </div>

  {#if selectedCourseId}
    <!-- Course Outcomes (Tabbed, with unassigned indicators + row actions) -->
    <div class="card mb-4">
      <div class="card-header d-flex align-items-center justify-content-between">
        <strong>Course Learning Outcomes</strong>
        <div class="d-flex align-items-center gap-2">
          {#if totalUnassignedCLO != 0}
            <span class="badge text-bg-warning" title="CLOs not used by any lesson"
              >Unassigned:<i class="fa-solid fa-triangle-exclamation"></i> {totalUnassignedCLO}</span
            >
          {/if}
          <div class="btn-group btn-group-sm" role="tablist" aria-label="CLO categories">
            {#each CAT_ORDER as cat}
              <button
                type="button"
                class={"btn " + (activeTabCLO === cat ? "btn-primary" : "btn-outline-primary")}
                aria-selected={activeTabCLO === cat}
                aria-controls={`clo-tab-${cat}`}
                on:click={() => (activeTabCLO = cat)}
              >
                {CAT_LABEL[cat]}
                <span class="badge text-bg-light ms-2">{countByCatCLO.get(cat) || 0}</span>
                {#if unassignedCountByCatCLO.get(cat) != 0}
                  <span class="badge text-bg-warning ms-1">{unassignedCountByCatCLO.get(cat) || 0}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <div class="card-body p-0">
        {#each CAT_ORDER as cat}
          {#if activeTabCLO === cat}
            <div id={`clo-tab-${cat}`} role="tabpanel" class="tab-pane p-3">
              <div class="tab-scroll">
                <ul class="list-group list-group-flush small border rounded">
                  {#each byCatCLO.get(cat) || [] as o}
                    <li
                      class="list-group-item d-flex align-items-center justify-content-between gap-2"
                      draggable="true"
                      on:dragstart={(e) => onCloDragStart(e, o)}
                      title="Drag to a lesson to add"
                    >
                      <div class="d-flex align-items-center gap-2">
                        {#if !usedCloKeySet.has(`${o.normCat}::${o.text}`)}
                          <span class="badge bg-warning text-dark"
                            ><i class="fa-solid fa-triangle-exclamation"></i></span
                          >
                        {/if}
                        <span class={"badge " + catBadgeClass(o.normCat)}>{shortCat(o.normCat)}</span>
                        <span>{o.text}</span>
                      </div>
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info me-2" on:click={() => openEditCloModal(o)}
                          ><i class="fa-solid fa-pen-to-square"></i></button
                        >
                        <button class="btn btn-outline-danger" on:click={() => deleteClo(o)}
                          ><i class="fa-solid fa-trash"></i></button
                        >
                      </div>
                    </li>
                  {/each}
                  {#if (byCatCLO.get(cat) || []).length === 0}
                    <li class="list-group-item text-muted fst-italic">No outcomes</li>
                  {/if}
                </ul>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Modules & Lessons -->
    <div class="d-flex align-items-center justify-content-between mb-2">
      <h2 class="h5 mb-0">Modules & Lessons</h2>
      <small class="text-muted">{modules.length} modules • {lessons.length} lessons</small>
    </div>

    {#if loading}
      <div class="text-center py-5">
        <div class="spinner-border" role="status"><span class="visually-hidden">Loading…</span></div>
      </div>
    {:else}
      {#each modules as m}
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2">
              <strong>{moduleHeading(m)}</strong>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button class="btn btn-sm btn-outline-success" on:click={() => openAddLessonModal(m.id)}>+ Lesson</button>
              <button class="btn btn-sm btn-outline-info" title="Edit module" on:click={() => openEditModuleModal(m)}
                ><i class="fa-solid fa-pen-to-square"></i></button
              >
              <button class="btn btn-sm btn-outline-danger" title="Delete module" on:click={() => deleteModule(m.id)}
                ><i class="fa-solid fa-trash"></i></button
              >
              <small class="text-muted">Module ID: {m.id}</small>
            </div>
          </div>

          <div class="card-body">
            <!-- Lessons table -->
            <div class="table-responsive">
              <table class="table align-middle table-hover">
                <thead class="table-light sticky-top">
                  <tr>
                    <th style="width:140px;">Lesson</th>
                    <th>Topics</th>
                    <th style="min-width:360px;">Learning Outcomes (drop here)</th>
                    <th style="width:120px;" class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each lessonsByModule.get(m.id) || [] as l}
                    <tr>
                      <td class="fw-semibold">{l.title}</td>
                      <td class="text-muted">{l.topics}</td>
                      <td on:dragover={onLessonDragOver} on:drop={(e) => onLessonDrop(e, l)}>
                        <div class="d-flex flex-wrap gap-2">
                          {#each l.los as lo}
                            <span class="badge bg-info bg-opacity-50 d-flex align-items-center gap-1">
                              <span class={"badge " + catBadgeClass(lo.normCat)}>{shortCat(lo.normCat)}</span>
                              <span>{lo.text}</span>
                              <button
                                type="button"
                                class="btn btn-sm btn-link p-0 ms-1 text-danger text-decoration-none"
                                title="Remove from lesson"
                                on:click={() => removeLoFromLesson(l, lo)}
                                aria-label="Remove outcome"
                              >
                                ×
                              </button>
                            </span>
                          {/each}
                          {#if l.los.length === 0}
                            <span class="text-muted small">Drop CLOs here</span>
                          {/if}
                        </div>
                      </td>
                      <td class="text-end">
                        <div class="btn-group btn-group-sm">
                          <button class="btn btn-outline-info me-2" on:click={() => openEditLessonModal(l)}
                            ><i class="fa-solid fa-pen-to-square"></i></button
                          >
                          <button class="btn btn-outline-danger" on:click={() => deleteLesson(l)}
                            ><i class="fa-solid fa-trash"></i></button
                          >
                        </div>
                      </td>
                    </tr>
                  {/each}
                  {#if (lessonsByModule.get(m.id) || []).length === 0}
                    <tr><td colspan="4" class="text-muted fst-italic">No lessons in this module</td></tr>
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  {/if}
</div>

<!-- ====== Add/Edit Course Outcome Modal ====== -->
{#if showAddCloModal}
  <div class="modal fade show d-block" tabindex="-1" role="dialog" aria-modal="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content modal-background">
        <div class="modal-header">
          <h5 class="modal-title">
            {editingClo ? "Edit Course Learning Outcome" : "Add Course Learning Outcome"}
          </h5>
          <button class="btn-close" on:click={() => (showAddCloModal = false)} aria-label="Close"></button>
        </div>
        <div class="modal-body">
          {#if cloError}<div class="alert alert-danger">{cloError}</div>{/if}

          <div class="mb-3">
            <label class="form-label">Category</label>
            <select class="form-select" bind:value={cloCat} disabled={cloSaving}>
              <option value="KNOWLEDGE">Knowledge</option>
              <option value="SKILL">Skill</option>
              <option value="GENERAL_COMPETENCE">General Competence</option>
            </select>
          </div>

          <div class="mb-3">
            <label class="form-label">Outcome text</label>
            <textarea
              class="form-control"
              rows="4"
              bind:value={cloName}
              placeholder="Describe the learning outcome…"
              disabled={cloSaving}
            ></textarea>
          </div>
          <small class="text-muted d-block mt-1">
            {editingClo
              ? "This will update the selected outcome (and category, if changed)."
              : `This appends to ${selectedCourseName()}’s ${CAT_LABEL[cloCat]} list.`}
          </small>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showAddCloModal = false)} disabled={cloSaving}
            >Cancel</button
          >
          <button class="btn btn-primary" on:click={saveClo} disabled={cloSaving}>
            {cloSaving ? "Saving…" : editingClo ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}

<!-- ====== Add/Edit Lesson Modal ====== -->
{#if showAddLessonModal}
  <div class="modal fade show d-block" tabindex="-1" role="dialog" aria-modal="true">
    <div class="modal-dialog">
      <div class="modal-content modal-background">
        <div class="modal-header">
          <h5 class="modal-title">
            {editingLesson ? `Edit Lesson #${editingLesson.id}` : `Add Lesson to Module #${lessonModuleId}`}
          </h5>
          <button class="btn-close" on:click={() => (showAddLessonModal = false)} aria-label="Close"></button>
        </div>
        <div class="modal-body">
          {#if lessonError}<div class="alert alert-danger">{lessonError}</div>{/if}

          <div class="mb-3">
            <label class="form-label">Lesson title</label>
            <input
              class="form-control"
              type="text"
              bind:value={lessonName}
              placeholder="e.g., Lesson 1"
              disabled={lessonSaving}
            />
          </div>

          <div class="mb-3">
            <label class="form-label">Topics (optional)</label>
            <textarea
              class="form-control"
              rows="3"
              bind:value={lessonTopics}
              placeholder="Short description"
              disabled={lessonSaving}
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showAddLessonModal = false)} disabled={lessonSaving}>
            Cancel
          </button>
          <button class="btn btn-primary" on:click={saveLesson} disabled={lessonSaving}>
            {lessonSaving ? "Saving…" : editingLesson ? "Update Lesson" : "Save Lesson"}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}

<!-- ====== Add/Edit Module Modal ====== -->
{#if showAddModuleModal}
  <div class="modal fade show d-block" tabindex="-1" role="dialog" aria-modal="true">
    <div class="modal-dialog">
      <div class="modal-content modal-background">
        <div class="modal-header">
          <h5 class="modal-title">
            {editingModule ? `Edit Module #${editingModule.id}` : `Add Module to ${selectedCourseName()}`}
          </h5>
          <button class="btn-close" on:click={() => (showAddModuleModal = false)} aria-label="Close"></button>
        </div>
        <div class="modal-body">
          {#if moduleError}<div class="alert alert-danger">{moduleError}</div>{/if}

          <div class="mb-3">
            <label class="form-label">Module name (optional)</label>
            <input
              class="form-control"
              type="text"
              bind:value={moduleName}
              placeholder="Internal name"
              disabled={moduleSaving}
            />
          </div>

          <div class="mb-3">
            <label class="form-label">Module title (optional)</label>
            <input
              class="form-control"
              type="text"
              bind:value={moduleTitle}
              placeholder="Title shown to users"
              disabled={moduleSaving}
            />
          </div>

          <div class="mb-3">
            <label class="form-label">Order (optional)</label>
            <input
              class="form-control"
              type="number"
              bind:value={moduleOrder}
              placeholder="e.g., 1, 2, 3…"
              disabled={moduleSaving}
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showAddModuleModal = false)} disabled={moduleSaving}>
            Cancel
          </button>
          <button class="btn btn-primary" on:click={saveModule} disabled={moduleSaving}>
            {moduleSaving ? "Saving…" : editingModule ? "Update Module" : "Save Module"}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}

<style>
  .tab-scroll {
    max-height: 360px;
    overflow: auto;
  }
  .card-body .table-responsive {
    max-height: 420px;
    overflow: auto;
  }
  .sticky-top {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .bg-outline {
    border: 1px solid rgba(0, 0, 0, 0.125);
    background: #fff;
    color: #333;
  }
  .list-group-item-warning {
    background-color: #fff3cd;
  }
  .bg-warning-subtle {
    background-color: #fff3cd;
  }
  .badge.bg-outline .btn.btn-link {
    line-height: 1;
  }
</style>
