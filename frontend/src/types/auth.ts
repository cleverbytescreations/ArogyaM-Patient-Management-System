export type RoleCode = "ADMIN" | "DOCTOR" | "RECEPTION" | "DATA_ENTRY";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  roles: RoleCode[];
  permissions: string[];
  is_doctor: boolean;
  last_login_at: string | null;
  status: string;
}

export interface PermissionsResponse {
  permissions: string[];
  roles: RoleCode[];
}
