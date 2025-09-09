export type Intake = "Jan" | "Mar" | "Aug" | "Oct";
export type Mode = "FT" | "PT";

export interface RowRaw {
  weekStart: string; // e.g. 2025-01-06 (or locale string)
  calendarWeek: string; // e.g. "Week 2" or "2"
  [classId: string]: string; // "Jan25FT": "1. PRF" etc.
}

export interface ClassKey {
  intake: Intake;
  year: number; // e.g. 25
  mode: Mode; // FT/PT
}

export interface Entry {
  date: string; // ISO
  calendarWeek: number;
  classId: string; // "Jan25FT"
  intake: Intake;
  mode: Mode;
  year: number; // 25
  courseCode: string; // "PRF"
  courseWeek: number; // 1,2,3...
  isStart: boolean;
  isAssessment: boolean;
}

export interface CourseDict {
  [code: string]: { name: string; teacher: string; color?: string };
}
