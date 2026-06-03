export interface User {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  role?: string | null;
  [key: string]: unknown;
}
