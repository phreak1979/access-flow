<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { parseExcelToEntries } from "$lib/parser";

  const dispatch = createEventDispatcher();
  let file: File | null = null;
  let busy = false;
  let error = "";

  async function handleUpload() {
    if (!file) return;
    busy = true;
    error = "";
    try {
      const entries = await parseExcelToEntries(file);
      dispatch("loaded", { entries });
    } catch (e: any) {
      error = e?.message || String(e);
    } finally {
      busy = false;
    }
  }
</script>

<!-- <div class="card p-3"> -->
<div class="p-2">
  <h5 class="mb-2">Upload Access List (Excel)</h5>
  <input
    type="file"
    accept=".xlsx,.xls"
    class="form-control mb-2"
    on:change={(e: any) => (file = e.currentTarget.files?.[0] ?? null)}
  />
  <div class="d-flex gap-2">
    <button
      class="btn btn-sm btn-primary"
      disabled={!file || busy}
      on:click={handleUpload}
    >
      {busy ? "Parsing…" : "Upload & Parse"}
    </button>
    {#if file}<span class="text-secondary small align-self-center"
        >{file.name}</span
      >{/if}
  </div>
  {#if error}<div class="text-danger mt-2">{error}</div>{/if}
</div>
