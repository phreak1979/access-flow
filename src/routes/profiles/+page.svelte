<script lang="ts">
  import type { User } from "$lib/user";
  export let data: { API_URL: string; token: string; user: User };
  let API_URL = data.API_URL;
  let TOKEN = data.token;
  let user: User = data.user;
  import { onMount, onDestroy } from "svelte";
  import { readJsonFile } from "$lib/jsonio";
  import { courseDictStore, type CourseDict } from "$lib/stores";
  import ClassPerTeacherChart from "$lib/components/ClassPerTeacherChart.svelte";
  import { globalProgramId } from "$lib/stores/program";
  import type { ProgramsResponse, ProgramOption, CourseProfile } from "$lib/api";
  import NewProfileModal from "$lib/components/NewProfileModal.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import type { log10 } from "chart.js/helpers";
  import { formatDate } from "$lib/helpers/dateformating";

  // UI state
  let courseDict: CourseDict = {};
  let copied: CourseDict = {};
  let filter = "";
  let showNewModal = false;
  let messageType: string = "success";
  // let filename = "profile.json"; // default when exporting
  let courseProfile: CourseProfile[] = [];
  let classesChart;
  let selected: CourseProfile | undefined;
  let courseSelected: number = 0;
  let toastMessage: string = "";
  let showToast: boolean = false;
  let enablePast: boolean = false;
  let updatedUser: string | null = "";
  let updatedOn: string;
  let programOptions: ProgramOption[];
  let programs: ProgramsResponse;

  //todo: this is a test
  // Helper: return all codes ordered by their current number (then code)
  function orderedCodesAll(): string[] {
    return Object.entries(courseDict)
      .sort(([aCode, a], [bCode, b]) => {
        const an = a?.number ?? Number.POSITIVE_INFINITY;
        const bn = b?.number ?? Number.POSITIVE_INFINITY;
        if (an !== bn) return an - bn;
        return aCode.localeCompare(bCode);
      })
      .map(([code]) => code);
  }

  // Re-number all rows sequentially from 0 following a given order of codes
  function renumberAll(order: string[]) {
    order.forEach((code, idx) => {
      if (!courseDict[code]) return;
      courseDict[code] = { ...courseDict[code], number: idx };
    });
    // poke reactivity
    courseDict = { ...courseDict };
  }

  // Add new row at the bottom (next number)
  function addRow() {
    let code = "NEW";
    let n = 1;
    while (courseDict[code]) code = `NEW${n++}`;
    const nextNumber = Object.keys(courseDict).length;
    courseDict = {
      ...courseDict,
      [code]: {
        name: "",
        teacher: "",
        number: nextNumber,
        weeks: 0,
      },
    };
  }

  function copyProfile() {
    copied = courseDict;
    enablePast = true;
  }

  function pastProfile() {
    courseDict = copied;
  }

  function deleteRow(code: string) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [code]: _, ...rest } = courseDict;
    courseDict = rest;
    // after deletion, re-sequence from 0 in current order
    const order = orderedCodesAll();
    renumberAll(order);
  }

  function handleAddNewProfile() {
    showNewModal = false;
    toastMessage = "New Profile Added!";
    showToast = true;
    loadSelect();
  }

  function renameCode(oldCode: string, newCodeRaw: string) {
    const newCode = (newCodeRaw || "").trim().toUpperCase();
    if (!newCode || newCode === oldCode) return;
    if (courseDict[newCode]) {
      alert("That course code already exists.");
      return;
    }
    const next = { ...courseDict };
    next[newCode] = next[oldCode];
    delete next[oldCode];
    courseDict = next;
    // keep numbering as-is; no change required
  }

  async function saveProfile() {
    // Optional: export in number order for readability
    const sorted = Object.entries(courseDict).sort(([aCode, a], [bCode, b]) => {
      const an = a?.number ?? Number.POSITIVE_INFINITY;
      const bn = b?.number ?? Number.POSITIVE_INFINITY;
      if (an !== bn) return an - bn;
      return aCode.localeCompare(bCode);
    });

    const obj = Object.fromEntries(sorted);
    console.warn("DEBUGPRINT[3]: +page.svelte:97: obj=", obj);

    try {
      const response = await fetch(`${API_URL}/items/courseprofile/${courseSelected}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ profile: obj }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      await loadSelect();
      await loadCourseProfile(courseSelected);
      console.log("Saved successfully:", data);
      messageType = "success";
      toastMessage = "Study plan Profile saved..";
      showToast = true;
    } catch (err) {
      messageType = "danger";
      toastMessage = "Error saving the profile...";
      showToast = true;

      console.error("Error saving courses:", err);
    }

    // downloadJson(filename || "profile.json", obj);
  }

  async function loadCourseProfile(id: number) {
    if (!courseProfile) return;
    selected = courseProfile.find((x) => x.id == id);
    console.warn("DEBUGPRINT[18]: +page.svelte:162: selected=", selected);
    if (!selected) return;
    courseSelected = selected.id;

    try {
      const json = selected.profile;
      if (!json) {
        courseDict = {};
        return;
      }

      // Ensure every row has a numeric `number`
      const fixed: CourseDict = {};
      let i = 0;
      for (const [code, info] of Object.entries(json)) {
        fixed[code] = {
          name: info.name ?? "",
          teacher: info.teacher ?? "",
          weeks: Number(info.weeks ?? 0),
          number: Number.isFinite(Number(info.number)) ? Number(info.number) : i,
        };
        i++;
      }
      // Normalize numbering to 0..n-1 by current order
      const order = Object.entries(fixed)
        .sort(([aCode, a], [bCode, b]) => {
          const an = a?.number ?? Number.POSITIVE_INFINITY;
          const bn = b?.number ?? Number.POSITIVE_INFINITY;
          if (an !== bn) return an - bn;
          return aCode.localeCompare(bCode);
        })
        .map(([code]) => code);
      renumberAll(order);
      courseDict = fixed;
      // updatedUser = `${selected.user_updated.first_name} ${selected.user_updated.last_name}`;
      updatedOn = formatDate(selected.date_updated);

      // filename = file.name;
    } catch (err) {
      console.error("DEBUGPRINT[9]: +page.svelte:180: err=", err);
      // alert("Could not parse JSON file.");
    }
  }

  async function onFilePicked(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const json = await readJsonFile<CourseDict>(file);
      // Ensure every row has a numeric `number`
      const fixed: CourseDict = {};
      let i = 0;
      for (const [code, info] of Object.entries(json)) {
        fixed[code] = {
          name: info.name ?? "",
          teacher: info.teacher ?? "",
          weeks: Number(info.weeks ?? 0),
          number: Number.isFinite(Number(info.number)) ? Number(info.number) : i,
        };
        i++;
      }
      // Normalize numbering to 0..n-1 by current order
      const order = Object.entries(fixed)
        .sort(([aCode, a], [bCode, b]) => {
          const an = a?.number ?? Number.POSITIVE_INFINITY;
          const bn = b?.number ?? Number.POSITIVE_INFINITY;
          if (an !== bn) return an - bn;
          return aCode.localeCompare(bCode);
        })
        .map(([code]) => code);
      courseDict = fixed;
      renumberAll(order);

      // filename = file.name;
    } catch (err) {
      console.error(err);
      alert("Could not parse JSON file.");
    }
  }

  function applyToApp() {
    courseDictStore.set(courseDict);
    alert("Profile applied to the app (in-memory).");
  }

  // Move a row up/down in the global order and then renumber from 0
  function moveRow(code: string, dir: "up" | "down") {
    const order = orderedCodesAll(); // full (unfiltered) order
    const idx = order.indexOf(code);
    if (idx < 0) return;

    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= order.length) return;

    [order[idx], order[j]] = [order[j], order[idx]];
    renumberAll(order);
  }

  // VIEW: rows filtered by code and sorted by number, then code
  $: rows = Object.entries(courseDict)
    .filter(([code, info]) => {
      const q = filter.trim().toUpperCase();
      if (!q) return true;
      return code.toUpperCase().includes(q) || (info.teacher ?? "").toUpperCase().includes(q);
    })
    .sort(([aCode, a], [bCode, b]) => {
      const an = a?.number ?? Number.POSITIVE_INFINITY;
      const bn = b?.number ?? Number.POSITIVE_INFINITY;
      if (an !== bn) return an - bn;
      return aCode.localeCompare(bCode);
    });

  async function loadSelect() {
    try {
      const res = await fetch(`${API_URL}/items/courseprofile?fields=*&sort[]=-id&filter[program]=${programId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
      });
      let { data } = await res.json();
      courseProfile = data;
      if (courseProfile.length >= 1) {
        courseSelected = courseProfile[0].id;
        loadCourseProfile(courseSelected);
        // updatedUser = `${courseProfile[0]?.user_updated?.first_name} ${courseProfile[0]?.user_updated?.last_name}`;
        updatedOn = formatDate(courseProfile[0]?.date_updated);
      }
    } catch (err) {
      console.warn("DEBUGPRINT[1]: +page.svelte:256: err=", err);
    }
  }

  onMount(() => {
    loadSelect();
    loadPrograms();
  });

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

      let { data } = await res.json();
      programOptions = data;
      programs = programOptions.filter((p) => p.name).map((p) => ({ value: p.name, id: p.id, name: p.name }));
    } catch (err) {
      console.error("DEBUGPRINT[58]: +page.svelte:110: err=", err);
    }
  }

  function handleProgramSelect(e: Event) {
    const target = e.target as HTMLSelectElement;

    let selectedProgram = programs.find((p) => p.id == Number(target.value)) ?? {};

    if (selectedProgram != undefined) {
      programId = selectedProgram.id;
      loadSelect();
    }
  }
  $: programId = $globalProgramId;
