import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, RefreshCw, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UserFormDialog } from "./UserFormDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { usersApi } from "./usersApi";
import { getApiErrorMessage } from "@/api/errors";
import { formatRoleCode, formatDateTime } from "@/lib/format";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { User, UserStatus } from "@/types/users";

function StatusBadge({ status }: { status: UserStatus }) {
  const variant =
    status === "ACTIVE"
      ? "success"
      : status === "DISABLED"
        ? "secondary"
        : "warning";
  return (
    <Badge variant={variant} aria-label={`Status: ${status}`}>
      {status}
    </Badge>
  );
}

export function UsersListPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>();

  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users", { page, search }],
    queryFn: () =>
      usersApi.list({ page, page_size: DEFAULT_PAGE_SIZE, q: search || undefined }),
  });

  const statusMutation = useMutation({
    mutationFn: (user: User) =>
      usersApi.updateStatus(user.id, {
        status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
        version: user.version,
      }),
    onSuccess: (_data, user) => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      const action = user.status === "ACTIVE" ? "disabled" : "enabled";
      toast.success(`User "${user.full_name}" ${action}.`);
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, "Failed to update user status."));
    },
  });

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const openCreate = () => {
    setEditingUser(undefined);
    setFormDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormDialogOpen(true);
  };

  const openResetPassword = (user: User) => {
    setResetPasswordUser(user);
    setResetPasswordOpen(true);
  };

  const openStatusToggle = (user: User) => {
    setStatusTarget(user);
    setStatusDialogOpen(true);
  };

  const columns: Column<User>[] = [
    {
      key: "full_name",
      header: "Name",
      render: (user) => (
        <div>
          <p className="font-medium">{user.full_name}</p>
          <p className="text-xs text-muted-foreground">{user.username}</p>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (user) => user.email ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "roles",
      header: "Roles",
      render: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.roles.map((role) => (
            <Badge key={role} variant="outline" className="text-xs">
              {formatRoleCode(role)}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (user) => <StatusBadge status={user.status} />,
    },
    {
      key: "last_login",
      header: "Last Login",
      render: (user) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(user.last_login_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (user) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(user)}
            aria-label={`Edit ${user.full_name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openResetPassword(user)}
            aria-label={`Reset password for ${user.full_name}`}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openStatusToggle(user)}
            className={
              user.status === "ACTIVE"
                ? "text-destructive hover:text-destructive"
                : "text-green-600 hover:text-green-700"
            }
            aria-label={
              user.status === "ACTIVE"
                ? `Disable ${user.full_name}`
                : `Enable ${user.full_name}`
            }
          >
            {user.status === "ACTIVE" ? "Disable" : "Enable"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Manage staff accounts and roles
          </p>
        </div>
        <Button onClick={openCreate} aria-label="Create new user">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add User
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20"
        >
          Failed to load users: {getApiErrorMessage(error)}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by name or username…"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <Button
          variant="outline"
          onClick={handleSearch}
          aria-label="Apply search"
        >
          <Search className="mr-2 h-4 w-4" aria-hidden="true" />
          Search
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setSearch("");
            setSearchInput("");
            setPage(1);
            void queryClient.invalidateQueries({ queryKey: ["users"] });
          }}
          aria-label="Refresh user list"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        total={data?.total ?? 0}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
        emptyMessage="No users found."
        getRowKey={(u) => u.id}
      />

      <UserFormDialog
        mode={editingUser ? "edit" : "create"}
        user={editingUser}
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
      />

      <ResetPasswordDialog
        user={resetPasswordUser}
        open={resetPasswordOpen}
        onOpenChange={setResetPasswordOpen}
      />

      <ConfirmDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        title={
          statusTarget?.status === "ACTIVE" ? "Disable User" : "Enable User"
        }
        description={
          statusTarget?.status === "ACTIVE"
            ? `Are you sure you want to disable "${statusTarget?.full_name}"? They will no longer be able to sign in.`
            : `Are you sure you want to enable "${statusTarget?.full_name}"? They will be able to sign in again.`
        }
        confirmLabel={
          statusTarget?.status === "ACTIVE" ? "Disable" : "Enable"
        }
        destructive={statusTarget?.status === "ACTIVE"}
        onConfirm={() => {
          if (statusTarget) statusMutation.mutate(statusTarget);
        }}
      />
    </div>
  );
}
