import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { patientsApi } from "@/api/patientsApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { getApiErrorCode, getApiErrorMessage, getFieldErrors } from "@/api/errors";
import { useConflictHandler } from "@/lib/conflict";
import { patientEditSchema, type PatientEditFormValues } from "@/lib/validation/visits";
import { AliasesPanel } from "./AliasesPanel";
import type { Patient, GenderCode } from "@/types/patients";
import type { MasterDataItem, OpSequence } from "@/types/masterData";

interface BasicDetailsTabProps {
  patient: Patient;
  genderOptions: MasterDataItem[];
  bloodGroupOptions: MasterDataItem[];
  maritalStatusOptions: MasterDataItem[];
  dietaryOptions: MasterDataItem[];
  opSequences: OpSequence[];
}

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

function opCategoryLabel(sequences: OpSequence[], code: string): string {
  return sequences.find((s) => s.category_code === code)?.category_code ?? code;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-md border bg-card p-5">
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
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

function ViewMode({
  patient,
  genderOptions,
  bloodGroupOptions,
  maritalStatusOptions,
  dietaryOptions,
  opSequences,
  canEdit,
  onEdit,
}: BasicDetailsTabProps & { canEdit: boolean; onEdit: () => void }) {
  const age = patient.date_of_birth ? calcAge(patient.date_of_birth) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Badge variant={patient.status === "ACTIVE" ? "success" : patient.status === "MERGED" ? "secondary" : "warning"}>
            {patient.status}
          </Badge>
          <span>Registered {formatDate(patient.registration_date)}</span>
          {patient.updated_at !== patient.created_at && (
            <span>· Updated {formatDateTime(patient.updated_at)}</span>
          )}
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-2 h-3 w-3" aria-hidden="true" />
            Edit details
          </Button>
        )}
      </div>

      <DetailSection title="Patient Identity">
        <DetailRow label="Full name" value={patient.full_name} />
        <DetailRow label="OP number" value={<span className="font-mono">{patient.op_number}</span>} />
        <DetailRow label="OP category" value={opCategoryLabel(opSequences, patient.op_category_code)} />
        <DetailRow label="Gender" value={codeLabel(genderOptions, patient.gender)} />
      </DetailSection>

      <DetailSection title="Contact & Identification">
        <DetailRow label="Mobile" value={patient.mobile} />
        <DetailRow label="Email" value={patient.email} />
        {patient.date_of_birth ? (
          <>
            <DetailRow label="Date of birth" value={formatDate(patient.date_of_birth)} />
            <DetailRow label="Current age" value={age !== null ? `${age} years` : null} />
          </>
        ) : (
          <DetailRow label="Age (at registration)" value={patient.age_years !== null ? `${patient.age_years} years` : null} />
        )}
      </DetailSection>

      <DetailSection title="Demographics">
        <DetailRow label="Blood group" value={codeLabel(bloodGroupOptions, patient.blood_group)} />
        <DetailRow label="Marital status" value={codeLabel(maritalStatusOptions, patient.marital_status)} />
        <DetailRow label="Dietary preference" value={codeLabel(dietaryOptions, patient.dietary_preference)} />
        <DetailRow label="Profession" value={patient.profession} />
      </DetailSection>

      <DetailSection title="Physical Measurements">
        <DetailRow label="Height" value={patient.height_cm !== null ? `${patient.height_cm} cm` : null} />
        <DetailRow label="Weight" value={patient.weight_kg !== null ? `${patient.weight_kg} kg` : null} />
      </DetailSection>

      <DetailSection title="Address">
        <DetailRow label="Address" value={patient.address_line} />
        <DetailRow label="City" value={patient.city} />
        <DetailRow label="State" value={patient.state} />
        <DetailRow label="PIN code" value={patient.pincode} />
      </DetailSection>

      <DetailSection title="Remarks">
        <DetailRow label="Remarks" value={patient.remarks} />
      </DetailSection>

      <DetailSection title="Legacy OP Numbers">
        <AliasesPanel patientId={patient.id} />
      </DetailSection>
    </div>
  );
}

