import { redirect } from "@sveltejs/kit";

export function load() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("refresh_token");
    sessionStorage.removeItem("expires_at");
  }

  throw redirect(303, "/login");
}
