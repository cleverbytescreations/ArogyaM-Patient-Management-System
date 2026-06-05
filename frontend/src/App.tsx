import { useEffect, useState } from "react";

// The SPA talks to the API through the dev proxy (same origin), so the base URL
// is a relative path by default. Overridable via VITE_API_BASE_URL.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

type ApiStatus = "checking" | "ok" | "unreachable";

export function App() {
  const [status, setStatus] = useState<ApiStatus>("checking");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((body) => {
        setStatus("ok");
        setDetail(JSON.stringify(body));
      })
      .catch((err: unknown) => {
        setStatus("unreachable");
        setDetail(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const color = status === "ok" ? "#1b7f3b" : status === "unreachable" ? "#b00020" : "#666";

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>ArogyaM Patient Management System</h1>
      <p>Phase 1 — development scaffold. The full UI is built out per the implementation plan.</p>
      <section style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}>
        <strong>Backend API:</strong>{" "}
        <span style={{ color }}>
          {status === "checking" ? "checking…" : status === "ok" ? "connected" : "unreachable"}
        </span>
        {detail && (
          <pre style={{ marginTop: "0.5rem", background: "#f6f6f6", padding: "0.5rem", borderRadius: 4, overflowX: "auto" }}>
            {detail}
          </pre>
        )}
      </section>
    </main>
  );
}
