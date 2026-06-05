import { Loader2 } from "lucide-react";

export function PageLoader() {
  return (
    <div
      className="flex h-screen items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
