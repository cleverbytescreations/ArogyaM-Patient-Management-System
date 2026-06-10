import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { patientsApi } from "@/api/patientsApi";
import { masterDataApi } from "@/api/masterDataApi";
import { getApiErrorMessage } from "@/api/errors";
import { DEFAULT_PAGE_SIZE, PERMISSIONS } from "@/lib/constants";
import { usePermissions } from "@/auth/usePermissions";
import type { PatientSearchResult, PatientStatus } from "@/types/patients";
import type { MasterDataItem } from "@/types/masterData";

function categoryLabel(options: MasterDataItem[], code: string): string {
  return options.find((o) => o.code === code)?.label ?? code;
}

function StatusBadge({ status }: { status: PatientStatus }) {
  const variant =
    status === "ACTIVE"
      ? "success"
      : status === "MERGED"
        ? "secondary"
        : "warning";
  return (
    <Badge variant={variant} aria-label={`Status: ${status}`}>
      {status}
    </Badge>
  );
}

function buildColumns(
  onView: (row: PatientSearchResult) => void,
  consultationCategoryOptions: MasterDataItem[]
): Column<PatientSearchResult>[] {
  return [
    {
      key: "op_number",
      header: "OP Number",
      render: (row) => (
        <span className="font-mono font-medium">{row.op_number}</span>
      ),
      className: "w-32",
    },
    {
      key: "full_name",
      header: "Name",
      render: (row) => row.full_name,
    },
    {
      key: "gender",
      header: "Gender",
      render: (row) =>
        row.gender
          ? row.gender.charAt(0) + row.gender.slice(1).toLowerCase()
          : "—",
      className: "w-24 hidden sm:table-cell",
    },
    {
      key: "age_or_dob",
      header: "Age / DOB",
      render: (row) => row.age_or_dob ?? "—",
      className: "w-28 hidden md:table-cell",
    },
    {
      key: "mobile_masked",
      header: "Mobile",
      render: (row) => (
        <span className="font-mono text-xs">{row.mobile_masked ?? "—"}</span>
      ),
      className: "w-28 hidden sm:table-cell",
    },
    {
      key: "op_category_code",
      header: "Category",
      render: (row) => (
        <span className="text-xs">
          {categoryLabel(consultationCategoryOptions, row.op_category_code)}
        </span>
      ),
      className: "w-32 hidden md:table-cell",
    },
    {
      key: "latest_doctor_name",
      header: "Doctor",
      render: (row) => (
        <span className="text-sm">{row.latest_doctor_name ?? "—"}</span>
      ),
      className: "hidden lg:table-cell",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
      className: "w-24",
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onView(row)}
          aria-label={`View profile for ${row.full_name}`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      ),
      className: "w-10",
    },
  ];
}

export function PatientSearchPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const { data: consultationCategoryOptions = [] } = useQuery({
    queryKey: ["master-data", "consultation_category"],
    queryFn: () => masterDataApi.list("consultation_category"),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["patients", "search", { q: query, page }],
    queryFn: () =>
      patientsApi.search({
        q: query || undefined,
        page,
        page_size: DEFAULT_PAGE_SIZE,
      }),
    enabled: hasSearched && query.trim().length > 0,
  });

  const handleSearch = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setPage(1);
    setHasSearched(true);
  }, [inputValue]);

  const handleClear = () => {
    setInputValue("");
    setQuery("");
    setPage(1);
    setHasSearched(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleViewProfile = useCallback(
    (row: PatientSearchResult) => {
      navigate(`/patients/${row.id}`);
    },
    [navigate]
  );

  const canCreate = hasPermission(PERMISSIONS.CREATE_PATIENT);
  const columns = useMemo(
    () => buildColumns(handleViewProfile, consultationCategoryOptions),
    [handleViewProfile, consultationCategoryOptions]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient Management"
        title="Patient Search"
        subtitle="Search by OP number, mobile number, or patient name."
        actions={
          canCreate ? (
            <Button onClick={() => navigate("/patients/new")}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Register new patient
            </Button>
          ) : undefined
        }
      />

      {/* Search bar */}
      <div
        role="search"
        aria-label="Patient search"
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="patient-search-input"
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by OP number, name, or mobile…"
            className="pl-9 pr-9"
            autoComplete="off"
            aria-label="Search patients"
          />
          {inputValue && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              onClick={handleClear}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <Button
          onClick={handleSearch}
          disabled={!inputValue.trim() || isLoading}
          aria-label="Apply search"
        >
          Search
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {getApiErrorMessage(error, "Failed to search patients.")}
        </div>
      )}

      {/* Results — shown after a search has been submitted */}
      {hasSearched && query && (
        <>
          {data && (
            <p
              className="text-sm text-muted-foreground"
              aria-live="polite"
              aria-atomic="true"
            >
              {data.total === 0
                ? `No patients found for "${query}".`
                : `${data.total} patient${data.total === 1 ? "" : "s"} found for "${query}".`}
            </p>
          )}

          <div
            role="region"
            aria-label="Search results"
            aria-live="polite"
            aria-busy={isLoading}
          >
            <DataTable
              columns={columns}
              data={data?.items ?? []}
              isLoading={isLoading}
              total={data?.total ?? 0}
              page={page}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setPage}
              emptyMessage={`No patients found for "${query}". Try a different search term.`}
              getRowKey={(row) => row.id}
            />
          </div>
        </>
      )}

      {/* Landing state — before first search */}
      {!hasSearched && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <Search className="h-10 w-10 opacity-25" aria-hidden="true" />
          <p className="text-sm">
            Enter a name, OP number, or mobile number above and press Search.
          </p>
        </div>
      )}
    </div>
  );
}
