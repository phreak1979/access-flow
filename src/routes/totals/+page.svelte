<script lang="ts">
  import { onMount, onDestroy } from "svelte";
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

  // Forecast/back-cast chart
  import Chart from "chart.js/auto";

  // ---------------- existing state ----------------
  let totals = new Map<string, number>(); // classId -> total
  let rows: [string, number][] = [];
  let programId: number = 0;

  let filter = "";
  let filename = "totals.json";
  let Programs: ProgramOption[] = [];
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
      Programs = data as ProgramOption[];
      loadProfile(programId);
    } catch (err) {
      console.warn("DEBUGPRINT[66]: +page.svelte:97: err=", err);
    }
  }

  async function saveTotals() {
    try {
      const response = await fetch(`${API_URL}/items/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ class: mapToObject(totals) }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      toastMessage = "Saved classes...";
      showToast = true;
    } catch (err) {
      console.warn("DEBUGPRINT[72]: +page.svelte:101: err=", err);
    }
  }

  function onFilePicked(e: Event) {
    const target = e.target as HTMLSelectElement;
    loadProfile(Number(target.value));
  }

  function loadProfile(prgId: number) {
    try {
      const profile = Programs.find((p) => p.id == prgId);
      updatedOn = formatDate(profile?.date_updated);

      const totalsObj: Totals | null = profile?.class
        ? typeof profile.class === "string"
          ? (JSON.parse(profile.class) as Totals)
          : (profile.class as Totals)
        : null;

      totals = totalsObj ? objectToMap(totalsObj) : new Map();
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

  // ---------------- reactive: table rows + selected program ----------------
  $: rows = Array.from(totals.entries())
    .filter(([id]) => id.toUpperCase().includes(filter.trim().toUpperCase()))
    .sort(([a], [b]) => a.localeCompare(b));

  $: programId = $globalProgramId;

  // ---------------- BACK/FORECAST CHART LOGIC ----------------
  // % adjustment for predictions (e.g. 10 = +10%, -5 = -5%)
  let adjustPct = 0;

  let forecastCanvas: HTMLCanvasElement | null = null;
  let forecastChart: Chart | null = null;

  type ParsedId = { month: "Jan" | "Mar" | "Aug" | "Oct"; year: number; stream: "FT" | "PT"; raw: string };
  const CLASS_RE = /^(Jan|Mar|Aug|Oct)(\d{2})(FT|PT)$/i;
  const MONTH_INDEX: Record<string, number> = { Jan: 0, Mar: 1, Aug: 2, Oct: 3 };

  function parseId(id: string): ParsedId | null {
    const m = id.match(CLASS_RE);
    if (!m) return null;
    const month = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as ParsedId["month"];
    const yy = Number(m[2]);
    const stream = m[3].toUpperCase() as ParsedId["stream"];
    const year = 2000 + yy;
    return { month, year, stream, raw: id };
  }

  function sortByDate(a: ParsedId, b: ParsedId): number {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return MONTH_INDEX[a.month] - MONTH_INDEX[b.month];
    if (a.stream !== b.stream) return a.stream === "FT" ? -1 : 1;
    return 0;
  }

  function average(nums: number[]): number {
    if (!nums.length) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  // Build predicted value for a single class, excluding that class's own year from the history.
  function predictFor(p: ParsedId, map: Map<string, number>, adjFactor: number): number | null {
    const monthStreamValues: number[] = [];
    const monthOnlyValues: number[] = [];

    for (const [id, value] of map.entries()) {
      const q = parseId(id);
      if (!q) continue;
      if (q.year === p.year) continue; // exclude same year to make it a true back-cast
      if (value <= 0) continue;

      if (q.month === p.month && q.stream === p.stream) monthStreamValues.push(value);
      if (q.month === p.month) monthOnlyValues.push(value);
    }

    let base = 0;
    if (monthStreamValues.length) base = average(monthStreamValues);
    else if (monthOnlyValues.length) base = average(monthOnlyValues);
    else return null; // no history at all

    return Math.max(0, Math.round(base * adjFactor));
  }

  function computePredictionSeries(map: Map<string, number>, pct: number) {
    const adjFactor = 1 + (Number(pct) || 0) / 100;

    const parsed: ParsedId[] = [];
    for (const id of map.keys()) {
      const p = parseId(id);
      if (p) parsed.push(p);
    }
    parsed.sort(sortByDate);

    const labels = parsed.map((p) => p.raw);
    const actuals = parsed.map((p) => map.get(p.raw) || 0);
    const predicted = parsed.map((p) => {
      const val = predictFor(p, map, adjFactor);
      return val === null ? NaN : val; // NaN to create gaps when no history
    });

    return { labels, actuals, predicted };
  }

  function renderForecast() {
    if (!forecastCanvas) return;

    const { labels, actuals, predicted } = computePredictionSeries(totals, adjustPct);

    if (forecastChart) {
      forecastChart.destroy();
      forecastChart = null;
    }

    forecastChart = new Chart(forecastCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Actual",
            data: actuals,
            borderWidth: 1,
          },
          {
            label: "Predicted (avg of prior years ± adj)",
            type: "line",
            data: predicted,
            spanGaps: true,
            tension: 0.25,
            borderWidth: 2,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                if (Number.isNaN(v)) return null;
                if (ctx.dataset.type === "line") {
                  // Show error if actual available
                  const i = ctx.dataIndex;
                  const a = actuals[i];
                  if (typeof a === "number" && !Number.isNaN(a)) {
                    const diff = Math.round((a - v) * 100) / 100;
                    const pctErr = v ? Math.round(((a - v) / v) * 1000) / 10 : null;
                    return pctErr === null
                      ? `${ctx.dataset.label}: ${v}`
                      : `${ctx.dataset.label}: ${v} | Δ: ${diff} (${pctErr}%)`;
                  }
                }
                return `${ctx.dataset.label}: ${v}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
    });
  }

  // Re-render forecast on data/adjust changes
  $: (totals, adjustPct, renderForecast());

  onDestroy(() => {
    if (forecastChart) forecastChart.destroy();
  });
