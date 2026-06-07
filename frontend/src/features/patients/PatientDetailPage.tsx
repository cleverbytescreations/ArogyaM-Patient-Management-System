import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { patientsApi } from "@/api/patientsApi";
import { masterDataApi } from "@/api/masterDataApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { getApiErrorMessage } from "@/api/errors";
import type { MasterDataItem } from "@/types/masterData";
import type { Patient, PatientStatus } from "@/types/patients";

function calcAge(dob: string): number | null {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age >= 0 ? age : 0;
}

function codeLabel(items: MasterDataItem[], code: string | null | undefined): string | null {
  if (!code) return null;
  return items.find((i) => i.code === code)?.label ?? code;
}

function StatusBadge({ status }: { status: PatientStatus }) {
  const variant =
    status === "ACTIVE" ? "success" : status === "MERGED" ? "secondary" : "warning";
  return <Badge variant={variant}>{status}</Badge>;
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border bg-card p-5">
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className="grid grid-cols-[10rem_1fr] items-start gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={isEmpty ? "text-muted-foreground" : "font-medium text-foreground"}>
        {isEmpty ? "—" : value}
      </span>
    </div>
  );
}

function PatientDetailView({
  patient,
  genderOptions,
  bloodGroupOptions,
  maritalStatusOptions,
  dietaryOptions,
  consultationCategoryOptions,
}: {
  patient: Patient;
  genderOptions: MasterDataItem[];
  bloodGroupOptions: MasterDataItem[];
  maritalStatusOptions: MasterDataItem[];
  dietaryOptions: MasterDataItem[];
  consultationCategoryOptions: MasterDataItem[];
}) {
  const age = patient.date_of_birth ? calcAge(patient.date_of_birth) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <StatusBadge status={patient.status} />
        <span>
          OP:{" "}
          <span className="font-mono font-medium text-foreground">
            {patient.op_number}
          </span>
        </span>
        <span>Registered {formatDate(patient.created_at)}</span>
        {patient.updated_at !== patient.created_at && (
          <span>· Updated {formatDateTime(patient.updated_at)}</span>
        )}
      </div>

      <DetailSection title="Patient Identity">
        <DetailRow label="Full name" value={patient.full_name} />
        <DetailRow
          label="OP number"
          value={<span className="font-mono">{patient.op_number}</span>}
        />
        <DetailRow
          label="OP category"
          value={codeLabel(consultationCategoryOptions, patient.op_category_code)}
        />
        <DetailRow label="Gender" value={codeLabel(genderOptions, patient.gender)} />
      </DetailSection>

      <DetailSection title="Contact & Identification">
        <DetailRow label="Mobile" value={patient.mobile} />
        <DetailRow label="Email" value={patient.email} />
        {patient.date_of_birth ? (
          <>
            <DetailRow label="Date of birth" value={formatDate(patient.date_of_birth)} />
            <DetailRow
              label="Current age"
              value={age !== null ? `${age} years` : null}
            />
          </>
        ) : (
          <DetailRow
            label="Age (at registration)"
            value={
              patient.age_years !== null ? `${patient.age_years} years` : null
            }
          />
        )}
      </DetailSection>

      <DetailSection title="Demographics">
        <DetailRow
          label="Blood group"
          value={codeLabel(bloodGroupOptions, patient.blood_group)}
        />
        <DetailRow
          label="Marital status"
          value={codeLabel(maritalStatusOptions, patient.marital_status)}
        />
        <DetailRow
          label="Dietary preference"
          value={codeLabel(dietaryOptions, patient.dietary_preference)}
        />
        <DetailRow label="Occupation" value={patient.profession} />
      </DetailSection>

      <DetailSection title="Physical Measurements">
        <DetailRow
          label="Height"
          value={patient.height_cm !== null ? `${patient.height_cm} cm` : null}
        />
        <DetailRow
          label="Weight"
          value={patient.weight_kg !== null ? `${patient.weight_kg} kg` : null}
        />
      </DetailSection>

      <DetailSection title="Address">
        <DetailRow label="Residential address" value={patient.address_line} />
        <DetailRow label="City" value={patient.city} />
        <DetailRow label="State" value={patient.state} />
        <DetailRow label="PIN code" value={patient.pincode} />
      </DetailSection>

      <DetailSection title="Additional Remarks">
        <DetailRow label="Remarks" value={patient.remarks} />
      </DetailSection>
    </div>
  );
}

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(PERMISSIONS.EDIT_PATIENT);

  const { data: patient, isLoading, error } = useQuery({
    queryKey: ["patients", id],
    queryFn: () => patientsApi.get(id!),
    enabled: Boolean(id),
  });

  const { data: genderOptions = [] } = useQuery({
    queryKey: ["master-data", "gender"],
    queryFn: () => masterDataApi.list("gender"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: bloodGroupOptions = [] } = useQuery({
    queryKey: ["master-data", "blood_group"],
    queryFn: () => masterDataApi.list("blood_group"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: maritalStatusOptions = [] } = useQuery({
    queryKey: ["master-data", "marital_status"],
    queryFn: () => masterDataApi.list("marital_status"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: dietaryOptions = [] } = useQuery({
    queryKey: ["master-data", "dietary_preference"],
    queryFn: () => masterDataApi.list("dietary_preference"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: consultationCategoryOptions = [] } = useQuery({
    queryKey: ["master-data", "consultation_category"],
    queryFn: () => masterDataApi.list("consultation_category"),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2
          className="h-8 w-8 animate-spin text-muted-foreground"
          aria-label="Loading patient record…"
        />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" onClick={() => navigate("/patients/search")}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to search
        </Button>
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {getApiErrorMessage(error, "Patient record not found.")}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Patient Management"
        title={patient.full_name}
        subtitle={`OP Number: ${patient.op_number}`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => navigate("/patients/search")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to search
            </Button>
            {canEdit && (
              <Button
                onClick={() =>
                  toast.info("Patient editing will be available in the next sprint.")
                }
              >
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                Edit patient
              </Button>
            )}
          </div>
        }
      />

      <PatientDetailView
        patient={patient}
        genderOptions={genderOptions}
        bloodGroupOptions={bloodGroupOptions}
        maritalStatusOptions={maritalStatusOptions}
        dietaryOptions={dietaryOptions}
        consultationCategoryOptions={consultationCategoryOptions}
      />
    </div>
  );
}
