<script lang="ts">
  import { page } from "$app/stores";

  // Props SvelteKit may (or may not) pass
  export let status: number | undefined;
  export let error: unknown;

  function deriveStatus(err: unknown): number {
    // Most robust source on client navigations:
    if (typeof $page.status === "number") return $page.status;

    // SSR / some errors:
    if (typeof status === "number") return status;

    // Common shapes
    if (err && typeof err === "object") {
      const any = err as any;
      if (typeof any.status === "number") return any.status;
      if (any.body && typeof any.body.status === "number") return any.body.status;
    }

    // Last-chance heuristic
    const msg = (err && typeof err === "object" && "message" in (err as any) && (err as any).message) || "";
    if (typeof msg === "string" && /not\s*found/i.test(msg)) return 404;

    return 500;
  }

  function pickMessage(err: unknown, code: number, path: string): string {
    if (code === 404) return `Not found: ${path}`;
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const any = err as any;
      if (typeof any.message === "string" && any.message) return any.message;
      if (any.body && typeof any.body === "object") {
        if (typeof any.body.message === "string") return any.body.message;
        if (typeof any.body.error === "string") return any.body.error;
      }
    }
    return "Something went wrong.";
  }

  const code = deriveStatus(error);
  const message = pickMessage(error, code, $page.url.pathname);
</script>

<svelte:head>
  <title>{code === 404 ? "Page not found" : "Error"} • Access FLOW</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="container py-5">
  <h1 class="display-4 mb-3">{code}</h1>
  <p class="lead">{message}</p>

  <div class="mt-4 d-flex gap-2">
    <a class="btn btn-primary" href="/">Go to dashboard</a>
    <a class="btn btn-outline-secondary" href="javascript:history.back()">Go back</a>
  </div>

  <details class="mt-4">
    <summary>Technical details</summary>
    <pre class="mt-2 small">{JSON.stringify({ propStatus: status, pageStatus: $page.status, error }, null, 2)}</pre>
  </details>
</div>

<style>
  .container {
    max-width: 720px;
  }
</style>
