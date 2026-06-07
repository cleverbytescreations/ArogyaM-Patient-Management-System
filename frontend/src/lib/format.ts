import { format, parseISO } from "date-fns";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd MMM yyyy");
  } catch {
    return "—";
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd MMM yyyy, hh:mm a");
  } catch {
    return "—";
  }
}

export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return "—";
  if (mobile.length < 4) return "****";
  return `****${mobile.slice(-4)}`;
}

export function formatRoleCode(code: string): string {
  const map: Record<string, string> = {
    ADMIN: "Administrator",
    DOCTOR: "Doctor",
    RECEPTION: "Receptionist",
    DATA_ENTRY: "Data Entry Staff",
  };
  return map[code] ?? code;
}
