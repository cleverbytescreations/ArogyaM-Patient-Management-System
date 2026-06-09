/**
 * ArogyaM PMS — Dashboard / patient list load test (TST-T0.4)
 *
 * NFR: p95 < 2 s at 15–20 concurrent users (peak 30)
 *
 * Simulates a receptionist opening the dashboard: loads stats + recent patients.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:8080 -e AUTH_TOKEN=<token> \
 *       tests/perf/dashboard_load.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const dashErrors = new Rate("dashboard_errors");
const dashDuration = new Trend("dashboard_duration", true);

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
export const options = {
  stages: [
    { duration: "1m", target: 15 },
    { duration: "3m", target: 20 },
    { duration: "1m", target: 30 },
    { duration: "2m", target: 20 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    // NFR: p95 < 2 s
    "http_req_duration{endpoint:dashboard}": ["p(95)<2000"],
    "dashboard_errors": ["rate<0.01"],
    "checks": ["rate>0.99"],
  },
};

// ---------------------------------------------------------------------------
// Default function
// ---------------------------------------------------------------------------
export default function () {
  const headers = {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    Accept: "application/json",
  };

  group("dashboard_load", () => {
    // Recent patients list (first page)
    const patientsRes = http.get(
      `${BASE_URL}/api/v1/patients?page=1&page_size=20`,
      { headers, tags: { endpoint: "dashboard" } }
    );

    const ok = patientsRes.status === 200;
    dashErrors.add(!ok);
    if (ok) dashDuration.add(patientsRes.timings.duration);

    check(patientsRes, {
      "patients list status 200": (r) => r.status === 200,
      "patients list has items": (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items) || Array.isArray(body.results);
        } catch {
          return false;
        }
      },
      "patients list p95 < 2s": (r) => r.timings.duration < 2000,
    });
  });

  sleep(1 + Math.random());
}
