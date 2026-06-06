import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/auth/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";
import { loginSchema, type LoginFormValues } from "@/lib/validation/auth";
import { getApiErrorCode, getApiErrorMessage } from "@/api/errors";
import { APP_NAME } from "@/lib/constants";

/** Service capabilities surfaced on the login hero — plain copy, no PHI. */
const SERVICE_HIGHLIGHTS = [
  "Instant patient search by OP number, name or mobile",
  "Role-based access for doctors, reception and administrators",
  "Encrypted document vault with a complete audit trail",
  "Transaction-safe, category-wise OP number generation",
];

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
    <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* ─── Brand / service hero (Kyndryl-style editorial panel) ─── */}
      <section
        aria-labelledby="login-hero-heading"
        className="relative hidden overflow-hidden bg-brand-ink lg:flex lg:flex-col"
      >
        {/* Full-bleed brand photograph */}
        <img
          src="/brand/arogyam-login-art2.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
          draggable={false}
        />
        {/* Legibility scrim — darker at the bottom where the copy sits */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-brand-ink/92 via-brand-ink/55 to-brand-ink/20"
        />

        <div className="relative z-10 flex flex-1 flex-col justify-between px-12 py-12 xl:px-16">
          {/* Brand lockup + tagline */}
          <div>
            <div className="flex items-center gap-3">
              <BrandLogo variant="wordmark" decorative className="h-10 w-auto" />
            </div>
            <p className="mt-3 text-lg font-light leading-snug text-white/80">
              Compassionate care, precisely kept.
            </p>
          </div>

          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              Patient Management System
            </p>
            <span className="accent-rule mt-3" aria-hidden="true" />
            <h2
              id="login-hero-heading"
              className="mt-6 text-4xl font-normal leading-[1.1] text-white xl:text-5xl"
            >
              Every patient record, secure and within reach.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/85">
              ArogyaM PMS replaces paper case-sheets with a structured digital
              record — registration, consultations, prescriptions, discharge
              summaries and document uploads — in one secure, fully audited
              workspace for clinic staff and doctors.
            </p>

            <ul className="mt-8 space-y-3" role="list">
              {SERVICE_HIGHLIGHTS.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm leading-relaxed text-white/85"
                >
                  <span aria-hidden="true" className="text-primary">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Sign-in form ─── */}
      <section className="flex min-h-screen flex-col bg-background px-6 py-10 lg:min-h-0">
        {/* Satsang Foundation lockup — top of the form cell */}
        <div className="mx-auto flex w-full max-w-sm justify-start">
          <img
            src="/brand/satsang-foundation-logo.webp"
            alt="The Satsang Foundation"
            className="h-12 w-auto"
            draggable={false}
          />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm">
          {/* Compact brand lockup — only shown when the hero is hidden (mobile) */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandLogo variant="mark" decorative className="h-10 w-10" />
            <BrandLogo variant="wordmark" decorative className="h-7 w-auto" />
          </div>

          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            Sign in to {APP_NAME}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your clinic credentials to access patient records.
          </p>
          <span className="accent-rule mt-4" aria-hidden="true" />

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
              aria-label="Login form"
              className="mt-8"
            >
              <div className="space-y-4">
                {apiError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="bg-destructive/10 p-3 text-sm text-destructive border-l-2 border-destructive"
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
                      <div className="relative">
                        <FormControl>
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            disabled={isSubmitting}
                            aria-required="true"
                            placeholder="Enter your password"
                            className="pr-10"
                          />
                        </FormControl>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
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

          <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Protected workspace — every action is recorded in the audit trail.
          </p>
        </div>
        </div>

        {/* Footer */}
        <footer className="mx-auto w-full max-w-sm text-xs text-muted-foreground">
          © 2026 The Satsang Foundation. All rights reserved.
        </footer>
      </section>
    </div>
  );
}
