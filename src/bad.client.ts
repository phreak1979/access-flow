// src/hooks.client.ts
import type { HandleClientError } from "@sveltejs/kit";

export const handleError: HandleClientError = ({ error, event }) => {
  // console.error("[client handleError]", event.url.toString(), error);

  // This object gets merged into the `error` prop in +error.svelte
  return {
    message: (error as any)?.message ?? "Client-side error",
  };
};
