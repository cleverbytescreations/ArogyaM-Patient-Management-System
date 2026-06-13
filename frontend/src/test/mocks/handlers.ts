import { http, HttpResponse } from "msw";
import type { UserProfile } from "@/types/auth";
import type { User, Role } from "@/types/users";
import type { PaginatedResponse } from "@/types/api";
import type { Patient, PatientSearchResult } from "@/types/patients";
import type { MasterDataItem, OpSequence } from "@/types/masterData";
import type { Visit, CaseSheet, ConsultationNote, PatientAlias } from "@/types/visits";
import type { DischargeSummary, Prescription } from "@/types/clinical";
import type { PatientDocument } from "@/types/documents";
import type { PatientTimeline } from "@/types/timeline";
import type { FollowUp } from "@/types/followups";
import type { AuditLogEntry } from "@/types/audit";
import type { BackupLogEntry } from "@/types/backup";
import type { DashboardSummary } from "@/types/dashboard";

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
    has_signature: false,
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
    has_signature: false,
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

export const mockConsultationCategoryOptions: MasterDataItem[] = [
  { id: 14, type: "consultation_category", code: "REGULAR", label: "Regular Consultation", sort_order: 1, is_active: true },
  { id: 15, type: "consultation_category", code: "VILLAGE", label: "Village Consultation", sort_order: 2, is_active: true },
  { id: 16, type: "consultation_category", code: "CAMP", label: "Free Camp Consultation", sort_order: 3, is_active: true },
];

export const mockOpSequences: OpSequence[] = [
  {
    id: 1,
    category_code: "REGULAR",
    prefix: "OPN",
    last_sequence: 42,
    padding_width: 4,
    reset_policy: "NEVER",
    is_active: true,
  },
  {
    id: 2,
    category_code: "VILLAGE",
    prefix: "OPV",
    last_sequence: 18,
    padding_width: 4,
    reset_policy: "NEVER",
    is_active: true,
  },
  {
    id: 3,
    category_code: "CAMP",
    prefix: "FC",
    last_sequence: 0,
    padding_width: 4,
    reset_policy: "NEVER",
    is_active: true,
  },
];

// ── Patient fixtures ─────────────────────────────────────────────────────────

export const mockPatient: Patient = {
  id: "patient-1",
  op_number: "OPN0043",
  op_category_code: "REGULAR",
  full_name: "Priya Sharma",
  gender: "FEMALE",
  date_of_birth: "1985-06-15",
  age_years: null,
  mobile: "9876543210",
  email: null,
  address_line: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
  blood_group: "O_POS",
  marital_status: "MARRIED",
  dietary_preference: "VEG",
  profession: "Teacher",
  height_cm: 160,
  weight_kg: 58,
  remarks: null,
  status: "ACTIVE",
  merged_into: null,
  is_historical: false,
  registration_date: "2026-06-01",
  version: 1,
  created_at: "2026-06-01T09:30:00Z",
  updated_at: "2026-06-01T09:30:00Z",
};

export const mockVisit: Visit = {
  id: "visit-1",
  patient_id: "patient-1",
  visit_date: "2026-06-05",
  visit_type_code: "NEW",
  consultation_category: "REGULAR",
  doctor_id: "user-2",
  is_scheduled: false,
  status: "OPEN",
  reason: "Fever and headache",
  cancellation_reason: null,
  version: 1,
  created_at: "2026-06-05T10:00:00Z",
  updated_at: "2026-06-05T10:00:00Z",
};

export const mockCaseSheet: CaseSheet = {
  id: "cs-1",
  visit_id: "visit-1",
  patient_id: "patient-1",
  appetite: "Normal",
  sleep: "Disturbed",
  motion: "Regular",
  energy_level: "Low",
  hereditary_diseases: null,
  hereditary_diseases_mother: null,
  hereditary_diseases_father: null,
  past_ailments: null,
  surgeries: null,
  exercise_routine: null,
  deliveries: null,
  normal_deliveries: null,
  caesarian_deliveries: null,
  present_complaints: "Fever for 3 days, headache",
  other_observations: null,
  remarks: null,
  version: 1,
  created_at: "2026-06-05T10:05:00Z",
  updated_at: "2026-06-05T10:05:00Z",
};