function EditMode({
  patient,
  genderOptions,
  bloodGroupOptions,
  maritalStatusOptions,
  dietaryOptions,
  onCancel,
  onSaved,
}: {
  patient: Patient;
  genderOptions: MasterDataItem[];
  bloodGroupOptions: MasterDataItem[];
  maritalStatusOptions: MasterDataItem[];
  dietaryOptions: MasterDataItem[];
  onCancel: () => void;
  onSaved: (updated: Patient) => void;
}) {
  const queryClient = useQueryClient();
  const { hasConflict, handlePossibleConflict } = useConflictHandler();

  const form = useForm<PatientEditFormValues>({
    resolver: zodResolver(patientEditSchema),
    defaultValues: {
      full_name: patient.full_name,
      gender: patient.gender ?? "",
      date_of_birth: patient.date_of_birth ?? "",
      age_years: patient.age_years !== null ? String(patient.age_years) : "",
      mobile: patient.mobile ?? "",
      email: patient.email ?? "",
      address_line: patient.address_line ?? "",
      city: patient.city ?? "",
      state: patient.state ?? "",
      pincode: patient.pincode ?? "",
      blood_group: patient.blood_group ?? "",
      marital_status: patient.marital_status ?? "",
      dietary_preference: patient.dietary_preference ?? "",
      profession: patient.profession ?? "",
      height_cm: patient.height_cm !== null ? String(patient.height_cm) : "",
      weight_kg: patient.weight_kg !== null ? String(patient.weight_kg) : "",
      remarks: patient.remarks ?? "",
    },
  });

  const { mutate: updatePatient, isPending } = useMutation({
    mutationFn: (values: PatientEditFormValues) =>
      patientsApi.update(patient.id, {
        full_name: values.full_name,
        gender: (values.gender as GenderCode) || null,
        date_of_birth: values.date_of_birth?.trim() || null,
        age_years: values.age_years?.trim() ? Number(values.age_years) : null,
        mobile: values.mobile?.trim() || null,
        email: values.email?.trim() || null,
        address_line: values.address_line?.trim() || null,
        city: values.city?.trim() || null,
        state: values.state?.trim() || null,
        pincode: values.pincode?.trim() || null,
        blood_group: values.blood_group || null,
        marital_status: values.marital_status || null,
        dietary_preference: values.dietary_preference || null,
        profession: values.profession?.trim() || null,
        height_cm: values.height_cm?.trim() ? Number(values.height_cm) : null,
        weight_kg: values.weight_kg?.trim() ? Number(values.weight_kg) : null,
        remarks: values.remarks?.trim() || null,
        version: patient.version,
      }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["patients", patient.id] });
      toast.success("Patient details updated.");
      onSaved(updated);
    },
    onError: (error: unknown) => {
      if (handlePossibleConflict(error)) return;
      const code = getApiErrorCode(error);
      if (code === "VALIDATION_ERROR") {
        const fieldErrors = getFieldErrors(error);
        for (const [field, message] of Object.entries(fieldErrors)) {
          form.setError(field as keyof PatientEditFormValues, { message });
        }
        return;
      }
      toast.error(getApiErrorMessage(error, "Update failed. Please try again."));
    },
  });

  if (hasConflict) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive space-y-3"
      >
        <p className="font-semibold">This record was updated by someone else.</p>
        <p>Please reload the page to see the latest version before editing.</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    );
  }

  const SelectField = ({
    name,
    label,
    options,
    ariaLabel,
  }: {
    name: keyof PatientEditFormValues;
    label: string;
    options: MasterDataItem[];
    ariaLabel: string;
  }) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select onValueChange={field.onChange} value={field.value as string ?? ""} disabled={isPending}>
            <FormControl>
              <SelectTrigger aria-label={ariaLabel}>
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.code} value={opt.code}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => updatePatient(v))}
        noValidate
        aria-label="Edit patient details"
        className="space-y-6"
      >
        <fieldset className="space-y-4 rounded-md border bg-card p-5">
          <legend className="px-1 text-sm font-semibold">Patient Identity</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Full name <span aria-hidden="true">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} aria-required="true" disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="text-sm text-muted-foreground sm:col-span-2">
              OP number <span className="font-mono font-medium text-foreground">{patient.op_number}</span> is immutable.
            </div>
            <SelectField name="gender" label="Gender" options={genderOptions} ariaLabel="Gender" />
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-md border bg-card p-5">
          <legend className="px-1 text-sm font-semibold">Contact & Identification</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["mobile", "email", "date_of_birth", "age_years"] as const).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{name === "date_of_birth" ? "Date of birth" : name === "age_years" ? "Age (years)" : name === "mobile" ? "Mobile" : "Email"}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type={name === "date_of_birth" ? "date" : name === "age_years" ? "number" : name === "mobile" ? "tel" : "email"}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-md border bg-card p-5">
          <legend className="px-1 text-sm font-semibold">Demographics</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="blood_group" label="Blood group" options={bloodGroupOptions} ariaLabel="Blood group" />
            <SelectField name="marital_status" label="Marital status" options={maritalStatusOptions} ariaLabel="Marital status" />
            <SelectField name="dietary_preference" label="Dietary preference" options={dietaryOptions} ariaLabel="Dietary preference" />
            <FormField
              control={form.control}
              name="profession"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profession</FormLabel>
                  <FormControl><Input {...field} disabled={isPending} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-md border bg-card p-5">
          <legend className="px-1 text-sm font-semibold">Physical Measurements</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["height_cm", "weight_kg"] as const).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{name === "height_cm" ? "Height (cm)" : "Weight (kg)"}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0.1} step="0.1" disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-md border bg-card p-5">
          <legend className="px-1 text-sm font-semibold">Address</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="address_line"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Street / village address</FormLabel>
                  <FormControl><Textarea {...field} rows={2} disabled={isPending} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(["city", "state", "pincode"] as const).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{name.charAt(0).toUpperCase() + name.slice(1)}</FormLabel>
                    <FormControl><Input {...field} disabled={isPending} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-md border bg-card p-5">
          <legend className="px-1 text-sm font-semibold">Remarks</legend>
          <FormField
            control={form.control}
            name="remarks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remarks</FormLabel>
                <FormControl><Textarea {...field} rows={3} disabled={isPending} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Save changes
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function BasicDetailsTab(props: BasicDetailsTabProps) {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(PERMISSIONS.EDIT_PATIENT);
  const [editing, setEditing] = useState(false);
  const [localPatient, setLocalPatient] = useState<Patient>(props.patient);

  // Sync when parent re-fetches
  if (props.patient.version !== localPatient.version && !editing) {
    setLocalPatient(props.patient);
  }

  return editing ? (
    <div className="pt-4">
      <EditMode
        patient={localPatient}
        genderOptions={props.genderOptions}
        bloodGroupOptions={props.bloodGroupOptions}
        maritalStatusOptions={props.maritalStatusOptions}
        dietaryOptions={props.dietaryOptions}
        onCancel={() => setEditing(false)}
        onSaved={(updated) => {
          setLocalPatient(updated);
          setEditing(false);
        }}
      />
    </div>
  ) : (
    <div className="pt-4">
      <ViewMode
        {...props}
        patient={localPatient}
        canEdit={canEdit}
        onEdit={() => setEditing(true)}
      />
    </div>
  );
}
