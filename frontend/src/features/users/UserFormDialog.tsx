import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { usersApi } from "./usersApi";
import {
  createUserSchema,
  editUserSchema,
  type CreateUserFormValues,
  type EditUserFormValues,
} from "@/lib/validation/users";
import { getApiErrorMessage, isApiError } from "@/api/errors";
import { formatRoleCode } from "@/lib/format";
import type { User } from "@/types/users";
import type { RoleCode } from "@/types/auth";

type FormMode = "create" | "edit";

interface UserFormDialogProps {
  mode: FormMode;
  user?: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserFormDialog({
  mode,
  user,
  open,
  onOpenChange,
}: UserFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = mode === "edit";

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: usersApi.getRoles,
    staleTime: 5 * 60 * 1000,
  });

  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      full_name: "",
      email: "",
      mobile: "",
      password: "",
      is_doctor: false,
      role_codes: [],
    },
  });

  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      full_name: user?.full_name ?? "",
      email: user?.email ?? "",
      mobile: user?.mobile ?? "",
      is_doctor: user?.is_doctor ?? false,
      role_codes: user?.roles ?? [],
    },
  });

  useEffect(() => {
    if (isEdit && user && open) {
      editForm.reset({
        full_name: user.full_name,
        email: user.email ?? "",
        mobile: user.mobile ?? "",
        is_doctor: user.is_doctor,
        role_codes: user.roles,
      });
    }
  }, [isEdit, user, open, editForm]);

  const createMutation = useMutation({
    mutationFn: (data: CreateUserFormValues) =>
      usersApi.create({
        ...data,
        email: data.email || undefined,
        mobile: data.mobile || undefined,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`User "${created.username}" created successfully.`);
      onOpenChange(false);
      createForm.reset();
    },
    onError: (error: unknown) => {
      if (isApiError(error, "RESOURCE_CONFLICT")) {
        createForm.setError("username", {
          message: "Username or email already exists.",
        });
      } else {
        toast.error(getApiErrorMessage(error, "Failed to create user."));
      }
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: EditUserFormValues) =>
      usersApi.update(user!.id, {
        ...data,
        email: data.email || undefined,
        mobile: data.mobile || undefined,
        version: user!.version,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated successfully.");
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      if (isApiError(error, "VERSION_CONFLICT")) {
        toast.error(
          "This record was modified by someone else. Please reload and try again."
        );
        onOpenChange(false);
      } else if (isApiError(error, "RESOURCE_CONFLICT")) {
        editForm.setError("email", { message: "Email already in use." });
      } else {
        toast.error(getApiErrorMessage(error, "Failed to update user."));
      }
    },
  });

  const isPending = createMutation.isPending || editMutation.isPending;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      createForm.reset();
      editForm.reset();
    }
    onOpenChange(isOpen);
  };

  const onCreateSubmit = (values: CreateUserFormValues) => {
    createMutation.mutate(values);
  };

  const onEditSubmit = (values: EditUserFormValues) => {
    editMutation.mutate(values);
  };

  const roleCodes = roles.map((r) => r.code);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Create User"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update details for ${user?.full_name ?? "user"}.`
              : "Fill in the details to create a new user."}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <Form {...editForm}>
            <form
              id="user-form"
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              noValidate
            >
              <UserFormFields
                form={editForm}
                isPending={isPending}
                roleCodes={roleCodes}
                showPasswordField={false}
              />
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form
              id="user-form"
              onSubmit={createForm.handleSubmit(onCreateSubmit)}
              noValidate
            >
              <UserFormFields
                form={createForm}
                isPending={isPending}
                roleCodes={roleCodes}
                showPasswordField={true}
              />
            </form>
          </Form>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button form="user-form" type="submit" disabled={isPending}>
            {isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {isEdit ? "Save Changes" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UserFormFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  isPending: boolean;
  roleCodes: RoleCode[];
  showPasswordField: boolean;
}

function UserFormFields({
  form,
  isPending,
  roleCodes,
  showPasswordField,
}: UserFormFieldsProps) {
  return (
    <div className="space-y-4 py-2">
      {showPasswordField && (
        <FormField
          control={form.control}
          name="username"
          render={({ field }: { field: object }) => (
            <FormItem>
              <FormLabel>
                Username <span aria-hidden="true">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={isPending}
                  aria-required="true"
                  autoComplete="off"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="full_name"
        render={({ field }: { field: object }) => (
          <FormItem>
            <FormLabel>
              Full Name <span aria-hidden="true">*</span>
            </FormLabel>
            <FormControl>
              <Input {...field} disabled={isPending} aria-required="true" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="email"
        render={({ field }: { field: object }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="email"
                disabled={isPending}
                autoComplete="email"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="mobile"
        render={({ field }: { field: object }) => (
          <FormItem>
            <FormLabel>Mobile</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="tel"
                disabled={isPending}
                autoComplete="tel"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {showPasswordField && (
        <FormField
          control={form.control}
          name="password"
          render={({ field }: { field: object }) => (
            <FormItem>
              <FormLabel>
                Password <span aria-hidden="true">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  disabled={isPending}
                  autoComplete="new-password"
                  aria-required="true"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="is_doctor"
        render={({ field }: { field: { value: boolean; onChange: (v: boolean) => void; name: string } }) => (
          <FormItem className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <FormLabel className="cursor-pointer">Doctor</FormLabel>
              <FormDescription>
                Mark this user as a consulting doctor
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isPending}
                aria-label="Is doctor"
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="role_codes"
        render={({ field }: { field: { value: RoleCode[]; onChange: (v: RoleCode[]) => void } }) => (
          <FormItem>
            <FormLabel>
              Roles <span aria-hidden="true">*</span>
            </FormLabel>
            <FormDescription>Select one or more roles</FormDescription>
            <div className="space-y-2 pt-1">
              {roleCodes.map((code) => {
                const checked = field.value.includes(code);
                return (
                  <label
                    key={code}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPending}
                      onChange={(e) => {
                        if (e.target.checked) {
                          field.onChange([...field.value, code]);
                        } else {
                          field.onChange(
                            field.value.filter((r) => r !== code)
                          );
                        }
                      }}
                      className="rounded border-input"
                    />
                    {formatRoleCode(code)}
                  </label>
                );
              })}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
