export interface ClassInfo {
  id: number;
  name: string;     // e.g. "FED", "BED1", "BED2"
  totals: Totals;
}

export type Totals = Record<string, number>;
export type Class = Record<string, number>;

export interface Course {
  name: string;     // "JavaScript 1"
  number: number;   // ordering/index
  teacher: string;
  weeks: number;
}

export interface UploadedBy {
  first_name: string;
  last_name: string
}

export interface AccessListType {
  id?: string;
  filename_download?: string | null;
  uploaded_by?: UploadedBy;
  uploaded_by_name?: string;
  uploaded_on?: string | null;
}
export interface AccessListTypeWithLabel extends AccessListType {
  label?: string;
  value?: string;
}

/** keyed by course code e.g. "JS1", "API", "PRF" */
export type CourseProfileMap = Record<string, Course>;


export interface CourseProfile {
  id: number;
  name: string | null;
  profile: CourseProfileMap;
  date_created: string;
  date_updated: string;
  user_created: string
  user_created_name: string;
  user_updated: UploadedBy;
}

export interface Program {
  name: string;
  id: number
}

export interface ProgramWithValue extends Program {
  value: number;
}

export type ProgramsResponse = Program[]

export interface ProgramOption {
  class: string | Totals | null;
  courses: CourseProfile[];
  id: number;
  name: string;     // e.g. "FED - Proposed"
  value: string;    // e.g. "FED-proposed"
  accesslist: AccessListType | null
  date_updated: string | null
  user_updated: UploadedBy
}

export interface ProgramOptionsResponse {
  data: ProgramOption[];
}