export const mockConsultationNotes: ConsultationNote[] = [
  {
    id: "note-1",
    visit_id: "visit-1",
    patient_id: "patient-1",
    doctor_id: "user-2",
    presenting_complaints: "Fever, headache",
    diagnosis: "Viral fever",
    observations: "Temperature 101°F",
    treatment_advice: "Rest and fluids",
    diet_advice: "Light diet",
    yoga_advice: null,
    review_date: "2026-06-12",
    version: 1,
    created_at: "2026-06-05T10:10:00Z",
  },
];

export const mockAliases: PatientAlias[] = [
  {
    id: "alias-1",
    patient_id: "patient-1",
    old_op_number: "OPN0010",
    source: "CORRECTION",
    remarks: "OP number corrected",
    created_at: "2026-05-01T09:00:00Z",
  },
];

export const mockPrescriptions: Prescription[] = [
  {
    id: "rx-1",
    visit_id: "visit-1",
    patient_id: "patient-1",
    doctor_id: "user-2",
    prescription_date: "2026-06-05",
    instructions: "Take after food",
    review_advice: "Review in one week",
    medicine_details: null,
    items: [
      {
        line_no: 1,
        medicine_name: "Paracetamol",
        dosage: "500 mg",
        timing: "Twice daily",
        duration: "3 days",
        usage_instruction: "After meals",
        application_route: "INTERNAL",
      },
    ],
    version: 1,
    created_at: "2026-06-05T10:20:00Z",
  },
];

export const mockDischargeSummary: DischargeSummary = {
  id: "ds-1",
  visit_id: "visit-1",
  patient_id: "patient-1",
  doctor_id: "user-2",
  admission_date: "2026-06-05",
  discharge_date: "2026-06-06",
  diagnosis: "Viral fever",
  presenting_complaints: "Fever and headache",
  investigations_admission: "CBC reviewed",
  treatments: "Hydration and supportive care",
  condition_at_discharge: "IMPROVED",
  condition_notes: "Fever resolved; appetite improved.",
  follow_up_period: "1 week",
  discharge_advice: "Rest and fluids",
  medications: "Paracetamol as advised",
  yoga_guidance: null,
  is_finalized: false,
  finalized_at: null,
  finalized_by: null,
  amends_id: null,
  is_superseded: false,
  superseded_by: null,
  version: 1,
  created_at: "2026-06-06T10:00:00Z",
};

export const mockDocuments: PatientDocument[] = [
  {
    id: "doc-1",
    patient_id: "patient-1",
    visit_id: "visit-1",
    document_type_code: "PRESCRIPTION",
    title: "Scanned prescription",
    file_name: "prescription.pdf",
    content_type: "application/pdf",
    file_size_bytes: 1024,
    document_date: "2026-06-05",
    is_historical: false,
    status: "ACTIVE",
    remarks: null,
    uploaded_by: "user-1",
    uploaded_at: "2026-06-05T11:00:00Z",
  },
];

