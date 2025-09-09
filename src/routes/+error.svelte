<script lang="ts">
  // SvelteKit passes these in automatically
  export let status: number;
  export let error: Error & { message?: string };
</script>

<svelte:head>
  <title>{status === 404 ? "Page not found" : "Error"} • Access FLOW</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="container py-5">
  <h1 class="display-4 mb-3">{status}</h1>
  <p class="lead">
    {#if status === 404}
      We couldn’t find that page.
    {:else}
      {error?.message ?? "Something went wrong."}
    {/if}
  </p>

  <div class="mt-4 d-flex gap-2">
    <a class="btn btn-primary" href="/">Go to dashboard</a>
    <a class="btn btn-outline-secondary" href="javascript:history.back()">Go back</a>
  </div>

  <!-- Optional helpful bits -->
  <details class="mt-4">
    <summary>Technical details</summary>
    <pre class="mt-2 small">{JSON.stringify({ status, message: error?.message }, null, 2)}</pre>
  </details>
</div>

<style>
  .container {
    max-width: 720px;
  }
</style>
