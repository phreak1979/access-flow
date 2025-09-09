<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import dayjs from "dayjs";
  import customParseFormat from "dayjs/plugin/customParseFormat";
  dayjs.extend(customParseFormat);

  import type { Entry } from "$lib/types";
  export let courseDict: Record<string, { name: string; teacher?: string }> =
    {};
  export let entries: Entry[] = [];
  export let title = "Weekly teaching load";
  export let classTotals: Map<string, number> = new Map(); // classId -> students

  let teacher = "All";
  let chartType: "bar" | "line" | "heatmap" = "bar";
  let metric: "classes" | "students" = "classes";

  let canvas: HTMLCanvasElement | null = null;
  let chart: any;

  let legendCanvas: HTMLCanvasElement | null = null;
  let legendMax = 0;

  // ✅ normalize totals ONCE reactively (keys → UPPERCASE, values → Number)
  $: normTotals = new Map(
    Array.from(classTotals.entries()).map(([k, v]) => [
      String(k).trim().toUpperCase(),
      Number(v) || 0,
    ]),
  );

  // Teachers present in data
  $: teachers = Array.from(
    new Set(
      entries
        .map((e) => courseDict[e.courseCode]?.teacher ?? "Unknown")
        .filter((t) => t && t !== "All"),
    ),
  ).sort();
  if (teacher !== "All" && !teachers.includes(teacher)) teacher = "All";

  // Palette + helpers
  const palette = [
    [57, 197, 252],
    [13, 110, 253],
    [25, 135, 84],
    [255, 193, 7],
    [220, 53, 69],
    [32, 201, 151],
    [111, 66, 193],
    [23, 162, 184],
    [108, 117, 125],
  ];
  function makeGradient(
    ctx: CanvasRenderingContext2D,
    i: number,
    a1 = 0.85,
    a2 = 0.15,
  ) {
    const h = ctx.canvas.height;
    const [r, g, b] = palette[i % palette.length];
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a1})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${a2})`);
    return grad;
  }
  function colorScale(v: number, vmax: number) {
    if (vmax <= 0) return "rgba(0,0,0,0)";
    const t = Math.min(1, v / vmax);
    const stops = [
      [30, 60, 170],
      [32, 201, 151],
      [255, 193, 7],
      [220, 53, 69],
    ];
    const seg = t * (stops.length - 1);
    const i = Math.floor(seg);
    const f = seg - i;
    const [r1, g1, b1] = stops[i];
    const [r2, g2, b2] = stops[Math.min(i + 1, stops.length - 1)];
    const r = Math.round(r1 + (r2 - r1) * f);
    const g = Math.round(g1 + (g2 - g1) * f);
    const b = Math.round(b1 + (b2 - b1) * f);
    return `rgba(${r},${g},${b},${t === 0 ? 0.08 : 0.9})`;
  }
  function drawLegend(maxValue: number) {
    if (!legendCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = legendCanvas.clientWidth || 300;
    const cssH = legendCanvas.clientHeight || 12;
    legendCanvas.width = Math.max(1, Math.round(cssW * dpr));
    legendCanvas.height = Math.max(1, Math.round(cssH * dpr));

    const ctx = legendCanvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const w = cssW;
    const h = cssH;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0.0, "rgba(30,60,170,0.9)");
    grad.addColorStop(0.33, "rgba(32,201,151,0.9)");
    grad.addColorStop(0.66, "rgba(255,193,7,0.9)");
    grad.addColorStop(1.0, "rgba(220,53,69,0.9)");

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    legendMax = maxValue;
  }

  // 👉 compute values (uses normTotals)
  function compute() {
    const seen = new Set<string>();
    const byWeekTeacher = new Map<string, Map<string, number>>();

    let missingTotals = 0;

    for (const e of entries) {
      const t = courseDict[e.courseCode]?.teacher ?? "Unknown";
      const w = e.date; // Monday of that week
      const key = `${t}|${e.classId}|${e.courseCode}|${w}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let weight = 1;
      if (metric === "students") {
        const id = String(e.classId).trim().toUpperCase();
        const val = normTotals.get(id);
        if (val == null) missingTotals++;
        weight = val ?? 0;
      }

      if (!byWeekTeacher.has(w)) byWeekTeacher.set(w, new Map());
      const m = byWeekTeacher.get(w)!;
      m.set(t, (m.get(t) ?? 0) + weight);
    }

    if (metric === "students" && missingTotals > 0) {
      console.debug(
        `[TeacherLoadChart] ${missingTotals} classIds had no total in classTotals (students metric).`,
      );
    }

    const weeks = Array.from(byWeekTeacher.keys()).sort();
    const labels = weeks.map((w) =>
      dayjs(w, "YYYY-MM-DD", true).format("D MMM YYYY"),
    );
    const rows = weeks.map((w) => byWeekTeacher.get(w)!);

    return { weeks, labels, rows };
  }

  async function render() {
    if (!canvas) return;

    // @ts-ignore
    const ChartJs = await import("chart.js");
    const Chart = ChartJs.Chart;
    Chart.register(...ChartJs.registerables);

    const ctx = canvas.getContext("2d")!;
    const { weeks, labels, rows } = compute();

    if (chartType === "heatmap") {
      const Matrix = await import("chartjs-chart-matrix");
      Chart.register(Matrix.MatrixController, Matrix.MatrixElement);

      const teachersShown =
        teacher === "All" ? teachers : teachers.filter((t) => t === teacher);

      const cells: Array<{ x: number; y: number; v: number }> = [];
      let vmax = 0;

      teachersShown.forEach((t, yi) => {
        weeks.forEach((_, xi) => {
          const v = rows[xi].get(t) ?? 0;
          vmax = Math.max(vmax, v);
          cells.push({ x: xi, y: yi, v });
        });
      });

      const datasets = [
        {
          label: "Load",
          data: cells,
          backgroundColor: (c: any) =>
            colorScale(c.raw.v, Math.max(1, c.dataset.vmax)),
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.07)",
          vmax,
          width: (c: any) => {
            const a = c.chart.chartArea;
            return a ? a.width / Math.max(1, weeks.length) - 2 : 10;
          },
          height: (c: any) => {
            const a = c.chart.chartArea;
            const rowsCount = Math.max(
              1,
              teacher === "All" ? teachers.length : 1,
            );
            return a ? a.height / rowsCount - 2 : 10;
          },
        },
      ];

      chart?.destroy();
      chart = new Chart(canvas, {
        type: "matrix",
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items: any[]) => {
                  const { raw } = items[0] || {};
                  if (!raw) return "";
                  const weekIdx = raw.x as number;
                  return labels[weekIdx] ?? "";
                },
                label: (item: any) => {
                  const raw = item.raw as { x: number; y: number; v: number };
                  const teachersShown =
                    teacher === "All"
                      ? teachers
                      : teachers.filter((t) => t === teacher);
                  const tName = teachersShown[raw.y] ?? "";
                  const v = raw.v ?? 0;
                  const unit = metric === "students" ? "students" : "classes";
                  return `${tName}: ${v.toLocaleString()} ${unit}`;
                },
              },
            },
          },
          scales: {
            x: {
              type: "linear",
              offset: true,
              grid: { display: false },
              ticks: {
                padding: 12,
                autoSkip: true,
                maxRotation: 0,
                callback: (v: any) => labels[Number(v)] ?? "",
              },
            },
            y: {
              type: "linear",
              offset: true,
              grid: { display: false },
              reverse: true,
              ticks: {
                callback: (v: any) => {
                  const teachersShown =
                    teacher === "All"
                      ? teachers
                      : teachers.filter((t) => t === teacher);
                  return teachersShown[Number(v)] ?? "";
                },
              },
            },
          },
        },
      });

      drawLegend(vmax);
      return;
    }

    // Bar / Line
    let datasets: any[] = [];
    if (teacher === "All") {
      datasets = teachers.map((t, i) => {
        const grad = makeGradient(ctx, i);
        const [r, g, b] = palette[i % palette.length];
        return {
          label: t,
          data: rows.map((m) => m.get(t) ?? 0),
          backgroundColor:
            chartType === "line" ? `rgba(${r},${g},${b},0.25)` : grad,
          borderColor: `rgba(${r}, ${g}, ${b}, 1)`,
          borderWidth: 2,
          tension: 0.35,
          fill: chartType === "line",
        };
      });
    } else {
      const idx = 1;
      const grad = makeGradient(ctx, idx);
      const [r, g, b] = palette[idx % palette.length];
      datasets = [
        {
          label: teacher,
          data: rows.map((m) => m.get(teacher) ?? 0),
          backgroundColor:
            chartType === "line" ? `rgba(${r},${g},${b},0.25)` : grad,
          borderColor: `rgba(${r}, ${g}, ${b}, 1)`,
          borderWidth: 2,
          tension: 0.35,
          fill: chartType === "line",
        },
      ];
    }

    const stacked = chartType === "bar" && teacher === "All";

    chart?.destroy();
    chart = new Chart(canvas, {
      type: chartType,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked, ticks: { autoSkip: true, maxRotation: 0 } },
          y: {
            stacked,
            beginAtZero: true,
            ticks: {
              precision: 0,
              callback: (v: any) =>
                metric === "students" ? Number(v).toLocaleString() : v,
            },
            title: {
              display: true,
              text:
                metric === "students"
                  ? "Students per week"
                  : "Classes per week",
            },
          },
        },
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const v = ctx.parsed.y ?? 0;
                const pretty = Number(v).toLocaleString();
                return metric === "students"
                  ? `${ctx.dataset.label}: ${pretty} students`
                  : `${ctx.dataset.label}: ${pretty} classes`;
              },
            },
          },
        },
        elements: {
          point: { radius: chartType === "line" ? 0 : 0, hoverRadius: 0 },
          bar: { borderRadius: 0 },
        },
      },
    });

    legendMax = 0; // hide heat legend for non-heatmap
  }

  onMount(render);
  onDestroy(() => chart?.destroy());

  // 🔁 re-render when any dependency changes
  $: entries, teacher, chartType, teachers, metric, normTotals, render();
