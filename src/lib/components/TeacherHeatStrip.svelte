<script lang="ts">
  export let values: number[] = [0, 0, 0]; // [W0,W1,W2]
  export let labels: string[] = ["W0", "W1", "W2"];

  // Simple thresholds:
  // 0–10 → green, 10–20 → yellow, >20 → red
  function colorFor(v: number): string {
    if (v <= 10) return "hsl(145, 65%, 40%)"; // success green
    if (v <= 20) return "hsl(45, 90%, 55%)"; // warning yellow
    return "hsl(0, 75%, 55%)"; // danger red
  }

  function titleFor(i: number, v: number) {
    const name = labels?.[i] ?? `W${i}`;
    return `${name}: ${Math.round(v)} students`;
  }
</script>

<div class="wrap" aria-label="3-week workload heat strip">
  <div class="strip">
    {#each values as v, i}
      <div class="cell" title={titleFor(i, v)} style="background-color: {colorFor(v)}" />
    {/each}
  </div>
  <div class="strip" aria-hidden="true" style="gap:0">
    <span class="label">W0</span><span class="label">W1</span><span class="label">W2</span>
  </div>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    width: 84px;
  }
  .cell {
    height: 16px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.2);
  }
  .label {
    font-size: 9px;
    line-height: 1;
    text-align: center;
    color: rgba(255, 255, 255, 0.65);
  }
</style>
