import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { patientsApi } from "@/api/patientsApi";
import { masterDataApi } from "@/api/masterDataApi";
import { getApiErrorMessage } from "@/api/errors";
import { BasicDetailsTab } from "./tabs/BasicDetailsTab";
import { VisitsTab } from "@/features/visits/VisitsTab";
import { CaseSheetTab } from "@/features/visits/CaseSheetTab";
import { ConsultationNotesTab } from "@/features/visits/ConsultationNotesTab";
import { visitsApi } from "@/api/visitsApi";
import type { Visit } from "@/types/visits";

const STALE = 5 * 60 * 1000;

function ComingSoonTab({ name }: { name: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-muted-foreground">{name} — coming in a future sprint.</p>
    </div>
  );
}

export function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("basic");
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  const { data: patient, isLoading, error } = useQuery({
    queryKey: ["patients", id],
    queryFn: () => patientsApi.get(id!),
    enabled: Boolean(id),
  });

  const { data: selectedVisit } = useQuery<Visit>({
    queryKey: ["visits", "single", selectedVisitId],
    queryFn: () => visitsApi.get(selectedVisitId!),
    enabled: Boolean(selectedVisitId),
    staleTime: STALE,
  });

  const { data: genderOptions = [] } = useQuery({
    queryKey: ["master-data", "gender"],
    queryFn: () => masterDataApi.list("gender"),
    staleTime: STALE,
  });
  const { data: bloodGroupOptions = [] } = useQuery({
    queryKey: ["master-data", "blood_group"],
    queryFn: () => masterDataApi.list("blood_group"),
    staleTime: STALE,
  });
  const { data: maritalStatusOptions = [] } = useQuery({
    queryKey: ["master-data", "marital_status"],
    queryFn: () => masterDataApi.list("marital_status"),
    staleTime: STALE,
  });
  const { data: dietaryOptions = [] } = useQuery({
    queryKey: ["master-data", "dietary_preference"],
    queryFn: () => masterDataApi.list("dietary_preference"),
    staleTime: STALE,
  });
  const { data: opSequences = [] } = useQuery({
    queryKey: ["op-sequences"],
    queryFn: () => masterDataApi.listOpSequences(),
    staleTime: STALE,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading patient record…" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Button variant="ghost" onClick={() => navigate("/patients/search")}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to search
        </Button>
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {getApiErrorMessage(error, "Patient record not found.")}
        </div>
      </div>
    );
  }

  const handleVisitSelect = (visitId: string) => {
    setSelectedVisitId(visitId);
    // Auto-navigate to Case Sheet tab when a visit is selected from Visits tab
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Patient Profile"
        title={patient.full_name}
        subtitle={`OP: ${patient.op_number}`}
        actions={
          <Button variant="ghost" onClick={() => navigate("/patients/search")}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to search
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList aria-label="Patient profile sections" className="flex-wrap gap-0">
          <TabsTrigger value="basic">Basic Details</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="case-sheet">
            Case Sheet
            {selectedVisitId && (
              <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            )}
          </TabsTrigger>
          <TabsTrigger value="consultation-notes">
            Consultation Notes
            {selectedVisitId && (
              <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            )}
          </TabsTrigger>
          <TabsTrigger value="prescriptions" disabled>Prescriptions</TabsTrigger>
          <TabsTrigger value="discharge" disabled>Discharge Summaries</TabsTrigger>
          <TabsTrigger value="documents" disabled>Documents</TabsTrigger>
          <TabsTrigger value="followups" disabled>Follow-Ups</TabsTrigger>
          <TabsTrigger value="audit" disabled>Audit History</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="pt-0">
          <BasicDetailsTab
            patient={patient}
            genderOptions={genderOptions}
            bloodGroupOptions={bloodGroupOptions}
            maritalStatusOptions={maritalStatusOptions}
            dietaryOptions={dietaryOptions}
            opSequences={opSequences}
          />
        </TabsContent>

        <TabsContent value="visits" className="pt-0">
          <VisitsTab
            patientId={patient.id}
            selectedVisitId={selectedVisitId}
            onVisitSelect={handleVisitSelect}
          />
        </TabsContent>

        <TabsContent value="case-sheet" className="pt-0">
          <CaseSheetTab
            selectedVisit={selectedVisit ?? null}
            onSelectVisitTab={() => setActiveTab("visits")}
          />
        </TabsContent>

        <TabsContent value="consultation-notes" className="pt-0">
          <ConsultationNotesTab
            selectedVisit={selectedVisit ?? null}
            onSelectVisitTab={() => setActiveTab("visits")}
          />
        </TabsContent>

        <TabsContent value="prescriptions" className="pt-0">
          <ComingSoonTab name="Prescriptions" />
        </TabsContent>

        <TabsContent value="discharge" className="pt-0">
          <ComingSoonTab name="Discharge Summaries" />
        </TabsContent>

        <TabsContent value="documents" className="pt-0">
          <ComingSoonTab name="Documents" />
        </TabsContent>

        <TabsContent value="followups" className="pt-0">
          <ComingSoonTab name="Follow-Ups" />
        </TabsContent>

        <TabsContent value="audit" className="pt-0">
          <ComingSoonTab name="Audit History" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
