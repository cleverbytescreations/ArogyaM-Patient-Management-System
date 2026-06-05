import { http, HttpResponse } from "msw";
import type { UserProfile } from "@/types/auth";
import type { User, Role } from "@/types/users";
import type { PaginatedResponse } from "@/types/api";

const BASE = "/api/v1";

export const mockUser: UserProfile = {
  id: "user-1",
  username: "admin",
  full_name: "Admin User",
  email: "admin@example.com",
  roles: ["ADMIN"],
  permissions: [
    "manage_users",
    "view_audit",
    "backup_control",
    "manage_master_data",
    "view_patient",
    "create_patient",
    "edit_patient",
    "view_medical_history",
    "add_consultation",
    "add_prescription",
    "add_discharge_summary",
    "upload_document",
    "manage_followups",
    "request_merge",
    "merge_records",
    "view_reports",
    "export",
  ],
  is_doctor: false,
  last_login_at: "2026-06-05T10:00:00Z",
  status: "ACTIVE",
};

export const mockUserList: User[] = [
  {
    id: "user-1",
    username: "admin",
    full_name: "Admin User",
    email: "admin@example.com",
    mobile: null,
    roles: ["ADMIN"],
    is_doctor: false,
    status: "ACTIVE",
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    last_login_at: "2026-06-05T10:00:00Z",
    password_changed_at: null,
  },
  {
    id: "user-2",
    username: "drsmith",
    full_name: "Dr. John Smith",
    email: "john.smith@example.com",
    mobile: "9876543210",
    roles: ["DOCTOR"],
    is_doctor: true,
    status: "ACTIVE",
    version: 2,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-05-20T00:00:00Z",
    last_login_at: null,
    password_changed_at: "2026-02-01T00:00:00Z",
  },
];

export const mockRoles: Role[] = [
  { id: 1, code: "ADMIN", name: "Administrator", description: "Full system access" },
  { id: 2, code: "DOCTOR", name: "Doctor", description: "Clinical access" },
  { id: 3, code: "RECEPTION", name: "Receptionist", description: "Reception access" },
  { id: 4, code: "DATA_ENTRY", name: "Data Entry Staff", description: "Data entry access" },
];

const mockPaginatedUsers: PaginatedResponse<User> = {
  items: mockUserList,
  total: 2,
  page: 1,
  page_size: 20,
};

export const handlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = await request.json() as { username: string; password: string };
    if (body.username === "admin" && body.password === "password123") {
      return HttpResponse.json({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        token_type: "bearer",
        expires_in: 900,
      });
    }
    if (body.username === "locked") {
      return HttpResponse.json(
        { error: { code: "AUTH_ACCOUNT_LOCKED", message: "Account is locked.", details: [], request_id: "r1" } },
        { status: 401 }
      );
    }
    if (body.username === "disabled") {
      return HttpResponse.json(
        { error: { code: "AUTH_ACCOUNT_DISABLED", message: "Account is disabled.", details: [], request_id: "r2" } },
        { status: 403 }
      );
    }
    return HttpResponse.json(
      { error: { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid credentials.", details: [], request_id: "r3" } },
      { status: 401 }
    );
  }),

  http.post(`${BASE}/auth/refresh`, () => {
    return HttpResponse.json({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      token_type: "bearer",
      expires_in: 900,
    });
  }),

  http.post(`${BASE}/auth/logout`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/me`, () => {
    return HttpResponse.json(mockUser);
  }),

  http.get(`${BASE}/me/permissions`, () => {
    return HttpResponse.json({
      permissions: mockUser.permissions,
      roles: mockUser.roles,
    });
  }),

  http.get(`${BASE}/users`, () => {
    return HttpResponse.json(mockPaginatedUsers);
  }),

  http.post(`${BASE}/users`, async ({ request }) => {
    const body = await request.json() as { username: string; full_name: string };
    const newUser: User = {
      id: "user-new",
      username: body.username,
      full_name: body.full_name,
      email: null,
      mobile: null,
      roles: ["DATA_ENTRY"],
      is_doctor: false,
      status: "ACTIVE",
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login_at: null,
      password_changed_at: null,
    };
    return HttpResponse.json(newUser, { status: 201 });
  }),

  http.put(`${BASE}/users/:id`, async ({ params }) => {
    const user = mockUserList.find((u) => u.id === params.id);
    if (!user) {
      return HttpResponse.json(
        { error: { code: "RESOURCE_NOT_FOUND", message: "User not found.", details: [], request_id: "r4" } },
        { status: 404 }
      );
    }
    return HttpResponse.json({ ...user, version: user.version + 1 });
  }),

  http.put(`${BASE}/users/:id/status`, async ({ params, request }) => {
    const user = mockUserList.find((u) => u.id === params.id);
    const body = await request.json() as { status: string };
    if (!user) return HttpResponse.json({}, { status: 404 });
    return HttpResponse.json({ ...user, status: body.status });
  }),

  http.post(`${BASE}/users/:id/reset-password`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/roles`, () => {
    return HttpResponse.json(mockRoles);
  }),
];
