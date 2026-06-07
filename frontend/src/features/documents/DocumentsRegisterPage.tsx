import { useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { patientsApi } from "@/api/patientsApi";
import { getApiErrorMessage } from "@/api/errors";
import { DocumentsTab } from "./DocumentsTab";

export function DocumentsRegisterPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["patients", "search", submitted],
    queryFn: () => patientsApi.search({ q: submitted, page: 1, page_size: 10 }),
    enabled: submitted.trim().length > 0,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Documents Register"
        subtitle="Search a patient, then view permission-checked document metadata and secure downloads."
      />

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSelectedPatientId(null);
          setSubmitted(query.trim());
        }}
      >
        <label className="sr-only" htmlFor="document-register-search">Search patients</label>
        <Input id="document-register-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by OP number, name, or mobile" />
        <Button type="submit" disabled={!query.trim()}>
          <Search className="mr-2 h-4 w-4" aria-hidden="true" />
          Search
        </Button>
      </form>

      {submitted && !selectedPatientId && (
        <div className="rounded-md border bg-card">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Searching…</p>
          ) : error ? (
            <div role="alert" className="m-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {getApiErrorMessage(error, "Could not search patients.")}
            </div>
          ) : (data?.items ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No patients found.</p>
          ) : (
            <ul role="list" className="divide-y">
              {(data?.items ?? []).map((patient) => (
                <li key={patient.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{patient.full_name}</p>
                    <p className="text-sm text-muted-foreground">OP {patient.op_number} · {patient.mobile_masked}</p>
                  </div>
                  <Button size="sm" onClick={() => setSelectedPatientId(patient.id)}>Open documents</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selectedPatientId && <DocumentsTab patientId={selectedPatientId} />}
    </div>
  );
}
