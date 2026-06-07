/**
 * conflict.ts — unit tests for the 409/VERSION_CONFLICT detection helpers.
 * Covers UI-TX.3 (component & validation tests): isolates the conflict
 * predicate and hook contract from the components that consume them
 * (e.g. CaseSheetTab, BasicDetailsTab) so regressions are caught directly.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { isVersionConflict, useConflictHandler } from "./conflict";

function axiosErrorLike(status: number, code?: string) {
  return {
    isAxiosError: true,
    response: {
      status,
      data: code
        ? { error: { code, message: "x", details: [], request_id: "r" } }
        : undefined,
    },
  };
}

describe("isVersionConflict", () => {
  it("returns true for a 409 response with VERSION_CONFLICT code", () => {
    expect(isVersionConflict(axiosErrorLike(409, "VERSION_CONFLICT"))).toBe(true);
  });

  it("returns false for a 409 response with a different error code", () => {
    expect(
      isVersionConflict(axiosErrorLike(409, "DUPLICATE_PATIENT_SUSPECTED"))
    ).toBe(false);
  });

  it("returns false for a non-409 status even with VERSION_CONFLICT code", () => {
    expect(isVersionConflict(axiosErrorLike(422, "VERSION_CONFLICT"))).toBe(false);
  });

  it("returns false for a 409 response with no error body", () => {
    expect(isVersionConflict(axiosErrorLike(409))).toBe(false);
  });

  it("returns false for errors without a response (network error)", () => {
    expect(isVersionConflict(new Error("Network Error"))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isVersionConflict(null)).toBe(false);
    expect(isVersionConflict(undefined)).toBe(false);
  });
});

describe("useConflictHandler", () => {
  it("starts with hasConflict = false", () => {
    const { result } = renderHook(() => useConflictHandler());
    expect(result.current.hasConflict).toBe(false);
  });

  it("sets hasConflict and returns true when handlePossibleConflict sees a version conflict", () => {
    const { result } = renderHook(() => useConflictHandler());

    let handled = false;
    act(() => {
      handled = result.current.handlePossibleConflict(
        axiosErrorLike(409, "VERSION_CONFLICT")
      );
    });

    expect(handled).toBe(true);
    expect(result.current.hasConflict).toBe(true);
  });

  it("leaves hasConflict false and returns false for a non-conflict error", () => {
    const { result } = renderHook(() => useConflictHandler());

    let handled = true;
    act(() => {
      handled = result.current.handlePossibleConflict(
        axiosErrorLike(422, "VALIDATION_ERROR")
      );
    });

    expect(handled).toBe(false);
    expect(result.current.hasConflict).toBe(false);
  });

  it("clearConflict resets hasConflict back to false", () => {
    const { result } = renderHook(() => useConflictHandler());

    act(() => {
      result.current.handlePossibleConflict(axiosErrorLike(409, "VERSION_CONFLICT"));
    });
    expect(result.current.hasConflict).toBe(true);

    act(() => {
      result.current.clearConflict();
    });
    expect(result.current.hasConflict).toBe(false);
  });
});
