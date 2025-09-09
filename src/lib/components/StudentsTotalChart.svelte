<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  export let classTotals: Map<string, number> = new Map();
  export let title = "Students per class";
  export let showLegend: boolean = false; // 👈 NEW toggle
  let canvas: HTMLCanvasElement | null = null;
  let chart: any;

  // palette
  const colors = [
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
  const rgba = (i: number, a = 0.9) => {
    const [r, g, b] = colors[i % colors.length];
    return `rgba(${r},${g},${b},${a})`;
  };

  function buildData() {
    const entries = Array.from(classTotals.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const labels = entries.map(([k]) => k);
    const data = entries.map(([, v]) => v);
    const total = data.reduce((s, n) => s + (Number(n) || 0), 0);
    const classes = data.length;
    return { labels, data, total, classes };
  }

  async function render() {
    if (!canvas) return;

    // chart.js + plugin-datalabels
    // @ts-ignore
    const ChartJs = await import("chart.js/auto");
    // @ts-ignore
    const DataLabels = (await import("chartjs-plugin-datalabels")).default;

    // custom center text plugin
    const CenterText = {
      id: "centerText",
      afterDatasetsDraw(chart: any) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const { total, classes } = chart.config.options.runtimeTotals ?? {};
        if (total == null) return;

        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // big number (students total)
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font =
          "700 26px system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial";
        ctx.fillText(String(total), cx, cy - 6);

        // "total"
        ctx.fillStyle = "white";
        ctx.font =
          "600 12px system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial";
        ctx.fillText("Total", cx, cy + 14);

        // classes (small & muted)
        if (typeof classes === "number") {
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.font =
            "600 11px system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial";
          ctx.fillText(`${classes} running classes`, cx, cy + 42);
        }

        ctx.restore();
      },
    };

    const { labels, data, total, classes } = buildData();

    chart?.destroy();
    chart = new ChartJs.Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: data.map((_, i) => rgba(i, 0.9)),
            borderColor: data.map((_, i) => rgba(i, 1)),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%", // inner radius for the ring
        plugins: {
          legend: { display: showLegend }, // 👈 use prop
          title: { display: true, text: title },
          // show numbers on slices only (not labels)
          datalabels: {
            color: "#fff",
            font: { weight: 700, size: 11 },
            formatter: (value: number) => value ?? 0,
          },
        },
        // pass totals into options so the plugin can read them
        runtimeTotals: { total, classes } as any,
      },
      plugins: [DataLabels, CenterText],
    });
  }

  onMount(render);
  onDestroy(() => chart?.destroy());
  $: classTotals, showLegend, render(); // 👈 re-render when toggle changes
</script>

<div class="card-body" style="height: 360px;">
  <canvas bind:this={canvas}></canvas>
</div>
