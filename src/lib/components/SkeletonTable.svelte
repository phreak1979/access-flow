<script lang="ts">
  export let rows = 10;
  export let cols = 8;
  export let title = "Loading…";
</script>

<div class="card" aria-busy="true" aria-live="polite">
  <div class="card-header d-flex align-items-center gap-2">
    <div class="skel skel-pill skel-sm" style="width: 140px"></div>
    <div class="skel skel-pill skel-xs" style="width: 80px"></div>
  </div>

  <div class="card-body">
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead>
          <tr>
            {#each Array(cols) as _, i}
              <th>
                <div class="skel skel-pill" style="width:{i % 2 ? 70 : 120}px"></div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each Array(rows) as _}
            <tr>
              {#each Array(cols) as __, j}
                <td>
                  <div class="skel" style="width:{j % 3 ? 65 : 120}%; height:14px"></div>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .skel {
    position: relative;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.06) 25%,
      rgba(255, 255, 255, 0.16) 37%,
      rgba(255, 255, 255, 0.06) 63%
    );
    animation: skel 1.2s ease-in-out infinite;
  }
  .skel-pill {
    height: 18px;
  }
  .skel-sm {
    height: 14px;
    border-radius: 999px;
  }
  .skel-xs {
    height: 10px;
    border-radius: 999px;
  }

  @keyframes skel {
    0% {
      background-position: -200px 0;
    }
    100% {
      background-position: calc(200px + 100%) 0;
    }
  }
</style>
