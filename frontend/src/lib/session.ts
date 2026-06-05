import { useCallback, useEffect, useRef } from "react";
import { INACTIVITY_TIMEOUT_MS } from "./constants";

export function useSessionTimeout(onTimeout: () => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(
      () => onTimeoutRef.current(),
      INACTIVITY_TIMEOUT_MS
    );
  }, []);

  useEffect(() => {
    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetTimer]);
}
