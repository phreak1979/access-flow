<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Intake, Mode } from "$lib/types";

  export let intake: Intake | "" = "";
  export let mode: Mode | "" = "";
  export let courseQuery = "";
  export let classId: string = "";
  export let classOptions: string[] = [];
  export let weekDate: string = ""; // "YYYY-MM-DD"
  export let teacherQuery = ""; // ← NEW

  const dispatch = createEventDispatcher();

  function emit() {
    dispatch("change", {
      intake,
      mode,
      courseQuery,
      classId,
      weekDate,
      teacherQuery,
    });
  }

  function clearWeek() {
    weekDate = "";
    emit();
  }
</script>

<div class="row">
  <div class="col-12">
    <label class="form-label mb-1" for="all-months">Intake month</label>
    <select class="form-select" id="all-months" bind:value={intake} on:change={emit}>
      <option value="">All months</option>
      <option>Jan</option><option>Mar</option><option>Aug</option><option>Oct</option>
    </select>
  </div>
</div>

<div class="row pt-1">
  <div class="col-12">
    <label class="form-label mb-1" for="ft-pt">FT/PT</label>
    <select class="form-select" id="ft-pt" bind:value={mode} on:change={emit}>
      <option value="">All</option>
      <option>FT</option><option>PT</option>
    </select>
  </div>
</div>

<div class="row pt-1">
  <div class="col-12">
    <label class="form-label mb-1" for="class-name">Class</label>
    <select class="form-select" id="class-name" bind:value={classId} on:change={emit}>
      <option value="">All</option>
      {#each classOptions as opt}
        <option value={opt}>{opt}</option>
      {/each}
    </select>
  </div>

  <div class="col-12">
    <label class="form-label mb-1" for="dates">Date</label>
    <div class="d-flex gap-2">
      <input class="form-control" id="dates" type="date" bind:value={weekDate} on:change={emit} />
      <button class="btn btn-outline-secondary" type="button" aria-label="Info" on:click={clearWeek}
        ><i class="fa-solid fa-xmark text-info"></i></button
      >
    </div>
  </div>
  <div class="row pt-1">
    <div class="col-12">
      <label class="form-label mb-1" for="course-code">Search course code</label>
      <input class="form-control" placeholder="e.g. PRF" bind:value={courseQuery} on:input={emit} id="course-code" />
    </div>
  </div>
  <div class="row pt-1">
    <div class="col-12">
      <label class="form-label mb-1" for="teachers">Search teacher</label>
      <input
        class="form-control"
        placeholder="e.g. JP, Madri, All"
        bind:value={teacherQuery}
        on:input={emit}
        id="teachers"
      />
    </div>
  </div>
</div>
