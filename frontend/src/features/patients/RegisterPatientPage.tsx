import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  UserPlus,
} from "lucide-react";
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
import { PageHeader } from "@/components/PageHeader";
import { patientsApi } from "@/api/patientsApi";
import { masterDataApi } from "@/api/masterDataApi";
import {
  registerPatientSchema,
  type RegisterPatientFormValues,
} from "@/lib/validation/patients";
import {
  getApiError,
  getApiErrorCode,
  getApiErrorMessage,
  getFieldErrors,
} from "@/api/errors";
import type {
  Patient,
  PatientCreateRequest,
  GenderCode,
  DuplicateSuggestion,
} from "@/types/patients";

function calcAgeFromDOB(dob: string): number | null {
  const dobDate = new Date(dob);
  if (isNaN(dobDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const m = today.getMonth() - dobDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
  return age >= 0 ? age : 0;
}

function toApiRequest(values: RegisterPatientFormValues): PatientCreateRequest {
  return {
    full_name: values.full_name,
    op_category_code: values.op_category_code,
    gender: values.gender as GenderCode,
    mobile: values.mobile,
    ...(values.date_of_birth?.trim()
      ? { date_of_birth: values.date_of_birth.trim() }
      : {}),
    ...(!values.date_of_birth?.trim() && values.age_years?.trim()
      ? { age_years: Number(values.age_years) }
      : {}),
    ...(values.email?.trim() ? { email: values.email.trim() } : {}),
    ...(values.address?.trim() ? { address: values.address.trim() } : {}),
    ...(values.blood_group ? { blood_group: values.blood_group } : {}),
    ...(values.marital_status
      ? { marital_status: values.marital_status }
      : {}),
    ...(values.dietary_preference
      ? { dietary_preference: values.dietary_preference }
      : {}),
    ...(values.occupation?.trim()
      ? { occupation: values.occupation.trim() }
      : {}),
    ...(values.height_cm?.trim()
      ? { height_cm: Number(values.height_cm) }
      : {}),
    ...(values.weight_kg?.trim()
      ? { weight_kg: Number(values.weight_kg) }
      : {}),
    ...(values.hereditary_diseases?.trim()
      ? { hereditary_diseases: values.hereditary_diseases.trim() }
      : {}),
    ...(values.allergies?.trim()
      ? { allergies: values.allergies.trim() }
      : {}),
    ...(values.remarks?.trim() ? { remarks: values.remarks.trim() } : {}),
  };
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 rounded-md border bg-card p-5">
      <legend className="px-1 text-sm font-semibold text-foreground">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function DuplicateWarning({
  duplicates,
  onConfirm,
  isPending,
}: {
  duplicates: DuplicateSuggestion[];
  onConfirm: () => void;
  isPending: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-warning/50 bg-warning/10 p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Possible duplicate patient detected
          </p>
          <p className="text-sm text-muted-foreground">
            The following existing patient records may match. Please review
            before registering.
          </p>
        </div>
      </div>

      {duplicates.length > 0 && (
        <ul className="space-y-2 pl-8" role="list">
          {duplicates.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-sm border bg-background px-3 py-2 text-sm"
            >
              <span>
                <span className="font-mono font-medium">{d.op_number}</span>
                {" — "}
                {d.full_name}
                {d.mobile_masked && (
                  <span className="text-muted-foreground">
                    {" "}· {d.mobile_masked}
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/patients/${d.id}`)}
                aria-label={`View profile for ${d.full_name}`}
              >
                View profile
                <ChevronRight className="ml-1 h-3 w-3" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 pl-8">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onConfirm}
          disabled={isPending}
        >
          {isPending && (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" aria-hidden="true" />
          )}
          Register anyway
        </Button>
      </div>
    </div>
  );
}

function SuccessView({
  patient,
  onRegisterAnother,
}: {
  patient: Patient;
  onRegisterAnother: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-6 py-16 text-center"
    >
      <CheckCircle2
        className="h-16 w-16 text-success"
        aria-hidden="true"
      />
      <div className="space-y-2">
        <h2 className="text-2xl font-light tracking-tight text-foreground">
          Patient registered successfully
        </h2>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{patient.full_name}</span>{" "}
          has been registered with OP number{" "}
          <span className="font-mono font-semibold text-foreground">
            {patient.op_number}
          </span>
          .
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => navigate(`/patients/${patient.id}`)}>
          View patient profile
        </Button>
        <Button variant="outline" onClick={onRegisterAnother}>
          Register another patient
        </Button>
      </div>
    </div>
  );
}

export function RegisterPatientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [duplicates, setDuplicates] = useState<DuplicateSuggestion[] | null>(
    null
  );
  const [pendingData, setPendingData] =
    useState<RegisterPatientFormValues | null>(null);
  const [registeredPatient, setRegisteredPatient] = useState<Patient | null>(
    null
  );

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

  const { data: opSequences = [] } = useQuery({
    queryKey: ["op-sequences"],
    queryFn: () => masterDataApi.listOpSequences(),
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<RegisterPatientFormValues>({
    resolver: zodResolver(registerPatientSchema),
    mode: "onChange",
    defaultValues: {
      full_name: "",
      op_category_code: "",
      gender: "",
      date_of_birth: "",
      age_years: "",
      mobile: "",
      email: "",
      address: "",
      blood_group: "",
      marital_status: "",
      dietary_preference: "",
      occupation: "",
      height_cm: "",
      weight_kg: "",
      hereditary_diseases: "",
      allergies: "",
      remarks: "",
    },
  });

  const watchedDOB = form.watch("date_of_birth");

  useEffect(() => {
    if (!watchedDOB) {
      form.setValue("age_years", "", { shouldValidate: false });
      return;
    }
    const age = calcAgeFromDOB(watchedDOB);
    if (age !== null) {
      form.setValue("age_years", String(age), { shouldValidate: false });
    }
  }, [watchedDOB, form]);

  const { mutate: registerPatient, isPending } = useMutation({
    mutationFn: ({
      data,
      confirm,
    }: {
      data: PatientCreateRequest;
      confirm: boolean;
    }) => patientsApi.register(data, confirm),
    onSuccess: (patient) => {
      setDuplicates(null);
      setPendingData(null);
      setRegisteredPatient(patient);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success(
        `Patient registered with OP number ${patient.op_number}`
      );
    },
    onError: (error: unknown) => {
      const code = getApiErrorCode(error);

      if (code === "DUPLICATE_PATIENT_SUSPECTED") {
        const details = getApiError(error)?.details;
        const suggestions = (details as unknown as DuplicateSuggestion[]) ?? [];
        setDuplicates(suggestions);
        return;
      }

      if (code === "MIN_IDENTITY_REQUIRED") {
        form.setError("mobile", {
          message:
            "At least one of mobile, email, date of birth, or age is required.",
        });
        return;
      }

      if (code === "VALIDATION_ERROR") {
        const fieldErrors = getFieldErrors(error);
        for (const [field, message] of Object.entries(fieldErrors)) {
          form.setError(field as keyof RegisterPatientFormValues, { message });
        }
        return;
      }

      toast.error(getApiErrorMessage(error, "Registration failed. Please try again."));
    },
  });

  const onSubmit = (values: RegisterPatientFormValues) => {
    setDuplicates(null);
    setPendingData(values);
    registerPatient({ data: toApiRequest(values), confirm: false });
  };

  const handleConfirmCreate = () => {
    if (!pendingData) return;
    registerPatient({ data: toApiRequest(pendingData), confirm: true });
  };

  if (registeredPatient) {
    return (
      <SuccessView
        patient={registeredPatient}
        onRegisterAnother={() => {
          setRegisteredPatient(null);
          form.reset();
        }}
      />
    );
  }

  const activeOpSequences = opSequences.filter((s) => s.is_active);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Patient Management"
        title="Register New Patient"
        subtitle="Fields marked * are required."
        actions={
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/patients/search")}
          >
            Back to search
          </Button>
        }
      />

      {duplicates !== null && (
        <DuplicateWarning
          duplicates={duplicates}
          onConfirm={handleConfirmCreate}
          isPending={isPending}
        />
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          aria-label="Patient registration form"
          className="space-y-6"
        >
          {/* ── Patient Identity ── */}
          <FormSection title="Patient Identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>
                      Full name <span aria-hidden="true">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Patient's full name"
                        autoComplete="off"
                        aria-required="true"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="op_category_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      OP category <span aria-hidden="true">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isPending}
                      onOpenChange={(open) => {
                        if (!open) field.onBlur();
                      }}
                    >
                      <FormControl>
                        <SelectTrigger aria-label="OP category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeOpSequences.map((seq) => (
                          <SelectItem
                            key={seq.category_code}
                            value={seq.category_code}
                          >
                            {seq.category_code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Gender <span aria-hidden="true">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isPending}
                      onOpenChange={(open) => {
                        if (!open) field.onBlur();
                      }}
                    >
                      <FormControl>
                        <SelectTrigger aria-label="Gender">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {genderOptions.map((opt) => (
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
            </div>
          </FormSection>

          {/* ── Contact & Identification ── */}
          <FormSection title="Contact & Identification">
            <p className="text-xs text-muted-foreground">
              Email and date of birth help identify patients and reduce duplicate registrations.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="mobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Mobile number <span aria-hidden="true">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="tel"
                        inputMode="numeric"
                        maxLength={15}
                        placeholder="10-digit number (e.g. 9876543210)"
                        autoComplete="tel"
                        aria-required="true"
                        disabled={isPending}
                        onChange={(e) => {
                          field.onChange(
                            e.target.value.replace(/\D/g, "").slice(0, 15)
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="patient@example.com"
                        autoComplete="email"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of birth</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        disabled={isPending}
                      />
                    </FormControl>
                    {watchedDOB && calcAgeFromDOB(watchedDOB) !== null && (
                      <p className="text-xs text-muted-foreground">
                        Age: {calcAgeFromDOB(watchedDOB)} years
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!watchedDOB && (
                <FormField
                  control={form.control}
                  name="age_years"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age (years)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={150}
                          placeholder="Enter if date of birth unknown"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </FormSection>

          {/* ── Demographics ── */}
          <FormSection title="Demographics">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="blood_group"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blood group</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger aria-label="Blood group">
                          <SelectValue placeholder="Select blood group" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {bloodGroupOptions.map((opt) => (
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

              <FormField
                control={form.control}
                name="marital_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marital status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger aria-label="Marital status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {maritalStatusOptions.map((opt) => (
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

              <FormField
                control={form.control}
                name="dietary_preference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dietary preference</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger aria-label="Dietary preference">
                          <SelectValue placeholder="Select preference" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {dietaryOptions.map((opt) => (
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

              <FormField
                control={form.control}
                name="occupation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Occupation</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. Farmer, Teacher"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          {/* ── Physical Measurements ── */}
          <FormSection title="Physical Measurements">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="height_cm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Height (cm)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        inputMode="decimal"
                        min={1}
                        placeholder="e.g. 165"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="weight_kg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight (kg)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        inputMode="decimal"
                        min={0.1}
                        step="0.1"
                        placeholder="e.g. 60"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          {/* ── Medical Background ── */}
          <FormSection title="Medical Background">
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="hereditary_diseases"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hereditary / family diseases</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Describe any hereditary or family conditions"
                        disabled={isPending}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allergies"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Known allergies</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="List known allergies (medications, foods, etc.)"
                        disabled={isPending}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          {/* ── Address ── */}
          <FormSection title="Address">
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Residential address</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Street, village, city, PIN code"
                      disabled={isPending}
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          {/* ── Remarks ── */}
          <FormSection title="Additional Remarks">
            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Any additional notes about the patient"
                      disabled={isPending}
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/patients/search")}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} aria-busy={isPending}>
              {isPending ? (
                <>
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Registering…
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Register patient
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
