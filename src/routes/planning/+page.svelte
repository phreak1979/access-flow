<script lang="ts">
  // ====== CONFIG ======
  import type { User } from "$lib/user";
  export let data: { API_URL: string; token: string; user: User };
  export let baseUrl = data.API_URL;
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
  type LOSKeyNames = { knowledgeKey: string; skillKey: string; competenceKey: string };

  type LoObj = { id: string; text: string };
  type LosBucketsObj = Record<NormCat, LoObj[]>; // course.los
  type LosBucketsIds = Record<NormCat, string[]>; // lesson.los

  // API rows
  type ProgramRow = { id: number; los: RawLOS };
  type CourseRow = {
    id: number;
    los: RawLOS; // { knowledge:[{id,text}], skill:[{id,text}], competence:[{id,text}] }
    name: string;
    order?: number | null;
    ca_weeks: number;
    about_the_course: string | null;
    content_weeks: number;
  };
  type LessonRow = {
    id: number;
    name: string;
    topics?: string | null;
    module: number;
    los: RawLOS; // { knowledge:["K-1"], skill:["S-2"], competence:[] }
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
  type CLO = { id: string; text: string; normCat: NormCat }; // now has id
  type Lesson = {
    id: number;
    title: string;
    topics?: string | null;
    moduleId: number;
    los: CLO[]; // UI objects (resolved from ids)
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
  type Course = {
    id: number;
    name: string;
    order?: number | null;
    about_the_course: string | null;
    content_weeks: number;
    ca_weeks: number;
  };

  // ====== State ======
  let loading = false;
  let errorMsg: string | null = null;

  let programPlos: PLO[] = [];
  let overview_about_the_course: string | null;
  let courses: Course[] = [];
  let selectedCourseId: number | null = null;
  let content_weeks: number = 0;
  let ca_weeks: number = 0;
  let modules: Module[] = [];
  let lessons: Lesson[] = []; // flattened
  let courseClos: CLO[] = [];
  let cloById = new Map<string, CLO>(); // id -> CLO

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

  function pickExistingKey(obj: any, logical: "knowledge" | "skill" | "competence", fallback: string) {
    if (obj && typeof obj === "object") {
      const hit = Object.keys(obj).find((k) => k.toLowerCase() === logical);
      if (hit) return hit;
    }
    return fallback;
  }

  // Program PLOs still plain strings (unchanged)
  function coerceStrArray(v: any): string[] {
    if (!v) return [];
    const arr = Array.isArray(v) ? v : [v];
    return arr.map(String).filter((s) => s != null && s !== "");
  }

  function normalizeLOSFlexible(raw: RawLOS): Record<NormCat, string[]> {
    const obj = raw || {};
    const lower: Record<string, any> = {};
    for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
    return {
      KNOWLEDGE: coerceStrArray(lower["knowledge"]),
      SKILL: coerceStrArray(lower["skill"]),
      GENERAL_COMPETENCE: coerceStrArray(lower["competence"]),
    };
  }

  function entriesFromLOS(los: Record<NormCat, string[]>): PLO[] {
    const out: PLO[] = [];
    for (const cat of CAT_ORDER) for (const t of los[cat]) out.push({ text: t, normCat: cat });
    return out;
  }

  // ====== NEW: Course/lesson LOS helpers (ID-based) ======
  function normalizeCourseLOSWithKeys(raw: RawLOS): { buckets: LosBucketsObj; keys: LOSKeyNames } {
    const obj = raw || {};
    const knowledgeKey = pickExistingKey(obj, "knowledge", "knowledge");
    const skillKey = pickExistingKey(obj, "skill", "skill");
    const competenceKey = pickExistingKey(obj, "competence", "competence");

    const toObjs = (v: any): LoObj[] =>
      (Array.isArray(v) ? v : []).map((o) => ({ id: String(o.id), text: String(o.text) }));

    return {
      buckets: {
        KNOWLEDGE: toObjs((obj as any)[knowledgeKey]),
        SKILL: toObjs((obj as any)[skillKey]),
        GENERAL_COMPETENCE: toObjs((obj as any)[competenceKey]),
      },
      keys: { knowledgeKey, skillKey, competenceKey },
    };
  }

  function parseLessonIds(raw: RawLOS, keys: LOSKeyNames): LosBucketsIds {
    const toIds = (v: any): string[] => (Array.isArray(v) ? v.map(String) : []);
    return {
      KNOWLEDGE: toIds((raw as any)?.[keys.knowledgeKey]),
      SKILL: toIds((raw as any)?.[keys.skillKey]),
      GENERAL_COMPETENCE: toIds((raw as any)?.[keys.competenceKey]),
    };
  }

  function entriesFromCourse(b: LosBucketsObj): CLO[] {
    const out: CLO[] = [];
    for (const cat of CAT_ORDER) for (const o of b[cat]) out.push({ id: o.id, text: o.text, normCat: cat });
    return out;
  }

  function lessonLosToUi(b: LosBucketsIds): CLO[] {
    const out: CLO[] = [];
    for (const cat of CAT_ORDER)
      for (const id of b[cat]) {
        const clo = cloById.get(id);
        if (clo) out.push(clo);
      }
    return out;
  }

  function toIdsByCat(arr: CLO[]): LosBucketsIds {
    return {
      KNOWLEDGE: arr.filter((a) => a.normCat === "KNOWLEDGE").map((a) => a.id),
      SKILL: arr.filter((a) => a.normCat === "SKILL").map((a) => a.id),
      GENERAL_COMPETENCE: arr.filter((a) => a.normCat === "GENERAL_COMPETENCE").map((a) => a.id),
    };
  }

  function selectedCourseName(): string {
    const c = courses.find((x) => x.id === selectedCourseId);
    return c?.name ?? String(selectedCourseId ?? "");
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
      `/items/courses?fields=id,los,name,order,about_the_course,ca_weeks,content_weeks&sort=order&filter[program]=${programId}`,
    );
    courses = (res.data || [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        order: c.order ?? null,
        about_the_course: c.about_the_course ?? null,
        ca_weeks: c.ca_weeks,
        content_weeks: c.content_weeks,
      }))
      .sort((a, b) => {
        const ao = a.order ?? Number.POSITIVE_INFINITY;
        const bo = b.order ?? Number.POSITIVE_INFINITY;
        if (ao !== bo) return ao - bo;
        return a.id - b.id;
      });

    // Keep selection stable if possible; fall back to first course.
    if (selectedCourseId && courses.some((c) => c.id === selectedCourseId)) {
      // keep current
    } else if (courses.length >= 1) {
      selectedCourseId = courses[0].id;
      await selectCourseByID(selectedCourseId);
    } else {
      selectedCourseId = null;
      modules = [];
      lessons = [];
      courseClos = [];
      cloById.clear();
    }
  }

  async function loadCourseClos(courseId: number) {
    const res = await fetchJson<ApiList<CourseRow>>(
      `/items/courses?fields=id,los,name,about_the_course,content_weeks,ca_weeks&filter[id][_eq]=${courseId}&filter[program]=${programId}`,
    );
    const row = (res.data || [])[0];
    overview_about_the_course = row.about_the_course;
    content_weeks = row.content_weeks;
    ca_weeks = row.ca_weeks;

    const { buckets, keys } = normalizeCourseLOSWithKeys(row?.los ?? null);
    courseLosKeyNames = keys;

    courseClos = entriesFromCourse(buckets).sort((a, b) =>
      a.normCat === b.normCat ? a.text.localeCompare(b.text) : a.normCat.localeCompare(b.normCat),
    );
    cloById = new Map(courseClos.map((c) => [c.id, c]));
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
        const knowledgeKey = pickExistingKey(l.los ?? {}, "knowledge", "knowledge");
        const skillKey = pickExistingKey(l.los ?? {}, "skill", "skill");
        const competenceKey = pickExistingKey(l.los ?? {}, "competence", "competence");
        const keys: LOSKeyNames = { knowledgeKey, skillKey, competenceKey };

        const ids = parseLessonIds(l.los ?? null, keys);
        const ui = lessonLosToUi(ids);

        return {
          id: l.id,
          title: l.name,
          topics: l.topics ?? null,
          moduleId: m.id,
          los: ui,
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
  // Used/unassigned by ID (not text)
  $: usedCloIdSet = new Set(lessons.flatMap((l) => l.los.map((o) => o.id)));
  $: unassignedCountByCatCLO = new Map<NormCat, number>(
    CAT_ORDER.map((c) => [c, (byCatCLO.get(c) || []).filter((o) => !usedCloIdSet.has(o.id)).length]),
  );
  $: totalUnassignedCLO = courseClos.filter((o) => !usedCloIdSet.has(o.id)).length;
  $: lessonsByModule = groupBy(lessons, (l) => l.moduleId);
  $: moduleLos = new Map<number, CLO[]>();
  $: {
    moduleLos.clear();
    for (const [mid, arr] of lessonsByModule.entries()) {
      const uniq = new Map<string, CLO>();
      for (const le of arr)
        for (const lo of le.los) {
          if (!uniq.has(lo.id)) uniq.set(lo.id, lo);
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

  // ====== Course LOS mutate (object arrays) ======
  async function mutateCourseLosObjects(mutator: (b: LosBucketsObj) => void) {
    const res = await fetchJson<ApiList<CourseRow>>(
      `/items/courses?fields=id,los&filter[id][_eq]=${selectedCourseId}&filter[program]=${programId}`,
    );
    const row = (res.data || [])[0] ?? { los: null };
    const { buckets, keys } = normalizeCourseLOSWithKeys(row.los ?? null);

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
        // EDIT text and/or move category; keep the same id
        const original = editingClo;
        await mutateCourseLosObjects((b) => {
          // remove from original bucket by id
          const from =
            original.normCat === "KNOWLEDGE"
              ? b.KNOWLEDGE
              : original.normCat === "SKILL"
                ? b.SKILL
                : b.GENERAL_COMPETENCE;
          const idx = from.findIndex((o) => o.id === original.id);
          if (idx !== -1) from.splice(idx, 1);

          // add/update in target bucket (keep id)
          const target = cloCat === "KNOWLEDGE" ? b.KNOWLEDGE : cloCat === "SKILL" ? b.SKILL : b.GENERAL_COMPETENCE;

          // avoid duplicates by id (shouldn’t happen, but safe)
          const existingIdx = target.findIndex((o) => o.id === original.id);
          const updated = { id: original.id, text: cloName.trim() };
          if (existingIdx !== -1) target[existingIdx] = updated;
          else target.push(updated);
        });
      } else {
        // ADD new object with fresh id
        const newId = `${cloCat[0]}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        await mutateCourseLosObjects((b) => {
          const bucket = cloCat === "KNOWLEDGE" ? b.KNOWLEDGE : cloCat === "SKILL" ? b.SKILL : b.GENERAL_COMPETENCE;
          bucket.push({ id: newId, text: cloName.trim() });
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
      await mutateCourseLosObjects((b) => {
        const bucket =
          clo.normCat === "KNOWLEDGE" ? b.KNOWLEDGE : clo.normCat === "SKILL" ? b.SKILL : b.GENERAL_COMPETENCE;
        const idx = bucket.findIndex((o) => o.id === clo.id);
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

  // ====== DnD: attach/remove LOs on lessons (IDs) ======
  function onCloDragStart(e: DragEvent, clo: CLO) {
    e.dataTransfer?.setData("application/json", JSON.stringify({ id: clo.id }));
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
      const dropped = JSON.parse(raw) as { id: string };
      const clo = cloById.get(dropped.id);
      if (!clo) return;
      await addLoToLesson(l, clo);
    } catch (err) {
      alert(getErrMessage(err));
    }
  }

  async function addLoToLesson(l: Lesson, clo: CLO) {
    if (l.los.some((x) => x.id === clo.id)) return; // already present
    const next = [...l.los, clo];
    const ids = toIdsByCat(next);
    const payload = {
      los: {
        [l.losKeys.knowledgeKey]: ids.KNOWLEDGE,
        [l.losKeys.skillKey]: ids.SKILL,
        [l.losKeys.competenceKey]: ids.GENERAL_COMPETENCE,
      },
    };
    await fetchJson(`/items/lessons/${l.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    await loadModulesAndLessons(selectedCourseId!);
  }

  async function removeLoFromLesson(l: Lesson, clo: CLO) {
    const next = l.los.filter((x) => x.id !== clo.id);
    const ids = toIdsByCat(next);
    const payload = {
      los: {
        [l.losKeys.knowledgeKey]: ids.KNOWLEDGE,
        [l.losKeys.skillKey]: ids.SKILL,
        [l.losKeys.competenceKey]: ids.GENERAL_COMPETENCE,
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

  // ====== Courses: manager (add / edit / delete) ======
  let showCourseManager = false;

  let showAddCourseModal = false;
  let courseSaving = false;
  let courseError: string | null = null;
  let courseName = "";
  let about_the_course: string | null = null;
  let courseOrder: number | null = null;
  let editingCourse: Course | null = null;

  function openCourseManager() {
    courseError = null;
    showCourseManager = true;
  }

  function openAddCourseModal() {
    editingCourse = null;
    courseName = "";
    about_the_course = "";
    courseOrder = null;
    courseError = null;
    showAddCourseModal = true;
  }

  function openEditCourseModal(c: Course) {
    editingCourse = c;
    courseName = c.name;
    about_the_course = c.about_the_course ?? null;
    courseOrder = c.order ?? null;
    courseError = null;
    showAddCourseModal = true;
  }

  async function saveCourse() {
    if (!courseName.trim()) {
      courseError = "Please enter a course name.";
      return;
    }
    courseSaving = true;
    courseError = null;
    try {
      if (editingCourse) {
        const payload: any = { name: courseName.trim(), about_the_course: about_the_course };
        payload.order = courseOrder != null && !Number.isNaN(courseOrder) ? courseOrder : null;
        await fetchJson(`/items/courses/${editingCourse.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        const payload: any = {
          name: courseName.trim(),
          program: programId,
        };
        if (courseOrder != null && !Number.isNaN(courseOrder)) payload.order = courseOrder;
        await fetchJson(`/items/courses`, { method: "POST", body: JSON.stringify(payload) });
      }

      // Refresh list & keep/adjust selection
      const prevSelected = selectedCourseId;
      await loadCoursesForProgram();

      if (prevSelected && courses.some((c) => c.id === prevSelected)) {
        // keep selection and reload its data
        await selectCourseByID(prevSelected);
      } else if (selectedCourseId) {
        await selectCourseByID(selectedCourseId);
      }

      showAddCourseModal = false;
      editingCourse = null;
    } catch (e) {
      courseError = getErrMessage(e);
    } finally {
      courseSaving = false;
    }
  }

  async function deleteCourse(c: Course) {
    const ok = confirm(`Delete course "${c.name}" (ID ${c.id})?\nThis cannot be undone.`);
    if (!ok) return;
    try {
      await fetchJson(`/items/courses/${c.id}`, { method: "DELETE" });

      const wasSelected = selectedCourseId === c.id;
      await loadCoursesForProgram();

      if (wasSelected) {
        if (selectedCourseId) {
          await selectCourseByID(selectedCourseId);
        } else {
          // No courses left
          modules = [];
          lessons = [];
          courseClos = [];
          cloById.clear();
        }
      }
    } catch (e) {
      alert(getErrMessage(e));
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

  // tiny util used above
  function groupBy<T, K>(arr: T[], key: (x: T) => K): Map<K, T[]> {
    const m = new Map<K, T[]>();
    for (const item of arr) {
      const k = key(item);
      (m.get(k) || m.set(k, [] as T[]).get(k)!).push(item);
    }
    return m;
  }
</script>

<svelte:head><title>Access Flow | Planner</title></svelte:head>

<!-- Header -->
<div class="d-flex align-items-center justify-content-between mb-3">
  <h1 class="h4 mb-0">Study Plan Planner</h1>
  <div class="d-flex gap-2">
    {#if selectedCourseId}
      <button class="btn btn-sm btn-outline-primary" on:click={openAddCloModal}>+ Course Outcome</button>
      <button class="btn btn-sm btn-outline-success" on:click={openAddModuleModal}>+ Module</button>
    {/if}
  </div>
</div>

{#if errorMsg}<div class="alert alert-danger">{errorMsg}</div>{/if}

<div class="row pb-5">
  <div class="col-12">
    <!-- Course selector + manager -->
    <div class="mb-3 d-flex gap-2 align-items-end">
      <div class="flex-grow-1">
        <label class="form-label" for="course-select">Course</label>
        <select class="form-select" id="course-select" on:change={onSelectCourse} bind:value={selectedCourseId}>
          <option value={0}>Select a course…</option>
          {#each courses as c}
            <option value={c.id}>
              {c.order != null ? `${c.order}. ` : ""}{c.name}
            </option>
          {/each}
        </select>
      </div>

      <div>
        <button class="btn btn-outline-warning" on:click={openCourseManager}>
          <i class="fa-solid fa-gear me-1"></i> Manage courses
        </button>
      </div>
    </div>
  </div>
  <div class="col-9">
    <div class="card mb-4 h-100">
      <div class="card-header d-flex align-items-center justify-content-between">About the course</div>
      <div class="card-body">
        {overview_about_the_course}
      </div>
    </div>
  </div>

  <div class="col-3">
    <div class="card mb-4 h-100">
      <div class="card-header d-flex align-items-center justify-content-between">Course information</div>
      <div class="card-body">
        <p>Course content weeks: <span class="text-info">{content_weeks}</span></p>
        <p>Course assignemnt weeks: <span class="text-info">{ca_weeks}</span></p>
        <p>Total course weeks: <span class="text-info">{content_weeks + ca_weeks}</span></p>
      </div>
    </div>
  </div>
</div>

<div class="row">
  {#if selectedCourseId}
    <div class="col-6">
      <!-- Course Outcomes -->
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
                        {#if !usedCloIdSet.has(o.id)}
                          <span class="badge bg-warning text-dark"
                            ><i class="fa-solid fa-triangle-exclamation"></i></span
                          >
                        {/if}
                        <span class={"badge " + catBadgeClass(o.normCat)}>{shortCat(o.normCat)}</span>
                        <span>{o.text}</span>
                      </div>
                      <div class="btn-group btn-group-sm">
                        <button
                          class="btn btn-outline-info me-2"
                          aria-label="button"
                          on:click={() => openEditCloModal(o)}><i class="fa-solid fa-pen-to-square"></i></button
                        >
                        <button class="btn btn-outline-danger" aria-label="button" on:click={() => deleteClo(o)}
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
    <div class="col-6">
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
        <div class="scroll-modules">
          {#if modules.length == 0}
            <div class="card mb-3">
              <div class="card-header d-flex justify-content-between align-items-center">No Modules configured</div>
            </div>
          {/if}
          {#each modules as m}
            <div class="card mb-3">
              <div class="card-header d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center gap-2">
                  <strong>{moduleHeading(m)}</strong>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <button class="btn btn-sm btn-outline-success" on:click={() => openAddLessonModal(m.id)}
                    >+ Lesson</button
                  >
                  <button
                    class="btn btn-sm btn-outline-info"
                    title="Edit module"
                    on:click={() => openEditModuleModal(m)}
                    aria-label="button"><i class="fa-solid fa-pen-to-square"></i></button
                  >
                  <button
                    class="btn btn-sm btn-outline-danger"
                    title="Delete module"
                    on:click={() => deleteModule(m.id)}
                    aria-label="button"><i class="fa-solid fa-trash"></i></button
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
                              <button
                                class="btn btn-outline-info me-2"
                                aria-label="button"
                                on:click={() => openEditLessonModal(l)}
                                ><i class="fa-solid fa-pen-to-square"></i></button
                              >
                              <button
                                class="btn btn-outline-danger"
                                on:click={() => deleteLesson(l)}
                                aria-label="button"><i class="fa-solid fa-trash"></i></button
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
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- ====== Course Manager Modal ====== -->
{#if showCourseManager}
  <div class="modal fade show d-block" tabindex="-1" role="dialog" aria-modal="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content modal-background">
        <div class="modal-header">
          <h5 class="modal-title">Manage Courses (Program #{programId})</h5>
          <button class="btn-close" on:click={() => (showCourseManager = false)} aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <small class="text-muted">{courses.length} course(s)</small>
            <button class="btn btn-sm btn-outline-primary" aria-label="button" on:click={openAddCourseModal}>
              <i class="fa-solid fa-plus"></i>
            </button>
          </div>

          <div class="table-responsive">
            <table class="table table-sm align-middle">
              <thead class="table-light">
                <tr>
                  <th style="width:80px;">ID</th>
                  <th>Name</th>
                  <th style="width:120px;">Order</th>
                  <th style="width:160px;" class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each courses as c}
                  <tr class={selectedCourseId === c.id ? "table-active" : ""}>
                    <td>{c.id}</td>
                    <td>{c.name}</td>
                    <td>{c.order ?? "-"}</td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button
                          class="btn btn-outline-secondary me-2"
                          title="Select"
                          aria-label="button"
                          on:click={() => selectCourseByID(c.id)}
                        >
                          <i class="fa-solid fa-check"></i>
                        </button>
                        <button
                          class="btn btn-outline-info me-2"
                          aria-label="button"
                          title="Edit"
                          on:click={() => openEditCourseModal(c)}
                        >
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button
                          class="btn btn-outline-danger"
                          aria-label="button"
                          title="Delete"
                          on:click={() => deleteCourse(c)}
                        >
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
                {#if courses.length === 0}
                  <tr><td colspan="4" class="text-muted fst-italic">No courses for this program yet.</td></tr>
                {/if}
              </tbody>
            </table>
          </div>
          <small class="text-muted d-block mt-2">
            Tip: “Order” controls the sort in the dropdown. Leave blank to push to the bottom (by ID).
          </small>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showCourseManager = false)}>Close</button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}

<!-- ====== Add/Edit Course Modal ====== -->
{#if showAddCourseModal}
  <div class="modal fade show d-block" tabindex="-1" role="dialog" aria-modal="true">
    <div class="modal-dialog">
      <div class="modal-content modal-background border border-secondary">
        <div class="modal-header">
          <h5 class="modal-title">{editingCourse ? `Edit Course #${editingCourse.id}` : "Add Course"}</h5>
          <button class="btn-close" on:click={() => (showAddCourseModal = false)} aria-label="Close"></button>
        </div>
        <div class="modal-body">
          {#if courseError}<div class="alert alert-danger">{courseError}</div>{/if}

          <div class="mb-3">
            <label class="form-label" for="course-name">Course name</label>
            <input
              class="form-control"
              type="text"
              id="course-name"
              bind:value={courseName}
              placeholder="e.g., Programming 1"
              disabled={courseSaving}
            />
          </div>

          <div class="mb-3">
            <label class="form-label" for="about-the-course">About the course</label>
            <textarea
              class="form-control"
              id="about-the-course"
              bind:value={about_the_course}
              placeholder="e.g., This course covers…"
              disabled={courseSaving}
            ></textarea>
          </div>

          <div class="mb-3">
            <label class="form-label" for="order">Order (optional)</label>
            <input
              class="form-control"
              id="order"
              type="number"
              bind:value={courseOrder}
              placeholder="e.g., 1, 2, 3…"
              disabled={courseSaving}
            />
          </div>
        </div>
        <div class="modal-footer">
          <button
            class="btn btn-secondary"
            aria-label="button"
            on:click={() => (showAddCourseModal = false)}
            disabled={courseSaving}
          >
            <i class="fa-solid fa-cancel"></i>
          </button>
          <button class="btn btn-primary" on:click={saveCourse} disabled={courseSaving}>
            {#if courseSaving}
              Saving…
            {:else}
              <i class="fa-solid fa-floppy-disk"></i>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}

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
            <label class="form-label" for="categoty-select">Category</label>
            <select class="form-select" bind:value={cloCat} id="category-select" disabled={cloSaving}>
              <option value="KNOWLEDGE">Knowledge</option>
              <option value="SKILL">Skill</option>
              <option value="GENERAL_COMPETENCE">General Competence</option>
            </select>
          </div>

          <div class="mb-3">
            <label class="form-label" for="outome-text">Outcome text</label>
            <textarea
              class="form-control"
              id="outcome-text"
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
            <label class="form-label" for="lesson-title">Lesson title</label>
            <input
              class="form-control"
              id="lesson-title"
              type="text"
              bind:value={lessonName}
              placeholder="e.g., Lesson 1"
              disabled={lessonSaving}
            />
          </div>

          <div class="mb-3">
            <label class="form-label" for="topics">Topics (optional)</label>
            <textarea
              class="form-control"
              rows="3"
              id="topics"
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
            <label class="form-label" for="module-name">Module name (optional)</label>
            <input
              class="form-control"
              type="text"
              id="module-name"
              bind:value={moduleName}
              placeholder="Internal name"
              disabled={moduleSaving}
            />
          </div>

          <div class="mb-3">
            <label class="form-label" for="module-title">Module title (optional)</label>
            <input
              class="form-control"
              type="text"
              id="module-title"
              bind:value={moduleTitle}
              placeholder="Title shown to users"
              disabled={moduleSaving}
            />
          </div>

          <div class="mb-3">
            <label class="form-label" for="module-order">Order (optional)</label>
            <input
              class="form-control"
              type="number"
              id="module-order"
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
  .modal-background {
    background: #3f4449;
    color: white;
  }
  .tab-scroll {
    max-height: 550px;
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
  .scroll-modules {
    max-height: 585px; /* adjust to the size you want */
    overflow-y: auto; /* vertical scrollbar */
    padding-right: 4px; /* space so scrollbar doesn’t cover content */
  }
</style>
