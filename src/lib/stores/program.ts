// src/lib/stores/program.ts
import { writable, type Writable } from 'svelte/store';

function createPersistedStore<T>(key: string, initial: T): Writable<T> {
  let start = initial;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      try { start = JSON.parse(raw) as T; } catch { }
    }
  }

  const store = writable<T>(start);

  if (typeof window !== 'undefined') {
    store.subscribe((v) => {
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { }
    });
    window.addEventListener('storage', (e) => {
      if (e.key === key) {
        if (e.newValue == null) store.set(initial);
        else {
          try { store.set(JSON.parse(e.newValue) as T); }
          catch { store.set(initial); }
        }
      }
    });
  }
  return store;
}

// 0 as the default
export const globalProgramId = createPersistedStore<number>('programId', 0);
