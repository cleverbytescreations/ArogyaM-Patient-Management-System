import type { RoleCode } from "./auth";

export type UserStatus = "ACTIVE" | "DISABLED" | "LOCKED";

export interface Role {
  id: number;
  code: RoleCode;
  name: string;
  description: string | null;
}

export interface User {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  roles: RoleCode[];
  is_doctor: boolean;
  is_superuser: boolean;
  status: UserStatus;
  version: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  password_changed_at: string | null;
}

export interface UserCreateRequest {
  username: string;
  full_name: string;
  email?: string;
  mobile?: string;
  password: string;
  is_doctor: boolean;
  role_codes: RoleCode[];
}

export interface UserUpdateRequest {
  full_name?: string;
  email?: string;
  mobile?: string;
  is_doctor?: boolean;
  role_codes?: RoleCode[];
  version: number;
}

export interface UserStatusUpdateRequest {
  status: UserStatus;
  version: number;
}

export interface PasswordResetRequest {
  new_password: string;
}

export interface UserListParams {
  page?: number;
  page_size?: number;
  q?: string;
  status?: UserStatus;
  is_doctor?: boolean;
}
