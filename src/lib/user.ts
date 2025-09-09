export interface User {
  appearance?: string | null;
  avatar?: string | null;
  description?: string | null;
  email: string;
  id: string;
  last_name: string;
  first_name: string;
  fullname?: string;
}