export const mockTimeline: PatientTimeline = {
  patient_id: "patient-1",
  events: [
    { type: "DOCUMENT", occurred_on: "2026-06-05", ref_id: "doc-1", summary: "Scanned prescription uploaded", visit_id: "visit-1" },
    { type: "PRESCRIPTION", occurred_on: "2026-06-05", ref_id: "rx-1", summary: "Paracetamol prescribed", visit_id: "visit-1" },
    { type: "VISIT", occurred_on: "2026-06-05", ref_id: "visit-1", summary: "New patient visit", visit_id: "visit-1" },
  ],
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
    latest_doctor_name: "Dr. Anjali Mehta",
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
    latest_doctor_name: null,
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
  http.get(`${BASE}/users`, ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.toLowerCase().trim();
    const isDoctor = url.searchParams.get("is_doctor");
    const items = mockUserList.filter((user) => {
      const matchesDoctor = isDoctor === null || String(user.is_doctor) === isDoctor;
      const matchesQuery = !query || user.full_name.toLowerCase().includes(query) || user.username.toLowerCase().includes(query);
      return matchesDoctor && matchesQuery;
    });
    return HttpResponse.json({ ...mockPaginatedUsers, items, total: items.length });
  }),

  http.get(`${BASE}/users/:id`, ({ params }) => {
    const user = mockUserList.find((item) => item.id === params.id);
    if (!user) return HttpResponse.json({ detail: "User not found" }, { status: 404 });
    return HttpResponse.json(user);
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
      has_signature: false,
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

  http.put(`${BASE}/users/:id/signature`, ({ params }) => {
    const user = mockUserList.find((u) => u.id === params.id);
    if (!user) return HttpResponse.json({}, { status: 404 });
    return HttpResponse.json({ ...user, has_signature: true });
  }),

  http.get(`${BASE}/users/:id/signature`, ({ params }) => {
    const user = mockUserList.find((u) => u.id === params.id);
    if (!user || !user.has_signature) return HttpResponse.json({}, { status: 404 });
    // 1x1 transparent PNG
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return new HttpResponse(png, { headers: { "Content-Type": "image/png" } });
  }),

  http.delete(`${BASE}/users/:id/signature`, () => {
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

  http.get(`${BASE}/master-data/visit_type`, () => {
    return HttpResponse.json([
      { id: 12, type: "visit_type", code: "NEW", label: "New Patient", sort_order: 1, is_active: true },
      { id: 13, type: "visit_type", code: "REVIEW", label: "Review", sort_order: 2, is_active: true },
    ]);
  }),

  http.get(`${BASE}/master-data/consultation_category`, () => {
    return HttpResponse.json(mockConsultationCategoryOptions);
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

  // Patient update
  http.put(`${BASE}/patients/:id`, async ({ params, request }) => {
    if (params.id !== mockPatient.id) {
      return HttpResponse.json(
        { error: { code: "RESOURCE_NOT_FOUND", message: "Patient not found.", details: [], request_id: "r8" } },
        { status: 404 }
      );
    }
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockPatient, ...body, version: mockPatient.version + 1 });
  }),

  // Patient aliases
  http.get(`${BASE}/patients/:id/aliases`, ({ params }) => {
    if (params.id === mockPatient.id) {
      return HttpResponse.json(mockAliases);
    }
    return HttpResponse.json([]);
  }),

  // Patient timeline
  http.get(`${BASE}/patients/:id/timeline`, ({ params }) => {
    if (params.id === mockPatient.id) return HttpResponse.json(mockTimeline);
    return HttpResponse.json({ patient_id: params.id, events: [] });
  }),

  // Visits — list
  http.get(`${BASE}/patients/:id/visits`, ({ params }) => {
    if (params.id === mockPatient.id) {
      return HttpResponse.json<Visit[]>([mockVisit]);
    }
    return HttpResponse.json<Visit[]>([]);
  }),

  // Visits — create
  http.post(`${BASE}/patients/:id/visits`, async ({ params, request }) => {
    const body = await request.json() as Partial<Visit>;
    const newVisit: Visit = {
      ...mockVisit,
      id: "visit-new",
      patient_id: params.id as string,
      visit_date: body.visit_date ?? mockVisit.visit_date,
      visit_type_code: body.visit_type_code ?? mockVisit.visit_type_code,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(newVisit, { status: 201 });
  }),

  // Visit — get single
  http.get(`${BASE}/visits/:id`, ({ params }) => {
    if (params.id === mockVisit.id) {
      return HttpResponse.json(mockVisit);
    }
    return HttpResponse.json(
      { error: { code: "RESOURCE_NOT_FOUND", message: "Visit not found.", details: [], request_id: "r9" } },
      { status: 404 }
    );
  }),

  // Visit — update
  http.put(`${BASE}/visits/:id`, async ({ params, request }) => {
    if (params.id !== mockVisit.id) {
      return HttpResponse.json(
        { error: { code: "RESOURCE_NOT_FOUND", message: "Visit not found.", details: [], request_id: "r10" } },
        { status: 404 }
      );
    }
    const body = await request.json() as Partial<Visit>;
    return HttpResponse.json({ ...mockVisit, ...body, version: mockVisit.version + 1 });
  }),

  // Case sheet — get (404 when no sheet exists for new visits)
  http.get(`${BASE}/visits/:id/case-sheet`, ({ params }) => {
    if (params.id === mockVisit.id) {
      return HttpResponse.json(mockCaseSheet);
    }
    return HttpResponse.json(
      { error: { code: "RESOURCE_NOT_FOUND", message: "Case sheet not found.", details: [], request_id: "r11" } },
      { status: 404 }
    );
  }),

  // Case sheet — save (upsert)
  http.put(`${BASE}/visits/:id/case-sheet`, async ({ params, request }) => {
    const body = await request.json() as Partial<CaseSheet>;
    return HttpResponse.json({
      ...mockCaseSheet,
      ...body,
      visit_id: params.id as string,
      version: (body.version ?? mockCaseSheet.version) + 1,
      updated_at: new Date().toISOString(),
    });
  }),

  // Case sheet — report PDF (download/print)
  http.get(`${BASE}/visits/:id/case-sheet/report.pdf`, ({ params }) => {
    if (params.id !== mockVisit.id) {
      return HttpResponse.json(
        { error: { code: "RESOURCE_NOT_FOUND", message: "Case sheet not found.", details: [], request_id: "r12" } },
        { status: 404 }
      );
    }
    return new HttpResponse(new Blob(["%PDF-1.4 mock"], { type: "application/pdf" }), {
      headers: { "Content-Type": "application/pdf" },
    });
  }),

  // Prescription — report PDF (download/print)
  http.get(`${BASE}/prescriptions/:id/report.pdf`, () => {
    return new HttpResponse(new Blob(["%PDF-1.4 mock"], { type: "application/pdf" }), {
      headers: { "Content-Type": "application/pdf" },
    });
  }),

  // Discharge summary — report PDF (download/print)
  http.get(`${BASE}/discharge-summaries/:id/report.pdf`, () => {
    return new HttpResponse(new Blob(["%PDF-1.4 mock"], { type: "application/pdf" }), {
      headers: { "Content-Type": "application/pdf" },
    });
  }),

  // Consultation notes — list
  http.get(`${BASE}/visits/:id/consultation-notes`, ({ params }) => {
    if (params.id === mockVisit.id) {
      return HttpResponse.json(mockConsultationNotes);
    }
    return HttpResponse.json([]);
  }),

  // Consultation notes — add
  http.post(`${BASE}/visits/:id/consultation-notes`, async ({ params, request }) => {
    const body = await request.json() as Partial<ConsultationNote>;
    const newNote: ConsultationNote = {
      id: "note-new",
      visit_id: params.id as string,
      patient_id: mockPatient.id,
      doctor_id: body.doctor_id ?? null,
      presenting_complaints: body.presenting_complaints ?? null,
      diagnosis: body.diagnosis ?? null,
      observations: body.observations ?? null,
      treatment_advice: body.treatment_advice ?? null,
      diet_advice: body.diet_advice ?? null,
      yoga_advice: body.yoga_advice ?? null,
      review_date: body.review_date ?? null,
      version: 1,
      created_at: new Date().toISOString(),
    };
    return HttpResponse.json(newNote, { status: 201 });
  }),

  // Prescriptions
  http.get(`${BASE}/visits/:id/prescriptions`, ({ params }) => {
    if (params.id === mockVisit.id) return HttpResponse.json(mockPrescriptions);
    return HttpResponse.json([]);
  }),

  http.post(`${BASE}/visits/:id/prescriptions`, async ({ params, request }) => {
    const body = await request.json() as Partial<Prescription>;
    const newPrescription: Prescription = {
      id: "rx-new",
      visit_id: params.id as string,
      patient_id: mockPatient.id,
      doctor_id: body.doctor_id ?? null,
      prescription_date: body.prescription_date ?? "2026-06-07",
      instructions: body.instructions ?? null,
      review_advice: body.review_advice ?? null,
      medicine_details: body.medicine_details ?? null,
      items: body.items ?? [],
      version: 1,
      created_at: new Date().toISOString(),
    };
    return HttpResponse.json(newPrescription, { status: 201 });
  }),

  http.get(`${BASE}/prescriptions/:id`, ({ params }) => {
    const item = mockPrescriptions.find((p) => p.id === params.id);
    if (item) return HttpResponse.json(item);
    return HttpResponse.json({ error: { code: "RESOURCE_NOT_FOUND", message: "Prescription not found.", details: [], request_id: "r12" } }, { status: 404 });
  }),

  // Discharge summaries
  http.get(`${BASE}/visits/:id/discharge-summary`, ({ params }) => {
    if (params.id === mockVisit.id) return HttpResponse.json(mockDischargeSummary);
    return HttpResponse.json({ error: { code: "RESOURCE_NOT_FOUND", message: "Discharge summary not found.", details: [], request_id: "r13" } }, { status: 404 });
  }),

  http.post(`${BASE}/visits/:id/discharge-summary`, async ({ params, request }) => {
    const body = await request.json() as Partial<DischargeSummary>;
    return HttpResponse.json({ ...mockDischargeSummary, ...body, id: "ds-new", visit_id: params.id as string }, { status: 201 });
  }),

  http.get(`${BASE}/visits/:id/discharge-summary/history`, ({ params }) => {
    if (params.id === mockVisit.id) return HttpResponse.json([mockDischargeSummary]);
    return HttpResponse.json([]);
  }),

  http.put(`${BASE}/discharge-summaries/:id`, async ({ request }) => {
    const body = await request.json() as Partial<DischargeSummary>;
    return HttpResponse.json({ ...mockDischargeSummary, ...body, version: mockDischargeSummary.version + 1 });
  }),

  http.put(`${BASE}/discharge-summaries/:id/finalize`, () => {
    return HttpResponse.json({ ...mockDischargeSummary, is_finalized: true, finalized_at: new Date().toISOString(), finalized_by: "user-1" });
  }),

  http.post(`${BASE}/discharge-summaries/:id/amend`, async ({ request }) => {
    const body = await request.json() as Partial<DischargeSummary>;
    return HttpResponse.json({ ...mockDischargeSummary, ...body, id: "ds-amend", amends_id: "ds-1", version: 1 }, { status: 201 });
  }),

  // Documents
  http.get(`${BASE}/patients/:id/documents`, ({ params, request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const documentType = url.searchParams.get("document_type");
    const visitId = url.searchParams.get("visit_id");
    const items = params.id === mockPatient.id
      ? mockDocuments.filter((doc) =>
        (!status || doc.status === status) &&
        (!documentType || doc.document_type_code === documentType) &&
        (!visitId || doc.visit_id === visitId))
      : [];
    return HttpResponse.json({ items, total: items.length, page: 1, page_size: 10 });
  }),

  http.post(`${BASE}/patients/:id/documents`, async ({ params }) => {
    const newDocument: PatientDocument = {
      ...mockDocuments[0],
      id: "doc-new",
      patient_id: params.id as string,
      file_name: "upload.pdf",
      title: "Uploaded document",
      uploaded_at: new Date().toISOString(),
    };
    return HttpResponse.json(newDocument, { status: 201 });
  }),

  http.get(`${BASE}/documents/:id`, ({ params }) => {
    const item = mockDocuments.find((doc) => doc.id === params.id) ?? (params.id === "doc-new" ? { ...mockDocuments[0], id: "doc-new" } : null);
    if (item) return HttpResponse.json(item);
    return HttpResponse.json({ error: { code: "RESOURCE_NOT_FOUND", message: "Document not found.", details: [], request_id: "r14" } }, { status: 404 });
  }),

  http.put(`${BASE}/documents/:id`, async ({ params, request }) => {
    const body = await request.json() as Partial<PatientDocument>;
    return HttpResponse.json({ ...mockDocuments[0], ...body, id: params.id as string });
  }),

  http.get(`${BASE}/documents/:id/content`, () => {
    return new HttpResponse(new Blob(["mock document"], { type: "application/pdf" }), {
      headers: { "Content-Type": "application/pdf" },
    });
  }),

  // ── Follow-ups ────────────────────────────────────────────────────────────

  http.get(`${BASE}/patients/:id/follow-ups`, ({ params, request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(url.searchParams.get("page_size") ?? "20", 10);
    const items = params.id === mockPatient.id ? [mockFollowUp] : [];
    return HttpResponse.json<PaginatedResponse<FollowUp>>({
      items,
      total: items.length,
      page,
      page_size: pageSize,
    });
  }),

  http.post(`${BASE}/patients/:id/follow-ups`, async ({ params, request }) => {
    const body = await request.json() as Partial<FollowUp>;
    const newFollowUp: FollowUp = {
      ...mockFollowUp,
      id: "fu-new",
      patient_id: params.id as string,
      follow_up_date: body.follow_up_date ?? mockFollowUp.follow_up_date,
      reason: body.reason ?? null,
      assigned_to: body.assigned_to ?? null,
      status_code: "PENDING",
      created_at: new Date().toISOString(),
    };
    return HttpResponse.json(newFollowUp, { status: 201 });
  }),

  http.get(`${BASE}/follow-ups`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(url.searchParams.get("page_size") ?? "20", 10);
    const items = [mockFollowUp].filter(
      (f) => !status || f.status_code === status
    );
    return HttpResponse.json<PaginatedResponse<FollowUp>>({
      items,
      total: items.length,
      page,
      page_size: pageSize,
    });
  }),

  http.put(`${BASE}/follow-ups/:id`, async ({ params, request }) => {
    const body = await request.json() as Partial<FollowUp>;
    if (params.id !== mockFollowUp.id) {
      return HttpResponse.json(
        { error: { code: "RESOURCE_NOT_FOUND", message: "Follow-up not found.", details: [], request_id: "rfu1" } },
        { status: 404 }
      );
    }
    return HttpResponse.json({ ...mockFollowUp, ...body, version: mockFollowUp.version + 1 });
  }),

  // ── Audit logs ────────────────────────────────────────────────────────────

  http.get(`${BASE}/audit-logs`, ({ request }) => {
    const url = new URL(request.url);
    const patientId = url.searchParams.get("patient_id");
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(url.searchParams.get("page_size") ?? "20", 10);
    const items = mockAuditLogs.filter(
      (e) => !patientId || e.patient_id === patientId
    );
    return HttpResponse.json<PaginatedResponse<AuditLogEntry>>({
      items,
      total: items.length,
      page,
      page_size: pageSize,
    });
  }),

  http.get(`${BASE}/audit-logs/:id`, ({ params }) => {
    const entry = mockAuditLogs.find((e) => String(e.id) === params.id);
    if (!entry) {
      return HttpResponse.json(
        { error: { code: "RESOURCE_NOT_FOUND", message: "Audit entry not found.", details: [], request_id: "ral1" } },
        { status: 404 }
      );
    }
    return HttpResponse.json(entry);
  }),

  // ── Backup ────────────────────────────────────────────────────────────────

  http.get(`${BASE}/backup/status`, () => {
    return HttpResponse.json({
      latest: mockBackupLogs[0],
      recent: mockBackupLogs,
    });
  }),

  http.post(`${BASE}/backup/trigger`, () => {
    return HttpResponse.json(
      { triggered_at: "2026-06-11T10:00:00Z", message: "Backup triggered — check status in a few moments." },
      { status: 202 }
    );
  }),

  // ── Dashboard ─────────────────────────────────────────────────────────────
  http.get(`${BASE}/dashboard/summary`, () => {
    return HttpResponse.json(mockDashboardSummary);
  }),
];

// ── Follow-up fixtures ───────────────────────────────────────────────────────

export const mockFollowUp: FollowUp = {
  id: "fu-1",
  patient_id: "patient-1",
  patient_name: "Test Patient",
  visit_id: "visit-1",
  follow_up_date: "2026-06-20",
  reason: "Review after treatment",
  assigned_to: "user-2",
  status_code: "PENDING",
  next_followup_id: null,
  remarks: null,
  version: 1,
  created_at: "2026-06-05T11:00:00Z",
};

// ── Audit log fixtures ───────────────────────────────────────────────────────

export const mockAuditLogs: AuditLogEntry[] = [
  {
    id: 1,
    user_id: "user-1",
    user_name: "Dr. Priya Sharma",
    user_role: "ADMIN",
    action: "VIEW",
    entity_type: "patient",
    entity_id: "patient-1",
    patient_id: "patient-1",
    patient_name: "Rahul Kumar",
    old_value: null,
    new_value: null,
    description: "Viewed patient profile",
    ip_address: "127.0.0.1",
    user_agent: "Mozilla/5.0",
    request_id: "req-1",
    created_at: "2026-06-05T10:00:00Z",
  },
  {
    id: 2,
    user_id: "user-1",
    user_name: "Dr. Priya Sharma",
    user_role: "ADMIN",
    action: "UPDATE",
    entity_type: "patient",
    entity_id: "patient-1",
    patient_id: "patient-1",
    patient_name: "Rahul Kumar",
    old_value: { full_name: "Old Name" },
    new_value: { full_name: "Priya Sharma" },
    description: "Updated patient demographics",
    ip_address: "127.0.0.1",
    user_agent: "Mozilla/5.0",
    request_id: "req-2",
    created_at: "2026-06-05T11:00:00Z",
  },
];

// ── Backup log fixtures ──────────────────────────────────────────────────────

export const mockBackupLogs: BackupLogEntry[] = [
  {
    id: 1,
    backup_type: "FULL",
    status: "SUCCESS",
    location_ref: "/backups/2026-06-09/full.tar.gz",
    size_bytes: 52428800,
    message: "Backup completed successfully",
    triggered_by: null,
    started_at: "2026-06-09T02:00:00Z",
    completed_at: "2026-06-09T02:05:30Z",
    deleted_at: null,
  },
  {
    id: 2,
    backup_type: "DATABASE",
    status: "SUCCESS",
    location_ref: "/backups/2026-06-08/db.sql.gz",
    size_bytes: 10485760,
    message: null,
    triggered_by: null,
    started_at: "2026-06-08T02:00:00Z",
    completed_at: "2026-06-08T02:01:45Z",
    deleted_at: null,
  },
  {
    id: 3,
    backup_type: "DATABASE",
    status: "SUCCESS",
    location_ref: "/backups/2026-06-01/db.sql.gz",
    size_bytes: 9961472,
    message: "Backup completed: /backups/2026-06-01/db.sql.gz",
    triggered_by: null,
    started_at: "2026-06-01T02:00:00Z",
    completed_at: "2026-06-01T02:01:20Z",
    deleted_at: "2026-06-09T00:05:00Z",
  },
  {
    id: 4,
    backup_type: "DOCUMENTS",
    status: "SUCCESS",
    location_ref: "/backups/docs_20260601_020000",
    size_bytes: null,
    message: "Documents backup completed: /backups/docs_20260601_020000",
    triggered_by: null,
    started_at: "2026-06-01T02:01:30Z",
    completed_at: "2026-06-01T02:02:10Z",
    deleted_at: "2026-06-09T00:05:02Z",
  },
];

// ── Dashboard fixtures ───────────────────────────────────────────────────────

export const mockDashboardSummary: DashboardSummary = {
  registrations: { today: 4, this_week: 17 },
  visits: { open_today: 3, completed_today: 8, scheduled_today: 2, walkin_today: 1 },
  followups: { due_today: 5, overdue: 2, upcoming_7days: 9 },
  merge_requests: { pending: 1 },
  users: { active: 7, locked: 0 },
  backup: {
    last_run_at: "2026-06-09T02:05:30Z",
    last_status: "SUCCESS",
    age_hours: 72.0,
  },
  audit_recent: [
    {
      id: 1,
      action: "LOGIN",
      entity_type: "user",
      user_name: "Admin User",
      created_at: "2026-06-12T09:00:00Z",
    },
    {
      id: 2,
      action: "CREATE",
      entity_type: "patient",
      user_name: "Receptionist One",
      created_at: "2026-06-12T08:55:00Z",
    },
    {
      id: 3,
      action: "FOLLOWUP_UPDATE",
      entity_type: "follow_up",
      user_name: "Doctor A",
      created_at: "2026-06-12T08:50:00Z",
    },
  ],
};

export const mockDashboardSummaryDoctor: DashboardSummary = {
  registrations: { today: 4, this_week: 17 },
  visits: { open_today: 3, completed_today: 8, scheduled_today: 2, walkin_today: 1 },
  followups: { due_today: 5, overdue: 2, upcoming_7days: 9 },
  merge_requests: null,
  users: null,
  backup: null,
  audit_recent: null,
};

export const mockDashboardSummaryReception: DashboardSummary = {
  registrations: { today: 4, this_week: 17 },
  visits: { open_today: 3, completed_today: 8, scheduled_today: 2, walkin_today: 1 },
  followups: { due_today: 5, overdue: 2, upcoming_7days: 9 },
  merge_requests: null,
  users: null,
  backup: null,
  audit_recent: null,
};
