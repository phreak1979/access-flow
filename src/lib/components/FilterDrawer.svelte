<script lang="ts">
  import Filters from "./Filters.svelte";
  import type { Intake, Mode } from "$lib/types";
  import { createEventDispatcher } from "svelte";
  import UploadArea from "./UploadArea.svelte";

  export let intake: Intake | "" = "";
  export let mode: Mode | "" = "";
  export let courseQuery = "";
  export let classId = "";
  export let weekDate = "";
  export let teacherQuery = "";
  export let classOptions: string[] = [];

  const dispatch = createEventDispatcher<{
    change: any;
    loaded: { entries: any[] };
  }>();
  const forward = (e: CustomEvent) => dispatch("change", e.detail);
  const onUploadLoaded = (e: CustomEvent<{ entries: any[] }>) => dispatch("loaded", e.detail);

  let pinned = false;
  const togglePin = () => (pinned = !pinned);
</script>

<div class="drawer-wrap {pinned ? 'is-open shadow-lg ' : ''} ">
  <aside class="drawer card shadow">
    <button class="handle btn btn-dark" type="button" aria-label="Filters" on:click={togglePin}>
      <div class="drawer-handle">
        <i class="fa-solid fa-filter"></i>
      </div>
    </button>

    <div class="card-header d-flex align-items-center justify-content-between">
      <strong>Filters</strong>
      <button class="btn btn-sm btn-outline-light" on:click={togglePin} aria-label="Close">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <!-- <div class="row"> -->
    <!--   <div class="col-12"> -->
    <!--     <UploadArea on:loaded={onUploadLoaded} /> -->
    <!--   </div> -->
    <!-- </div> -->
    <div class="card-body">
      <Filters
        bind:intake
        bind:mode
        bind:courseQuery
        bind:classId
        bind:weekDate
        bind:teacherQuery
        {classOptions}
        on:change={forward}
      />
    </div>
  </aside>
</div>

<style>
  :global(:root) {
    --filter-drawer-width: 360px; /* adjust to taste */
    --handle-size: 32px;
    --handle-offset: 16px; /* how far the gear “sticks out” */
  }

  /* Fixed container at the right edge of the viewport */
  .drawer-wrap {
    position: fixed;
    top: 70px;
    right: 0;
    height: 100dvh;
    width: var(--filter-drawer-width);
    z-index: 1050;
    pointer-events: none; /* page stays interactive when closed */
  }

  /* Drawer starts off-screen to the right, except for the handle */
  .drawer {
    position: absolute;
    top: 0;
    right: 0;
    width: var(--filter-drawer-width);
    height: 100%;
    transform: translateX(100%); /* fully hidden */
    transition: transform 200ms ease;
    pointer-events: auto; /* can interact when visible */
    background: #1e1f22;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  /* The handle is positioned on the left edge of the drawer,
     with a negative left so it "peeks" out even when hidden */
  .handle {
    position: absolute;
    top: 25%;
    left: calc(-1 * var(--handle-offset));
    width: var(--handle-size);
    height: var(--handle-size);
    transform: translate(-50%, -50%);
    border-radius: 0.25rem; /* square with subtle rounding */
    display: flex;
    justify-content: center; /* ensures gear is centered */
    place-items: center;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
    pointer-events: auto;
    background: #272729; /* optional: match drawer bg */
  }
  /* Reveal drawer on hover OR when pinned open */

  .drawer-wrap.is-open .drawer {
    transform: translateX(0);
  }

  /* Optional: on narrow screens, make it wider & rely on click-to-pin */
  @media (max-width: 768px) {
    :global(:root) {
      --filter-drawer-width: min(92vw, 420px);
    }
    .drawer-wrap {
      pointer-events: auto;
    } /* allow taps to open */
  }
</style>
