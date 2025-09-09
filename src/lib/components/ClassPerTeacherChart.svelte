<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { CourseDict } from "$lib/stores"; // or your local type
  export let courseDict: CourseDict = {};

  let canvas: HTMLCanvasElement | null = null;
  let chart: any = null;
  const PRIMARY = [57, 197, 252];
  const rgbaFrom = (rgb: number[], a = 0.9) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  /** Build { teacher -> number of courses } */
  function countClassesPerTeacher(dict: CourseDict) {
    const m = new Map<string, number>();
    for (const v of Object.values(dict || {})) {
      const t = (v?.teacher || "").trim() || "(unassigned)";
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    // alphabetical
    const labels = Array.from(m.keys()).sort((a, b) => a.localeCompare(b));
    const data = labels.map((t) => m.get(t) ?? 0);
    return { labels, data };
  }

  /** Create or update chart with current data */
  async function renderChart() {
    if (!canvas) return;

    // @ts-ignore
    const ChartJs = await import("chart.js");
    const Chart = ChartJs.Chart;
    Chart.register(...ChartJs.registerables);

    const { labels, data } = countClassesPerTeacher(courseDict);

    // If chart exists and dimensions match, update in-place
    if (chart && chart.config.type === "bar") {
      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.update();
      return;
    }

    // Otherwise (first time or type changed), rebuild
    chart?.destroy();
    chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Classes",
            data,
            backgroundColor: "rgba(57,197,253,0.7)",
            borderColor: "rgba(57,197,253,0.9)",
            borderWidth: 1,
            borderRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0 },
            title: {
              display: true,
              text: "Number of classes",
            },
            grid: {
              color: "rgba(255,255,255,0.06)",
            },
          },
          y: { grid: { display: false } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.parsed.x} class${ctx.parsed.x === 1 ? "" : "es"}`,
            },
          },
        },
        elements: { bar: { borderSkipped: false } },
      },
    });
  }

  // Public helper: call after async profile loads
  export function refresh() {
    // poke reactivity if caller changed nested fields
    courseDict = { ...courseDict };
  }

  onMount(renderChart);
  onDestroy(() => chart?.destroy());

  // Re-render whenever courseDict changes
  $: (courseDict,
    (async () => {
      if (!canvas) return;
      await renderChart();
    })());

  // Optional: dynamic height based on teachers
  $: chartHeight = Math.max(180, (countClassesPerTeacher(courseDict).labels.length || 1) * 36);
</script>

<div class="card h-100">
  <div class="card-header d-flex align-items-center justify-content-between">
    <strong>Classes per teacher</strong>
    <small class="text-secondary">
      {countClassesPerTeacher(courseDict).labels.length
        ? `${countClassesPerTeacher(courseDict).labels.length} teacher(s)`
        : "No teachers yet"}
    </small>
  </div>
  <div class="card-body" style={`height:${chartHeight}px;`}>
    <canvas bind:this={canvas}></canvas>
  </div>
</div>
