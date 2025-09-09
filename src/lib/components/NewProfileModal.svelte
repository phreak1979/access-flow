<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let programId: string | number;
  export let directusUrl: string;
  export let token: string;
  export let show = false;

  const dispatch = createEventDispatcher();

  let description = "";
  let errorMsg: string | null = null;
  let successMsg: string | null = null;

  function close() {
    show = false;
    dispatch("close");
  }

  function resetState() {
    description = "";
    errorMsg = null;
    successMsg = null;
  }

  async function uploadAndAssign() {
    errorMsg = null;
    successMsg = null;

    try {
      const uploadRes = await fetch(`${directusUrl}/items/courseprofile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: description, program: programId }),
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed (HTTP ${uploadRes.status}).`);
      }

      await uploadRes.json();
      successMsg = "Uploaded and linked successfully!";
      dispatch("updated");
    } catch (err: any) {
      console.error(err);
      errorMsg = err?.message || "Something went wrong.";
    }
  }
</script>

<!-- Modal -->
{#if show}
  <div
    class="modal fade {show ? 'show' : ''} d-block"
    tabindex="-1"
    aria-modal={show}
    role="dialog"
    style="display:{show ? 'block' : 'none'}; z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered">
      <!-- Solid-ish grey box (no transparency) -->
      <div class="modal-content modal-solid">
        <div class="modal-header">
          <h5 class="modal-title">New Study Plan (Profile) name</h5>
          <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
        </div>

        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Description</label>
            <input
              class="form-control"
              placeholder="Enter a description for this study plan profile..."
              bind:value={description}
            />
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
          >
            Cancel
          </button>
          <button class="btn btn-primary" on:click={uploadAndAssign}> Upload & Link </button>
        </div>
      </div>
    </div>
  </div>
{/if}
{#if show}
  <!-- Darker, blurred backdrop -->
  <div class="modal-backdrop fade show position-fixed top-0 start-0 w-100 h-100" style="z-index:1050;"></div>
{/if}

<style>
  /* Keep Bootstrap-like toggle without BS JS */
  .modal {
    display: none;
  }
  .modal.show {
    display: block;
  }

  /* Backdrop tuning */
  .modal-backdrop {
    --bs-backdrop-bg: #000;
    --bs-backdrop-opacity: 0.75; /* adjust to taste */
    background-color: rgba(0, 0, 0, 0.75);
  }
  .modal-backdrop.show {
    backdrop-filter: blur(10px); /* frosted look */
  }

  /* Solid grey modal box (override any theme transparency) */
  .modal-solid {
    /* pick your grey; this one matches your screenshot vibe */
    background-color: #2c333a !important; /* solid */
    color: #e8ecef;
    border: 1px solid #3b4650;
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.6),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  }

  /* Inputs still readable on dark/grey background */
  .modal-solid .form-control {
    background-color: #1f252b;
    color: #e8ecef;
    border-color: #39434d;
  }
  .modal-solid .form-control::placeholder {
    color: rgba(232, 236, 239, 0.55);
  }

  .modal-solid .modal-header {
    border-bottom-color: #3b4650;
  }
  .modal-solid .modal-footer {
    border-top-color: #3b4650;
  }
</style>
