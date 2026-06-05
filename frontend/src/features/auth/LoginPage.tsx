import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/auth/AuthContext";
import { loginSchema, type LoginFormValues } from "@/lib/validation/auth";
import { getApiErrorCode, getApiErrorMessage } from "@/api/errors";
import { APP_NAME } from "@/lib/constants";

function getLoginErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error);
  if (code === "AUTH_ACCOUNT_LOCKED") {
    return "Your account is temporarily locked due to multiple failed login attempts. Please try again later.";
  }
  if (code === "AUTH_ACCOUNT_DISABLED") {
    return "Your account has been disabled. Please contact your administrator.";
  }
  if (code === "RATE_LIMITED") {
    return "Too many login attempts. Please wait a moment and try again.";
  }
  const httpStatus = (error as { response?: { status?: number } })?.response?.status;
  if (httpStatus === 429) {
    return "Too many login attempts. Please wait a moment and try again.";
  }
  return getApiErrorMessage(error, "Invalid credentials. Please check your username and password.");
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? "/";

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: LoginFormValues) => {
    setApiError(null);
    try {
      await login(values.username, values.password);
      navigate(from, { replace: true });
    } catch (error: unknown) {
      setApiError(getLoginErrorMessage(error));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {APP_NAME}
          </CardTitle>
          <CardDescription className="text-center">
            Sign in to your account
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
              aria-label="Login form"
            >
              <div className="space-y-4">
                {apiError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20"
                  >
                    {apiError}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Username <span aria-hidden="true">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          autoComplete="username"
                          autoFocus
                          disabled={isSubmitting}
                          aria-required="true"
                          placeholder="Enter your username"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Password <span aria-hidden="true">*</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            disabled={isSubmitting}
                            aria-required="true"
                            placeholder="Enter your password"
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                            tabIndex={0}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  {isSubmitting && (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
