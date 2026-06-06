import { http, HttpResponse } from "msw";
import type { UserProfile } from "@/types/auth";
import type { User, Role } from "@/types/users";
import type { PaginatedResponse } from "@/types/api";
import type { Patient, PatientSearchResult } from "@/types/patients";
import type { MasterDataItem, OpSequence } from "@/types/masterData";

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
    is_superuser: true,
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
    is_superuser: false,
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

// ── Master data fixtures ─────────────────────────────────────────────────────

export const mockGenderOptions: MasterDataItem[] = [
  { id: 1, type: "gender", code: "MALE", label: "Male", sort_order: 1, is_active: true },
  { id: 2, type: "gender", code: "FEMALE", label: "Female", sort_order: 2, is_active: true },
  { id: 3, type: "gender", code: "OTHER", label: "Other", sort_order: 3, is_active: true },
];

export const mockBloodGroupOptions: MasterDataItem[] = [
  { id: 4, type: "blood_group", code: "A_POS", label: "A+", sort_order: 1, is_active: true },
  { id: 5, type: "blood_group", code: "A_NEG", label: "A−", sort_order: 2, is_active: true },
  { id: 6, type: "blood_group", code: "B_POS", label: "B+", sort_order: 3, is_active: true },
  { id: 7, type: "blood_group", code: "O_POS", label: "O+", sort_order: 4, is_active: true },
];

export const mockMaritalStatusOptions: MasterDataItem[] = [
  { id: 8, type: "marital_status", code: "SINGLE", label: "Single", sort_order: 1, is_active: true },
  { id: 9, type: "marital_status", code: "MARRIED", label: "Married", sort_order: 2, is_active: true },
];

export const mockDietaryOptions: MasterDataItem[] = [
  { id: 10, type: "dietary_preference", code: "VEG", label: "Vegetarian", sort_order: 1, is_active: true },
  { id: 11, type: "dietary_preference", code: "NONVEG", label: "Non-Vegetarian", sort_order: 2, is_active: true },
];

export const mockOpSequences: OpSequence[] = [
  {
    id: 1,
    category_code: "OPN",
    prefix: "OPN",
    description: "General Outpatient",
    last_sequence: 42,
    padding_width: 4,
    reset_policy: "NEVER",
    is_active: true,
  },
  {
    id: 2,
    category_code: "OPM",
    prefix: "OPM",
    description: "Medical Outpatient",
    last_sequence: 18,
    padding_width: 4,
    reset_policy: "NEVER",
    is_active: true,
  },
];

// ── Patient fixtures ─────────────────────────────────────────────────────────

export const mockPatient: Patient = {
  id: "patient-1",
  op_number: "OPN0043",
  full_name: "Priya Sharma",
  gender: "FEMALE",
  date_of_birth: "1985-06-15",
  age_years: null,
  mobile: "9876543210",
  email: null,
  address: "12 MG Road, Bengaluru",
  blood_group: "O_POS",
  marital_status: "MARRIED",
  dietary_preference: "VEG",
  occupation: "Teacher",
  height_cm: 160,
  weight_kg: 58,
  hereditary_diseases: null,
  allergies: null,
  remarks: null,
  op_category_code: "OPN",
  status: "ACTIVE",
  version: 1,
  created_at: "2026-06-01T09:30:00Z",
  updated_at: "2026-06-01T09:30:00Z",
};

export const mockPatientSearchResults: PatientSearchResult[] = [
  {
    id: "patient-1",
    op_number: "OPN0043",
    full_name: "Priya Sharma",
    gender: "FEMALE",
    age_or_dob: "1985-06-15",
    mobile_masked: "****3210",
    op_category_code: "OPN",
    status: "ACTIVE",
  },
  {
    id: "patient-2",
    op_number: "OPN0044",
    full_name: "Raju Kumar",
    gender: "MALE",
    age_or_dob: "35",
    mobile_masked: "****7890",
    op_category_code: "OPN",
    status: "ACTIVE",
  },
];

// ── Paginated stubs ──────────────────────────────────────────────────────────

const mockPaginatedUsers: PaginatedResponse<User> = {
  items: mockUserList,
  total: 2,
  page: 1,
  page_size: 20,
};

// ── Handlers ─────────────────────────────────────────────────────────────────

export const handlers = [
  // Auth
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

  // Users
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
      is_superuser: false,
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

  // Master data
  http.get(`${BASE}/master-data/gender`, () => {
    return HttpResponse.json(mockGenderOptions);
  }),

  http.get(`${BASE}/master-data/blood_group`, () => {
    return HttpResponse.json(mockBloodGroupOptions);
  }),

  http.get(`${BASE}/master-data/marital_status`, () => {
    return HttpResponse.json(mockMaritalStatusOptions);
  }),

  http.get(`${BASE}/master-data/dietary_preference`, () => {
    return HttpResponse.json(mockDietaryOptions);
  }),

  http.get(`${BASE}/master-data/:type`, ({ params }) => {
    return HttpResponse.json(
      { error: { code: "RESOURCE_NOT_FOUND", message: `No mock for type ${params.type as string}`, details: [], request_id: "r5" } },
      { status: 404 }
    );
  }),

  // OP sequences
  http.get(`${BASE}/op-sequences`, () => {
    return HttpResponse.json(mockOpSequences);
  }),

  // Patients — register
  http.post(`${BASE}/patients`, async ({ request }) => {
    const url = new URL(request.url);
    const confirmCreate = url.searchParams.get("confirm_create") === "true";
    const body = await request.json() as { full_name: string; mobile?: string };

    if (!confirmCreate && body.full_name === "Duplicate Patient") {
      return HttpResponse.json(
        {
          error: {
            code: "DUPLICATE_PATIENT_SUSPECTED",
            message: "A similar patient record already exists.",
            details: [
              { id: "patient-1", op_number: "OPN0043", full_name: "Priya Sharma", mobile_masked: "****3210" },
            ],
            request_id: "r6",
          },
        },
        { status: 409 }
      );
    }

    const newPatient: Patient = {
      ...mockPatient,
      id: "patient-new",
      op_number: "OPN0099",
      full_name: body.full_name,
      mobile: body.mobile ?? null,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(newPatient, { status: 201 });
  }),

  // Patients — search
  http.get(`${BASE}/patients/search`, ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    if (!q) {
      return HttpResponse.json<PaginatedResponse<PatientSearchResult>>({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      });
    }
    const filtered = mockPatientSearchResults.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q.toLowerCase()) ||
        p.op_number.toLowerCase().includes(q.toLowerCase())
    );
    return HttpResponse.json<PaginatedResponse<PatientSearchResult>>({
      items: filtered,
      total: filtered.length,
      page: 1,
      page_size: 20,
    });
  }),

  // Patient by ID
  http.get(`${BASE}/patients/:id`, ({ params }) => {
    if (params.id === mockPatient.id) {
      return HttpResponse.json(mockPatient);
    }
    return HttpResponse.json(
      { error: { code: "RESOURCE_NOT_FOUND", message: "Patient not found.", details: [], request_id: "r7" } },
      { status: 404 }
    );
  }),
];
