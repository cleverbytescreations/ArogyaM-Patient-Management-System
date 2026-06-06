import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Small uppercase tracked label above the title (the Kyndryl "SERVICES" eyebrow). */
  eyebrow?: string;
  /** Page title — rendered in the light-weight, oversized editorial style. */
  title: string;
  /** Optional muted subtitle below the title. */
  subtitle?: string;
  /** Optional right-aligned actions (e.g. a primary button). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Editorial page header in the Kyndryl idiom: an optional uppercase eyebrow with a
 * short coral accent rule, a light-weight oversized title, and an optional subtitle,
 * with room for right-aligned actions. Carries the brand voice across every page.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div>
        {eyebrow && (
          <>
            <p className="eyebrow">{eyebrow}</p>
            <span className="accent-rule mt-2" aria-hidden="true" />
          </>
        )}
        <h1
          className={cn(
            "text-3xl font-light tracking-tight text-foreground sm:text-4xl",
            eyebrow ? "mt-4" : ""
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-base font-light text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
