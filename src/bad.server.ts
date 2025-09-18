// src/hooks.client.ts or src/hooks.server.ts
import type { HandleError } from "@sveltejs/kit";

export const handleError: HandleError = async ({ error, event }) => {
  // return a safe message that ends up as error.message in +error.svelte
  return {
    message:
      (error as any)?.message ??
      (event.route.id ? `Route error: ${event.route.id}` : `Not found: ${event.url.pathname}`),
  };
};
