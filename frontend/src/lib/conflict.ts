import { useCallback, useState } from "react";
import type { AxiosError } from "axios";
import type { ApiError } from "@/types/api";

export function isVersionConflict(error: unknown): boolean {
  const axiosError = error as AxiosError<ApiError>;
  return (
    axiosError?.response?.status === 409 &&
    axiosError?.response?.data?.error?.code === "VERSION_CONFLICT"
  );
}

export function useConflictHandler() {
  const [hasConflict, setHasConflict] = useState(false);

  const handlePossibleConflict = useCallback((error: unknown): boolean => {
    if (isVersionConflict(error)) {
      setHasConflict(true);
      return true;
    }
    return false;
  }, []);

  const clearConflict = useCallback(() => setHasConflict(false), []);

  return { hasConflict, handlePossibleConflict, clearConflict };
}
