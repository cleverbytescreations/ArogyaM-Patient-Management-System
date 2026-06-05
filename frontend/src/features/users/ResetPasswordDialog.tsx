import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { usersApi } from "./usersApi";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/lib/validation/users";
import { getApiErrorMessage } from "@/api/errors";
import type { User } from "@/types/users";

interface ResetPasswordDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: ResetPasswordDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: "", confirm_password: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: ResetPasswordFormValues) =>
      usersApi.resetPassword(user!.id, { new_password: data.new_password }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`Password reset for ${user?.full_name}.`);
      onOpenChange(false);
      form.reset();
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, "Failed to reset password."));
    },
  });

  const onSubmit = (values: ResetPasswordFormValues) => {
    mutation.mutate(values);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) form.reset();
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Set a new password for{" "}
            <strong>{user?.full_name ?? "this user"}</strong>.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="reset-password-form"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <div className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="new_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      New Password <span aria-hidden="true">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="new-password"
                        aria-required="true"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirm_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Confirm Password <span aria-hidden="true">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="new-password"
                        aria-required="true"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            form="reset-password-form"
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Reset Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
