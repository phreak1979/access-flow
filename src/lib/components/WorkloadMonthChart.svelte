<!-- src/lib/components/WorkloadMonthLineChart.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { createEventDispatcher } from "svelte";
  import {
    Chart,
    LineController,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
  } from "chart.js";

  Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

  // Inputs
  export let weeks: string[] = []; // ["YYYY-MM-DD", ...] – any length (here: 3 months)
  export let perTeacher: Array<{ teacher: string; weekStart: string; total: number }> = [];
  export let monthSeries: Array<{ weekStart: string; total: number }> = [];
  export let activeWeek: string = "";
  export let referenceLine: number = 20; // horizontal guide at y=20

  const dispatch = createEventDispatcher();
  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  const fmtX = (iso: string) => iso.slice(5); // "YYYY-MM-DD" -> "MM-DD"

  // Deterministic color from teacher name
  function colorFor(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return `hsl(${h} 75% 55%)`;
  }

  // Horizontal reference line plugin
  const HLinePlugin = {
    id: "hline",
    afterDatasetsDraw(chart: Chart, _args: any, opts: { y?: number; color?: string; dash?: number[]; label?: string }) {
      const yVal = opts?.y;
      if (yVal == null) return;
      const { ctx, chartArea, scales } = chart as any;
      const yScale = scales?.y;
      if (!yScale) return;

      const y = yScale.getPixelForValue(yVal);
      if (y < chartArea.top || y > chartArea.bottom) return;

      ctx.save();
      ctx.setLineDash(opts?.dash ?? [6, 6]);
      ctx.strokeStyle = opts?.color ?? "rgba(220,53,69,0.9)"; // default red-ish
      ctx.lineWidth = 1.5;

      // line
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();

      // label box
      const label = opts?.label ?? `Max ${yVal}`;
      ctx.setLineDash([]);
      ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      const pad = 4;
      const w = ctx.measureText(label).width + pad * 2;
      const h = 14;
      const x = chartArea.right - w - 6;
      const yy = y - h - 4;

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x, yy, w, h);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + pad, yy + h - 4);
      ctx.restore();
    },
  };
  Chart.register(HLinePlugin as any);

  function buildDatasets() {
    // weeks -> index map
    const pos = new Map<string, number>();
    weeks.forEach((w, i) => pos.set(w, i));

    // teacher -> aligned series
    const teachers = Array.from(new Set(perTeacher.map((p) => p.teacher || "(Unassigned)")));
    const byTeacher = new Map<string, number[]>();
    for (const t of teachers) byTeacher.set(t, Array(weeks.length).fill(0));

    for (const row of perTeacher) {
      const key = row.teacher || "(Unassigned)";
      const i = pos.get(row.weekStart);
      if (i == null) continue;
      const arr = byTeacher.get(key)!;
      arr[i] += row.total;
    }

    const teacherDatasets = Array.from(byTeacher.entries()).map(([t, series]) => ({
      label: t,
      data: series.map((v) => Math.round(v)),
      borderColor: colorFor(t),
      backgroundColor: "transparent",
      borderWidth: 2,
      pointRadius: 2.5,
      pointHoverRadius: 5,
      tension: 0.15,
      fill: false,
    }));

    const totalLine = monthSeries.length
      ? [
          {
            label: "All",
            data: weeks.map((w) => Math.round(monthSeries.find((m) => m.weekStart === w)?.total ?? 0)),
            borderColor: "rgba(255,255,255,0.55)",
            backgroundColor: "transparent",
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0.1,
            fill: false,
            borderDash: [6, 6],
          },
        ]
      : [];

    return [...teacherDatasets, ...totalLine];
  }

  function mountChart() {
    if (!canvas) return;

    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: weeks.map(fmtX),
        datasets: buildDatasets(),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", axis: "x", intersect: false },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              title: (items) => {
                const i = items?.[0]?.dataIndex ?? 0;
                return weeks[i] ?? "";
              },
              label: (ctx) => ` ${ctx.dataset.label}: ${Math.round(ctx.parsed.y)}`,
            },
          },
          // pass options to our plugin
          hline: {
            y: referenceLine,
            color: "rgba(220,53,69,0.9)", // danger-ish
            dash: [6, 6],
            label: `High ${referenceLine}`,
          } as any,
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            // make sure the guide fits; add headroom above the max of data/guide
            suggestedMax: Math.max(referenceLine + 5, ...buildDatasets().flatMap((d) => d.data as number[])),
          },
        },
        onClick: (_evt, elements) => {
          if (!elements?.length) return;
          const idx = elements[0].index;
          const wk = weeks[idx];
          if (wk) dispatch("select", { weekStart: wk });
        },
      } as any,
    });
  }

  function updateChart() {
    if (!chart) return mountChart();
    chart.data.labels = weeks.map(fmtX);
    chart.data.datasets = buildDatasets();
    // update hline options
    (chart.options.plugins as any).hline = {
      y: referenceLine,
      color: "rgba(220,53,69,0.9)",
      dash: [6, 6],
      label: `High ${referenceLine}`,
    };
    // keep y-range sensible
    (chart.options.scales!.y as any).suggestedMax = Math.max(
      referenceLine + 5,
      ...chart.data.datasets.flatMap((d) => d.data as number[]),
    );
    chart.update();
  }

  onMount(mountChart);
  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
  $: (weeks, perTeacher, monthSeries, referenceLine, activeWeek, updateChart());
</script>

<div class="card">
  <div class="card-header d-flex justify-content-between align-items-center">
    <span>Monthly workload (per week, by teacher) for the next 3 months</span>
    <small class="text-muted">Click a point to jump to that week</small>
  </div>
  <div class="card-body" style="height: 260px;">
    {#if !weeks?.length}
      <div class="alert alert-secondary mb-0">No data for this range.</div>
    {:else}
      <canvas bind:this={canvas} />
    {/if}
  </div>
</div>
