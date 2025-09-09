<script lang="ts">
  import { onMount } from "svelte";
  import type { User } from "$lib/user";
  export let data: { API_URL: string; token: string; user: User };
  let API_URL = data.API_URL;
  let TOKEN = data.token;
  let user = data.user;
  import { downloadJson, readJsonFile } from "$lib/jsonio";
  import { classTotalsStore, objectToMap, mapToObject } from "$lib/stores";
  import StudentsTotalChart from "$lib/components/StudentsTotalChart.svelte";
  import type { ProgramOption, Totals } from "$lib/api";
  import { formatDate } from "$lib/helpers/dateformating";
  import Toast from "$lib/components/Toast.svelte";
  import { globalProgramId } from "$lib/stores/program";

  let totals = new Map<string, number>(); // classId -> total
  let filter = "";
  let filename = "totals.json";
  let Programs: ProgramOption[];
  // let programId: string | null;
  let updatedOn: string | null;
  let userUpdated: string;
  let toastMessage = "Loading...";
  let showToast = true;

  function addRow() {
    let id = "NEWCLASS";
    let n = 1;
    while (totals.has(id)) id = `NEWCLASS${n++}`;
    totals.set(id, 0);
    totals = new Map(totals);
  }

  function deleteRow(id: string) {
    totals.delete(id);
    totals = new Map(totals);
  }

  function renameId(oldId: string, newIdRaw: string) {
    const newId = (newIdRaw || "").trim().toUpperCase();
    if (!newId || newId === oldId) return;
    if (totals.has(newId)) {
      alert("That class already exists.");
      return;
    }
    const v = totals.get(oldId) ?? 0;
    totals.delete(oldId);
    totals.set(newId, v);
    totals = new Map(totals);
  }

  function updateValue(id: string, v: string) {
    const n = Math.max(0, Number(v) || 0);
    totals.set(id, n);
    totals = new Map(totals);
  }

  async function loadPrograms() {
    try {
      const res = await fetch(
        `${API_URL}/items/programs?fields=*,user_updated.first_name,user_updated.last_name&filter[manager][directus_users_id][_eq]=${user.id}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TOKEN}`,
          },
        },
      );

      let { data } = await res.json();
      Programs = data;
      loadProfile(programId);
      // if (Programs.length >= 1) {
      //   programId = `"${Programs[0].id}"`;
      //   console.warn("DEBUGPRINT[75]: +page.svelte:69: programId=", programId);
      //   console.warn("DEBUGPRINT[74]: +page.svelte:69: programId=", typeof programId);
      // }
      // console.warn("DEBUGPRINT[23]: +page.svelte:64: Programs=", Programs);
      // Profiles = data.map((p) => ({
      //   value: p.class.name,
      //   name: p.class.name,
      //   id: p.class.id,
      //   totals: p.class.totals,
      // }));
      // console.warn("DEBUGPRINT[67]: +page.svelte:77: Profiles=", Profiles);
    } catch (err) {
      console.warn("DEBUGPRINT[66]: +page.svelte:97: err=", err);
    }
  }

  async function saveTotals() {
    console.log(mapToObject(totals));
    try {
      const response = await fetch(`${API_URL}/items/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ class: mapToObject(totals) }),
      });
      console.log(JSON.stringify({ totals: mapToObject }));
      console.warn("DEBUGPRINT[73]: +page.svelte:98: response=", response);
      // loadProfiles();
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      toastMessage = "Saved classes...";
      showToast = true;
    } catch (err) {
      console.warn("DEBUGPRINT[72]: +page.svelte:101: err=", err);
    }
  }

  async function onFilePicked(e: Event) {
    const target = e.target as HTMLSelectElement;
    console.warn("DEBUGPRINT[69]: +page.svelte:82: target=", target.value);
    console.warn("DEBUGPRINT[12]: +page.svelte:142: Programs=", Programs);
    loadProfile(Number(target.value));
  }
  function loadProfile(prgId: number) {
    try {
      const profile = Programs.find((p) => p.id == prgId);
      console.warn("DEBUGPRINT[24]: +page.svelte:108: profile=", profile);
      // userUpdated = `${profile?.user_updated.first_name} ${profile?.user_updated.last_name}`;
      updatedOn = formatDate(profile?.date_updated);

      const totalsObj: Totals | null = profile?.class
        ? typeof profile.class === "string"
          ? (JSON.parse(profile.class) as Totals) // if string, parse it
          : (profile.class as Totals) // if object, just use it
        : null;

      // totals = totalsObj ? objectToMap(totalsObj) : new Map();

      // if (!file) return;
      totals = totalsObj ? objectToMap(totalsObj) : new Map();
      // filename = file.name;
    } catch (err) {
      console.error(err);
      alert("Could not parse JSON file.");
    }
  }

  function applyToApp() {
    classTotalsStore.set(new Map(totals));
    alert("Totals applied to the app (in-memory).");
  }
  onMount(() => {
    loadPrograms();
  });

  $: rows = Array.from(totals.entries())
    .filter(([id]) => id.toUpperCase().includes(filter.trim().toUpperCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  $: programId = $globalProgramId;
</script>

<svelte:head><title>Access Flow | Totals</title></svelte:head>
<div class="container-fluid py-3">
  <div class="d-flex align-items-center justify-content-between mb-3">
    <h3 class="mb-0">Edit Student Per Class Totals</h3>
  </div>

  <div class="row">
    <div class="col-9">
      <div class="" style="height:360px;">
        <StudentsTotalChart classTotals={totals} showLegend={true} />
      </div>
    </div>
    <div class="col-3">
      <div class="card pt-3 h-100">
        <div class="card-header">
          Class Total Options
          {#if updatedOn != null && updatedOn != ""}
            Updated on {updatedOn} by {userUpdated}
          {/if}
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col">
              <div class="d-flex gap-2">
                <select id="programSelect" class="form-select" on:change={onFilePicked} bind:value={programId}>
                  <option value="0" selected>No Program Selected...</option>

                  {#each Programs as program}
                    <option value={program.id}>{program.name}</option>
                  {/each}
                </select>
                <button class="btn btn-outline-warning" on:click={saveTotals}
                  ><i class="fa-solid fa-floppy-disk"></i></button
                >
              </div>
            </div>
          </div>
          <div class="row pt-4">
            <div class="col">
              <div class="col-auto fw-semibold">Filter</div>
              <div class="col-auto">
                <input class="form-control" placeholder="e.g. AUG25FT" bind:value={filter} />
              </div>
            </div>
          </div>
          <div class="row pt-4">
            <div class="d-flex w-100 gap-2 flex-wrap">
              <button class="btn btn-outline-success flex-fill" on:click={addRow}
                ><i class="fa-solid fa-circle-plus"></i> Add class</button
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card pt-4">
    <div class="card-header">Student numbers per class</div>
    <div class="card-body">
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead>
            <tr>
              <th style="width:18rem;">Class ID</th>
              <th style="width:10rem;">Total</th>
              <th style="width:8rem;"></th>
            </tr>
          </thead>
          <tbody>
            {#if rows.length === 0}
              <tr
                ><td colspan="3" class="text-secondary">
                  <div class="alert alert-warning mb-0">No records, or no program selected...</div>
                </td></tr
              >
            {:else}
              {#each rows as [id, total]}
                <tr>
                  <td>
                    <input
                      class="form-control form-control-sm text-uppercase"
                      value={id}
                      on:change={(e) => renameId(id, (e.target as HTMLInputElement).value)}
                    />
                  </td>
                  <td style="max-width:10rem;">
                    <input
                      class="form-control form-control-sm text-end"
                      type="number"
                      min="0"
                      value={total}
                      on:input={(e) => updateValue(id, (e.target as HTMLInputElement).value)}
                    />
                  </td>
                  <td class="text-end">
                    <button class="btn btn-sm btn-outline-danger" on:click={() => deleteRow(id)}
                      ><i class="fa-solid fa-trash-can"></i></button
                    >
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
<Toast bind:message={toastMessage} bind:show={showToast} />
