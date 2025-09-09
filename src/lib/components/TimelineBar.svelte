<script lang="ts">
  import type { Entry } from "$lib/types";

  export let items: Entry[] = [];
  export let activeWeek: string = ""; // "YYYY-MM-DD" Monday of the week
  export let showNumbers = true; // keep default
  export let showIndexLabel = false; // deprecated
</script>

<div class="timeline-bar" aria-label="Course timeline">
  {#each items as e}
    <div
      class="seg {e.isStart ? 'start' : e.isAssessment ? 'end' : 'mid'} {activeWeek && e.date === activeWeek
        ? 'active'
        : ''}"
      title="{e.courseCode} – week {e.courseWeek} ({e.date})"
      aria-label="{e.courseCode} – week {e.courseWeek}"
    >
      {#if showNumbers || (showIndexLabel && activeWeek && e.date === activeWeek)}
        <div class="num">{e.courseWeek}</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* Create a low, isolated stacking context that never competes with modals */
  .timeline-bar {
    position: relative; /* anchor for absolute children if added later */
    isolation: isolate; /* prevents blending/filters from escaping */
    z-index: 0; /* stays below modal (1055) & backdrop (1050) */
    min-height: 24px;
    min-width: 24px;
    border-radius: 6px;
    display: inline-flex;
    gap: 4px;
    padding: 2px 2px;
    pointer-events: none; /* this component does not capture clicks */
  }

  /* Individual segments */
  .seg {
    position: relative;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none; /* defensive: children won't swallow clicks */
  }

  .start {
    background: #9b6600;
  }
  .mid {
    background: #6c757d;
  }
  .end {
    background: #346098;
  }

  /* Highlight current week with an outline-like glow (no z-index needed) */
  .active {
    box-shadow: 0 0 0 2px #f6991f;
  }

  .num {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    /* Avoid mix-blend-mode (creates a new stacking/paint context). Use
       text-shadow for legibility so it cannot interfere with overlays. */
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }
</style>
