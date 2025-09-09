<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";
  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

  export let values: number[] = [0, 0, 0]; // [W0, W1, W2]

  let canvas: HTMLCanvasElement;
  let chart: Chart;

  const COLORS = [
    "rgba(54, 162, 235, 0.8)", // blue
    "rgba(255, 206, 86, 0.8)", // yellow
    "rgba(75, 192, 192, 0.8)", // teal
  ];

  onMount(() => {
    chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["W0", "W1", "W2"],
        datasets: [
          {
            data: values,
            backgroundColor: COLORS,
            borderRadius: 4,
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label || ""} ${ctx.formattedValue} students`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { display: false }, ticks: { display: false }, beginAtZero: true },
        },
      },
    });
  });

  $: if (chart) {
    chart.data.datasets[0].data = values;
    chart.update();
  }

  onDestroy(() => chart?.destroy());
</script>

<div style="height:30px; width:120px;">
  <canvas bind:this={canvas}></canvas>
</div>