</script>

<div class="card my-3">
  <div class="card-header d-flex align-items-center justify-content-between">
    <strong>{title}</strong>
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <label class="form-label mb-0 small text-secondary">Teacher</label>
      <select class="form-select form-select-sm w-auto" bind:value={teacher}>
        <option value="All">All</option>
        {#each teachers as t}<option value={t}>{t}</option>{/each}
      </select>

      <label class="form-label mb-0 small text-secondary ms-3">Chart</label>
      <select class="form-select form-select-sm w-auto" bind:value={chartType}>
        <option value="bar">Bar</option>
        <option value="line">Line</option>
        <option value="heatmap">Heatmap</option>
      </select>

      <label class="form-label mb-0 small text-secondary ms-3">Metric</label>
      <select class="form-select form-select-sm w-auto" bind:value={metric}>
        <option value="classes">Classes</option>
        <option value="students">Students</option>
      </select>
    </div>
  </div>

  <div class="card-body">
    <div class="chart-box"><canvas bind:this={canvas}></canvas></div>

    {#if chartType === "heatmap"}
      <div class="heatmap-legend mt-3">
        <canvas bind:this={legendCanvas}></canvas>
        <div class="d-flex justify-content-between small text-secondary mt-1">
          <span>0</span>
          <span>{legendMax.toLocaleString()}</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .chart-box {
    height: 360px;
  }
  .heatmap-legend canvas {
    width: 100%;
    height: 12px;
    display: block;
    border-radius: 4px;
  }
</style>
