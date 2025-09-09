// src/routes/+page.server.ts
import { redirect } from "@sveltejs/kit";

export const load = () => {
  throw redirect(307, "/login");
};
