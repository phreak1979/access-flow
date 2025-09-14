<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Chart from "chart.js/auto";

  /**
   * Props
   * - classTotals: Map<string, number> where key is "Aug25FT", "Jan24PT", etc.
   * - adjustPct: number (e.g., 10 = +10%, -5 = -5%)
   */
  export let classTotals: Map<string, number> = new Map();
  export let adjustPct: number = 0;

  let canvas: HTMLCanvasElement | null = null;
  let chart: Chart | null = null;

  // Month order for sorting and grouping
  const MONTH_ORDER = ["Jan", "Mar", "Aug", "Oct"];
  const MONTH_INDEX: Record<string, number> = { Jan: 0, Mar: 1, Aug: 2, Oct: 3 };

  const CLASS_RE = /^(Jan|Mar|Aug|Oct)(\d{2})(FT|PT)$/i;

  type ParsedId = { month: "Jan" | "Mar" | "Aug" | "Oct"; year: number; stream: "FT" | "PT"; raw: string };

  function parseId(id: string): ParsedId | null {
    const m = id.match(CLASS_RE);
    if (!m) return null;
    const month = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as ParsedId["month"];
    const yy = Number(m[2]); // 24, 25, 26...
    const stream = m[3].toUpperCase() as ParsedId["stream"];
    // Interpret 2-digit years as 20YY (good enough for this usage)
    const year = 2000 + yy;
    return { month, year, stream, raw: id };
  }

  function sortByDate(a: ParsedId, b: ParsedId): number {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return MONTH_INDEX[a.month] - MONTH_INDEX[b.month];
    // FT before PT to keep a stable, intuitive order
    if (a.stream !== b.stream) return a.stream === "FT" ? -1 : 1;
    return 0;
  }

  /**
   * Build historical buckets:
   *  - month+stream => values[]
   *  - month-only (combined FT/PT) => values[]
   */
  function buildHistory(totals: Map<string, number>) {
    const byMonthStream: Record<string, number[]> = {}; // e.g., "Aug|FT"
    const byMonthOnly: Record<string, number[]> = {}; // e.g., "Aug"

    for (const [id, value] of totals.entries()) {
      const p = parseId(id);
      if (!p) continue;
      if (value > 0) {
        const msKey = `${p.month}|${p.stream}`;
        const mKey = p.month;
        (byMonthStream[msKey] ||= []).push(value);
        (byMonthOnly[mKey] ||= []).push(value);
      }
    }
    return { byMonthStream, byMonthOnly };
  }

  function average(nums: number[]): number {
    if (!nums || nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  function computeForecasts(totals: Map<string, number>, adjustPct: number) {
    const { byMonthStream, byMonthOnly } = buildHistory(totals);
    const adjFactor = 1 + (Number(adjustPct) || 0) / 100;

    // Build a sorted label list from *all* parsed ids so we align bars/line
    const parsed: ParsedId[] = [];
    for (const id of totals.keys()) {
      const p = parseId(id);
      if (p) parsed.push(p);
    }
    parsed.sort(sortByDate);

    const labels = parsed.map((p) => p.raw);
    const actuals = parsed.map((p) => totals.get(p.raw) || 0);

    // Forecast for items whose current value is 0
    const forecast = parsed.map((p, idx) => {
      const current = actuals[idx];
      if (current > 0) return NaN; // We only draw forecast for missing (0) classes
      const msKey = `${p.month}|${p.stream}`;
      const mKey = p.month;

      let base = 0;
      if (byMonthStream[msKey]?.length) {
        base = average(byMonthStream[msKey]);
      } else if (byMonthOnly[mKey]?.length) {
        base = average(byMonthOnly[mKey]);
      } else {
        base = 0; // No history at all
      }

      // Apply adjustment
      const projected = Math.max(0, Math.round(base * adjFactor));
      return projected;
    });

    return { labels, actuals, forecast };
  }

  function render() {
    if (!canvas) return;
    const { labels, actuals, forecast } = computeForecasts(classTotals, adjustPct);

    // Clean up previous
    if (chart) {
      chart.destroy();
      chart = null;
    }

    chart = new Chart(canvas, {
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
            label: "Forecast (for 0 totals)",
            type: "line",
            data: forecast,
            spanGaps: true, // ignore NaN
            tension: 0.25,
            borderWidth: 2,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          tooltip: {
            callbacks: {
              // Hide tooltip items for missing forecast (NaN)
              label: (ctx) => {
                const v = ctx.parsed.y;
                if (Number.isNaN(v)) return null;
                return `${ctx.dataset.label}: ${v}`;
              },
            },
          },
          legend: { position: "top" },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 }, // integers
          },
        },
      },
    });
  }

  // Initial + reactive updates
  onMount(() => render());
  $: (classTotals, adjustPct, render());

  onDestroy(() => {
    if (chart) chart.destroy();
    chart = null;
  });
</script>

<div class="w-100 h-100">
  <canvas bind:this={canvas} />
</div>
