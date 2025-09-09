<script lang="ts">
  import { fly } from "svelte/transition";

  /** Parent controls visibility: <Toast bind:show /> */
  export let show = false;

  /** Text + style */
  export let message = "";
  export let variant: "success" | "danger" | "info" = "success";

  /** Auto-hide delay (ms). Set 0 to disable. */
  export let autoHideMs = 2500;

  let t: ReturnType<typeof setTimeout>;
  $: if (show) {
    clearTimeout(t);
    if (autoHideMs > 0) t = setTimeout(() => (show = false), autoHideMs);
  }

  function close() {
    clearTimeout(t);
    show = false;
  }
</script>

{#if show}
  <div class="toast-wrap">
    <div
      class="toast-message alert alert-{variant}"
      in:fly={{ y: 24, duration: 200 }}
      out:fly={{ y: 24, duration: 200 }}
      role="status"
      aria-live="polite"
    >
      {#if variant == "danger"}
        <span><i class="fa-solid fa-triangle-exclamation"></i> {message}</span>
      {/if}
      {#if variant == "success"}
        <span><i class="fa-solid fa-check"></i> {message}</span>
      {/if}
      {#if variant == "info"}
        <span><i class="fa-solid fa-exclamation"></i> {message}</span>
      {/if}
      <button class="close-btn" on:click={close} aria-label="Close">×</button>
    </div>
  </div>
{/if}

<style>
  .toast-wrap {
    position: fixed;
    bottom: 1.5rem; /* distance from bottom */
    left: 50%;
    transform: translateX(-50%);
    z-index: 2000;
    display: flex;
    justify-content: center;
    pointer-events: none; /* clicks pass through background */
  }
  .toast-message {
    pointer-events: auto; /* but toast itself is clickable */
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    border-radius: 0.5rem;
    color: #fff;
    font-weight: 600;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
    min-width: 260px;
    max-width: 460px;
  }
  .toast-message.success {
    background: #28a745;
  } /* green */
  .toast-message.danger {
    background: #dc3545;
  }
  .toast-message.info {
    background: #17a2b8;
  }

  .close-btn {
    margin-left: auto;
    background: transparent;
    border: 0;
    color: inherit;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
  }
</style>
