import { writable } from "svelte/store";

export type CourseDict = Record<string, { name: string; teacher?: string, number?: number, weeks?: number }>;
export const courseDictStore = writable<CourseDict>({}); // current active profile in the app

export const classTotalsStore = writable<Map<string, number>>(new Map()); // active totals

// (Optional) tiny helpers to load/store Map as a plain object
export function mapToObject(m: Map<string, number>) {
  return Object.fromEntries(m.entries());
}
export function objectToMap(o: Record<string, number>) {
  return new Map<string, number>(Object.entries(o));
}