</script>

<svelte:head><title>Access Flow | Profiles</title></svelte:head>

<div class="container-fluid py-3">
  <div class="d-flex align-items-center justify-content-between mb-3">
    <h3 class="mb-0">Edit Course Profile</h3>
  </div>

  <div class="row">
    <div class="col-9">
      <ClassPerTeacherChart {courseDict} bind:this={classesChart} />
    </div>
    <div class="col-3">
      <div class="card h-100">
        <div class="card-header">
          Course Options
          {#if updatedOn != null && updatedOn != ""}
            Updated on {updatedOn} by {updatedUser}
          {:else}
            [Not yet updated]
          {/if}
        </div>
        <div class="card-body">
          <div class="row">
            <div class="d-flex gap-2">
              <select id="programSelect" class="form-select" on:change={handleProgramSelect} bind:value={programId}>
                <option value="0" selected>No Program Selected...</option>

                {#each programs as program}
                  <option value={program.id}>{program.name}</option>
                {/each}
              </select>
            </div>
            <div class="d-flex gap-2 pt-4">
              <select
                class="form-select"
                id="courseSelect"
                bind:value={courseSelected}
                on:change={() => loadCourseProfile(courseSelected)}
              >
                <option value="0" selected>Select profile...</option>

                {#each courseProfile as courses}
                  <option value={courses.id}>{courses.name}</option>
                {/each}
              </select>
              <button class="btn btn-outline-warning" on:click={saveProfile}
                ><i class="fa-solid fa-floppy-disk"></i></button
              >
              <button
                type="button"
                class="btn btn-outline-primary position-relative"
                on:click={() => {
                  showNewModal = true;
                }}
              >
                <i class="fa-solid fa-file"></i>
              </button>
            </div>
          </div>

          <div class="row">
            <div class="col">
              <div class="col-auto fw-semibold pt-3">Filter</div>
              <div class="col-auto">
                <input class="form-control" placeholder="code e.g. PRF" bind:value={filter} />
              </div>
            </div>
          </div>
          <div class="row pt-4">
            <div class="d-flex w-100 gap-2 flex-wrap">
              <button class="btn btn-outline-primary flex-fill" on:click={addRow}>Add row</button>
              <button class="btn btn-outline-warning flex-fill" on:click={copyProfile}>Copy</button>
              <button class="btn btn-outline-success flex-fill" on:click={pastProfile} disabled={!enablePast}
                >Past</button
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card pt-4">
    <div class="card-header">Courses and Teacher to Course Assignment</div>
    <div class="card-body">
      <div class="table-responsive pt-3">
        <table class="table table-sm align-middle">
          <thead>
            <tr>
              <th style="width:8rem;">Order</th>
              <th style="width:10rem;">Code</th>
              <th style="width:28rem;">Name</th>
              <th style="width:10rem;">Weeks</th>
              <th style="width:18rem;">Teacher</th>
              <th style="width:12rem;" class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#if rows.length === 0}
              <tr><td colspan="6" class="text-secondary ps-3">No courses.</td></tr>
            {:else}
              {#each rows as [code, info]}
                <tr>
                  <!-- ORDER/NUMBER (read-only, derived from position) -->
                  <td>
                    <input class="form-control form-control-sm text-center" value={info.number} readonly />
                  </td>

                  <!-- CODE -->
                  <td>
                    <input
                      class="form-control form-control-sm text-uppercase"
                      value={code}
                      on:change={(e) => renameCode(code, (e.target as HTMLInputElement).value)}
                    />
                  </td>

                  <!-- NAME -->
                  <td>
                    <input
                      class="form-control form-control-sm"
                      bind:value={info.name}
                      on:input={() =>
                        (courseDict = {
                          ...courseDict,
                        })}
                      placeholder="Course name"
                    />
                  </td>

                  <!-- WEEKS -->
                  <td>
                    <input
                      class="form-control form-control-sm"
                      type="number"
                      min="0"
                      bind:value={info.weeks}
                      on:input={() =>
                        (courseDict = {
                          ...courseDict,
                        })}
                      placeholder="Weeks"
                    />
                  </td>

                  <!-- TEACHER -->
                  <td>
                    <input
                      class="form-control form-control-sm"
                      bind:value={info.teacher}
                      on:input={() =>
                        (courseDict = {
                          ...courseDict,
                        })}
                      placeholder="Teacher"
                    />
                  </td>

                  <!-- ACTIONS -->
                  <td class="text-end">
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-outline-info" title="Move up" on:click={() => moveRow(code, "up")}>
                        <i class="fa-solid fa-caret-up"></i>
                      </button>
                      <button class="btn btn-outline-info" title="Move down" on:click={() => moveRow(code, "down")}>
                        <i class="fa-solid fa-caret-down"></i>
                      </button>
                    </div>
                    <button class="btn btn-sm btn-outline-danger ms-2" on:click={() => deleteRow(code)}>
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<NewProfileModal
  {programId}
  directusUrl={API_URL}
  token={TOKEN}
  bind:show={showNewModal}
  on:updated={handleAddNewProfile}
></NewProfileModal>
<Toast bind:message={toastMessage} bind:show={showToast} variant={messageType} />
