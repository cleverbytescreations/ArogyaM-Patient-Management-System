import type { AxiosError } from "axios";
import type { ApiError, ApiErrorBody } from "@/types/api";

export function getApiError(error: unknown): ApiErrorBody | null {
  const axiosError = error as AxiosError<ApiError>;
  return axiosError?.response?.data?.error ?? null;
}

export function getApiErrorCode(error: unknown): string | null {
  return getApiError(error)?.code ?? null;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "An unexpected error occurred."
): string {
  return getApiError(error)?.message ?? fallback;
}

export function isApiError(error: unknown, code: string): boolean {
  return getApiErrorCode(error) === code;
}

export function getFieldErrors(
  error: unknown
): Record<string, string> {
  const apiError = getApiError(error);
  if (!apiError?.details) return {};
  return apiError.details.reduce<Record<string, string>>((acc, item) => {
    acc[item.field] = item.message;
    return acc;
  }, {});
}
