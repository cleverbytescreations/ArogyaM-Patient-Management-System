import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon?: ReactNode;
  to?: string;
  className?: string;
  "aria-label"?: string;
}

export function KpiCard({
  title,
  value,
  description,
  icon,
  to,
  className,
  "aria-label": ariaLabel,
}: KpiCardProps) {
  const content = (
    <Card className={cn("transition-shadow hover:shadow-md", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && (
          <span className="text-muted-foreground" aria-hidden="true">
            {icon}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <p
          className="text-3xl font-bold tracking-tight"
          aria-label={ariaLabel ?? `${title}: ${value}`}
        >
          {value}
        </p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </Link>
    );
  }
  return content;
}

export function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-0 pb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-3 w-32 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}
