<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let programId: string | number;
  export let directusUrl: string;
  export let token: string;
  export let show = false;

  const dispatch = createEventDispatcher();

  let fileInput: HTMLInputElement | null = null;
  let file: File | null = null;
  let description: string = "";
  let isUploading = false;
  let errorMsg: string | null = null;
  let successMsg: string | null = null;

  const ACCEPT = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];

  function close() {
    show = false;
    dispatch("close");
  }

  function resetState() {
    file = null;
    description = "";
    errorMsg = null;
    successMsg = null;
    if (fileInput) fileInput.value = "";
  }

  async function uploadAndAssign() {
    errorMsg = null;
    successMsg = null;

    if (!file) {
      errorMsg = "Please choose an Excel file first.";
      return;
    }

    if (!ACCEPT.includes(file.type)) {
      const nameOk = /\.(xlsx|xls)$/i.test(file.name);
      if (!nameOk) {
        errorMsg = "Unsupported file type. Please upload a .xlsx or .xls file.";
        return;
      }
    }

    isUploading = true;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      if (description) fd.append("description", description);

      const uploadRes = await fetch(`${directusUrl}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (!uploadRes.ok) {
        let serverDetail = "";
        try {
          const j = await uploadRes.json();
          serverDetail = JSON.stringify(j);
        } catch {
          serverDetail = await uploadRes.text();
        }
        throw new Error(`Upload failed (HTTP ${uploadRes.status}). ${serverDetail}`);
      }

      const uploadJson = await uploadRes.json();
      const fileId = uploadJson?.data?.id;
      if (!fileId) throw new Error("No file id returned from Directus.");

      const patchRes = await fetch(`${directusUrl}/items/programs/${programId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accesslist: fileId }),
      });

      if (!patchRes.ok) {
        const t = await patchRes.text();
        throw new Error(`Patch failed (HTTP ${patchRes.status}): ${t}`);
      }

      successMsg = "Uploaded and linked successfully!";
      dispatch("updated", { fileId });
    } catch (err: any) {
      console.error(err);
      errorMsg = err?.message || "Something went wrong.";
    } finally {
      isUploading = false;
    }
  }
</script>

<div
  class="modal fade {show ? 'show' : ''}"
  tabindex="-1"
  style="display: {show ? 'block' : 'none'};"
  aria-modal={show}
  role="dialog"
>
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content modal-background">
      <div class="modal-header">
        <h5 class="modal-title">Upload Access List (Excel)</h5>
        <button type="button" class="btn-close btn-close-white" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">Choose Excel file</label>
          <input
            class="form-control"
            type="file"
            bind:this={fileInput}
            on:change={(e: Event) => {
              const t = e.target as HTMLInputElement;
              file = t.files?.[0] ?? null;
            }}
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          />
          <div class="form-text text-light">Accepted: .xlsx, .xls</div>
        </div>

        <div class="mb-3" hidden>
          <label class="form-label">Description</label>
          <textarea
            class="form-control"
            rows="2"
            placeholder="Enter a description for this file..."
            bind:value={description}
          ></textarea>
        </div>

        {#if errorMsg}
          <div class="alert alert-danger py-2">{errorMsg}</div>
        {/if}
        {#if successMsg}
          <div class="alert alert-success py-2">{successMsg}</div>
        {/if}
      </div>
      <div class="modal-footer">
        <button
          class="btn btn-secondary"
          on:click={() => {
            resetState();
            close();
          }}
          disabled={isUploading}
        >
          Cancel
        </button>
        <button class="btn btn-primary" on:click={uploadAndAssign} disabled={isUploading}>
          {#if isUploading}
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Uploading…
          {:else}
            Upload & Link
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

{#if show}
  <div class="modal-backdrop fade show"></div>
{/if}

<style>
  .modal {
    display: none;
  }
  .modal.show {
    display: block;
  }
  .modal-background {
    background: #3f4449;
  }
</style>
