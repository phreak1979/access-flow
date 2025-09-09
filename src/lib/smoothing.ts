// src/lib/smoothing.ts
import type { Entry } from "./types"; // or "../lib/types" if that's your path

export type Run = {
  id: string;                // `${classId}|${courseCode}`
  classId: string;
  courseCode: string;
  weeks: string[];           // monday YMD (already normalized in your data)
  weight: number;            // e.g. students per week for the class
  eligible: string[];        // teachers allowed to teach this course
};

export type Cap = { weeklySlots: number }; // capacity per week (classes or students)

export type AssignResult = {
  assign: Record<string, string>; // runId -> teacher (or "(unassigned)")
  load: Map<string, Map<string, number>>; // teacher -> (week -> load)
  runs: Run[];
};

/**
 * Build "runs" (one per classId|courseCode)
 */
export function buildRuns(
  entries: Entry[],
  classTotals: Map<string, number>,
  eligibleByCourse: Record<string, string[]>,         // e.g. { PRF: ["Madri","Connor"], ... }
  fallbackTeachers: string[] = []                      // used if eligible missing
): Run[] {
  const byKey = new Map<string, Entry[]>();

  for (const e of entries) {
    const k = `${e.classId}|${e.courseCode}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(e);
  }

  const runs: Run[] = [];
  for (const [id, arr] of byKey) {
    const [classId, courseCode] = id.split("|");
    const weeks = [...new Set(arr.map((e) => e.date))].sort();
    const weight = classTotals.get(classId.toUpperCase()) ?? 0;
    const eligible = eligibleByCourse[courseCode] && eligibleByCourse[courseCode].length
      ? eligibleByCourse[courseCode]
      : [...fallbackTeachers]; // fall back to "anyone"

    runs.push({ id, classId, courseCode, weeks, weight, eligible });
  }

  // Hardest first (big & long)
  runs.sort(
    (a, b) => b.weight * b.weeks.length - a.weight * a.weeks.length
  );
  return runs;
}

/**
 * Greedy smoother: assign each run to the teacher that minimizes
 * (2 * peakAfter + 0.1 * sumOfDeltas) while respecting capacity.
 */
export function greedySmoothAssign(
  runs: Run[],
  teachers: string[],
  cap: Record<string, Cap>
): AssignResult {
  const load = new Map<string, Map<string, number>>();  // t -> week -> load
  const assign: Record<string, string> = {};            // runId -> teacher

  const get = (t: string, w: string) => load.get(t)?.get(w) ?? 0;
  const add = (t: string, w: string, v: number) => {
    const m = load.get(t) ?? new Map<string, number>();
    m.set(w, (m.get(w) ?? 0) + v);
    load.set(t, m);
  };
  const peakLoad = (t: string) => {
    const m = load.get(t) ?? new Map<string, number>();
    let peak = 0;
    for (const v of m.values()) peak = Math.max(peak, v);
    return peak;
  };

  for (const r of runs) {
    let bestT: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const t of r.eligible) {
      if (!teachers.includes(t)) continue;

      // capacity check
      let ok = true;
      for (const w of r.weeks) {
        if (get(t, w) + r.weight > (cap[t]?.weeklySlots ?? Infinity)) {
          ok = false; break;
        }
      }
      if (!ok) continue;

      // simulate
      const prePeak = peakLoad(t);
      let postPeak = prePeak;
      let deltaSum = 0;
      for (const w of r.weeks) {
        const before = get(t, w);
        const after = before + r.weight;
        postPeak = Math.max(postPeak, after);
        deltaSum += Math.abs(after - before);
      }

      const score = 2 * postPeak + 0.1 * deltaSum; // tuneable weights
      if (score < bestScore) { bestScore = score; bestT = t; }
    }

    if (bestT) {
      assign[r.id] = bestT;
      for (const w of r.weeks) add(bestT, w, r.weight);
    } else {
      assign[r.id] = "(unassigned)";
    }
  }

  return { assign, load, runs };
}

/**
 * Convenience: produce a flat table for UI
 */
export function assignmentTable(res: AssignResult) {
  return res.runs.map((r) => ({
    classId: r.classId,
    courseCode: r.courseCode,
    teacher: res.assign[r.id],
    weeks: r.weeks.length,
    studentsPerWeek: r.weight
  }));
}
