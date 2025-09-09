<script lang="ts">
  import dayjs from "dayjs";
  import customParseFormat from "dayjs/plugin/customParseFormat";
  dayjs.extend(customParseFormat);

  import type { Dayjs } from "dayjs";
  import { createEventDispatcher } from "svelte";

  // API
  export let value: string = ""; // "YYYY-MM-DD"
  export let min: string | undefined = undefined;
  export let max: string | undefined = undefined;

  const dispatch = createEventDispatcher();

  const today = dayjs();
  let view: Dayjs = value ? dayjs(value, "YYYY-MM-DD", true) : today;

  const asDay = (s?: string) => (s ? dayjs(s, "YYYY-MM-DD", true) : undefined);

  // recompute min/max if props change
  let minD: Dayjs | undefined;
  let maxD: Dayjs | undefined;
  $: minD = asDay(min);
  $: maxD = asDay(max);

  // ---- Only sync view when `value` actually changes (prevents undoing Prev/Next) ----
  let lastSyncedValue = value; // remember last value we reacted to
  $: if (value !== lastSyncedValue) {
    const v = value ? dayjs(value, "YYYY-MM-DD", true) : null;
    if (v && v.isValid()) {
      view = v; // jump to the newly selected date's month
    } else if (!value) {
      // cleared externally — optional: show today's month
      view = today;
    }
    lastSyncedValue = value;
  }

  // ---------- Grid (Sunday start) ----------
  $: startOfMonth = view.startOf("month");
  let gridStart: Dayjs;
  $: {
    const off = startOfMonth.day(); // 0=Sun
    gridStart = startOfMonth.subtract(off, "day");
  }
  $: daysGrid = Array.from({ length: 42 }, (_, i) => gridStart.add(i, "day"));

  // UI helpers
  const inMonth = (d: Dayjs) => d.month() === view.month();
  const isSelected = (d: Dayjs) => value && dayjs(value, "YYYY-MM-DD", true).isSame(d, "day");
  const isDisabled = (d: Dayjs) => (minD && d.isBefore(minD, "day")) || (maxD && d.isAfter(maxD, "day"));

  // Navigation
  function prevMonth() {
    view = view.subtract(1, "month");
  }
  function nextMonth() {
    view = view.add(1, "month");
  }
  function gotoToday() {
    const d = dayjs();
    value = d.format("YYYY-MM-DD"); // select today
    view = d; // show its month
    dispatch("change", value);
  }

  // Click selection inside grid
  function select(d: Dayjs) {
    value = d.format("YYYY-MM-DD");
    view = d;
    dispatch("change", value);
  }

  // Optional: clear selection
  export function clear() {
    value = "";
    view = today;
    dispatch("change", value);
  }
</script>

<div class="calendar" style="--cal-cell: 46px;">
  <div class="cal-head">
    <div class="btns">
      <button type="button" class="btn" aria-label="Prev" on:click={prevMonth}>
        <i class="fa-solid fa-angles-left"></i>
      </button>
      <button type="button" class="btn" on:click={gotoToday}>Today</button>
      <button type="button" class="btn" aria-label="Next" on:click={nextMonth}>
        <i class="fa-solid fa-angles-right"></i>
      </button>
    </div>
    <div class="title">
      {view.format("MMMM YYYY")}
      <span class="muted">Mon–Sun</span>
    </div>
  </div>

  <div class="weekdays">
    {#each ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as w}
      <div class="wk">{w}</div>
    {/each}
  </div>

  <div class="grid">
    {#each daysGrid as d}
      <button
        type="button"
        class="day
          {inMonth(d) ? '' : 'out'}
          {d.isSame(today, 'day') ? 'today' : ''}
          {isSelected(d) ? 'selected' : ''}
          {d && (d.day() === 0 || d.day() === 6) ? 'weekend' : ''}"
        disabled={isDisabled(d)}
        on:click={() => select(d)}
        title={d.format("YYYY-MM-DD")}
        aria-pressed={isSelected(d)}
      >
        {d.date()}
      </button>
    {/each}
  </div>
</div>

<style>
  .calendar {
    --cal-cell: 44px;
    --gap: 6px;
    width: 100%;
    box-sizing: border-box;
    color: #e6e6e6;
  }
  .cal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
  }
  .btns {
    display: inline-flex;
    gap: 0.25rem;
  }
  .btn {
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #e6e6e6;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    background: transparent;
  }
  .btn:hover {
    background: #34363b;
  }
  .title {
    font-weight: 600;
    white-space: nowrap;
  }
  .title .muted {
    color: #9aa0a6;
    font-weight: 400;
    margin-left: 0.5rem;
    font-size: 0.9em;
  }
  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--gap);
    margin-bottom: 0.25rem;
  }
  .wk {
    text-align: center;
    color: #9aa0a6;
    font-size: 0.8rem;
    user-select: none;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--gap);
  }
  .day {
    height: var(--cal-cell);
    line-height: calc(var(--cal-cell) - 2px);
    text-align: center;
    padding: 0;
    border-radius: 0.25rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: #112a36;
    color: #e6e6e6;
    box-sizing: border-box;
    cursor: pointer;
  }
  .day:hover {
    background: #1f4e6c;
  }
  .day.out {
    opacity: 0.45;
  }
  .day.today {
    box-shadow: inset 0 0 0 2px #296faa;
  }
  .day.selected {
    background: #1f4e6c;
    color: #3394e4;
    border-color: #296faa;
  }
  .day:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .day.weekend {
    background-color: #0d1b21;
    color: #465679;
  }
  .day.weekend.today {
    background-color: #3394e4;
    color: #fff;
  }
  .day.weekend.selected {
    background: #1f4e6c;
    color: #fff;
  }
</style>