</script>

<svelte:head><title>Access Flow | Totals</title></svelte:head>
<div class="container-fluid py-3">
  <div class="d-flex align-items-center justify-content-between mb-3">
    <h3 class="mb-0">Edit Student Per Class Totals</h3>
  </div>

  <div class="row">
    <div class="col-12 col-md-9">
      <!-- Existing totals chart -->
      <!-- <div style="height:360px;"> -->
      <!--   <StudentsTotalChart classTotals={totals} showLegend={true} /> -->
      <!-- </div> -->

      <!-- Back/forecast chart + adjustment -->
      <div class="mt-4">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h6 class="mb-0">Actual vs Predicted (back-cast & forecast)</h6>
          <div class="d-flex align-items-center gap-2">
            <label for="adj" class="form-label mb-0 small text-nowrap">Adjustment&nbsp;(%)</label>
            <input
              id="adj"
              class="form-control form-control-sm"
              type="number"
              step="1"
              style="max-width:8rem;"
              bind:value={adjustPct}
              placeholder="e.g. 10"
            />
          </div>
        </div>
        <div class="card">
          <div class="card-body p-2" style="height:300px;">
            <canvas bind:this={forecastCanvas}></canvas>
          </div>
        </div>
        <small class="text-secondary d-block mt-2">
          Prediction for each class = average of prior years with same month & stream (FT/PT). If none, falls back to
          month-only average. Current year is excluded from its own average. Adjustment applies to predictions only.
        </small>
      </div>
    </div>

    <div class="col-12 col-sm-3">
      <div class="card pt-3 h-100">
        <div class="card-header">
          Class Total Options
          {#if updatedOn != null && updatedOn != ""}
            Updated on {updatedOn} by {userUpdated}
          {/if}
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-12 col-sm-9">
              <div class="d-flex gap-2">
                <select id="programSelect" class="form-select" on:change={onFilePicked} bind:value={programId}>
                  <option value="0" selected>No Program Selected...</option>
                  {#each Programs as program}
                    <option value={program.id}>{program.name}</option>
                  {/each}
                </select>
                <button class="btn btn-outline-warning" on:click={saveTotals}>
                  <i class="fa-solid fa-floppy-disk"></i>
                </button>
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
              <button class="btn btn-outline-success flex-fill" on:click={addRow}>
                <i class="fa-solid fa-circle-plus"></i> Add class
              </button>
            </div>
          </div>

          <!-- <div class="row pt-3"> -->
          <!--   <div class="col"> -->
          <!--     <button class="btn btn-outline-primary w-100" on:click={applyToApp}> -->
          <!--       Apply these totals to app (in-memory) -->
          <!--     </button> -->
          <!--   </div> -->
          <!-- </div> -->
        </div>
      </div>
    </div>
  </div>

  <div class="card pt-4 mt-3">
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
              <tr>
                <td colspan="3" class="text-secondary">
                  <div class="alert alert-warning mb-0">No records, or no program selected...</div>
                </td>
              </tr>
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
                    <button class="btn btn-sm btn-outline-danger" on:click={() => deleteRow(id)}>
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
<Toast bind:message={toastMessage} bind:show={showToast} />
