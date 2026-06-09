/**
 * ArogyaM PMS — Patient search load test (TST-T0.4)
 *
 * NFR: p95 < 1 s at 15–20 concurrent users (peak 30)
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:8080 -e AUTH_TOKEN=<token> \
 *       tests/perf/search_load.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

// Representative search terms — mix of name fragments, mobile prefixes, OP numbers.
const SEARCH_TERMS = [
  "Raj",
  "Kumar",
  "Devi",
  "Lakshmi",
  "Singh",
  "9876",
  "OP/GEN/2024",
  "Priya",
  "Venkat",
  "Sharma",
  "Bala",
  "Suresh",
  "Ramesh",
  "Nair",
  "Pillai",
];

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const searchErrors = new Rate("search_errors");
const searchDuration = new Trend("search_duration", true);

// ---------------------------------------------------------------------------
// Thresholds (NFR gates — exit non-zero if breached)
// ---------------------------------------------------------------------------
export const options = {
  stages: [
    { duration: "1m", target: 15 },   // ramp up to 15 VUs
    { duration: "3m", target: 20 },   // steady load 20 VUs
    { duration: "1m", target: 30 },   // spike to 30 VUs
    { duration: "2m", target: 20 },   // return to 20
    { duration: "1m", target: 0 },    // ramp down
  ],
  thresholds: {
    // NFR: p95 < 1 s
    "http_req_duration{endpoint:search}": ["p(95)<1000"],
    // Allow at most 1 % errors
    "search_errors": ["rate<0.01"],
    // Check pass rate > 99 %
    "checks": ["rate>0.99"],
  },
};

// ---------------------------------------------------------------------------
// Default function (executed per VU per iteration)
// ---------------------------------------------------------------------------
export default function () {
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const url = `${BASE_URL}/api/v1/patients/search?q=${encodeURIComponent(term)}&page=1&page_size=20`;

  const params = {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      Accept: "application/json",
    },
    tags: { endpoint: "search" },
  };

  const res = http.get(url, params);
  const ok = res.status === 200;

  searchErrors.add(!ok);
  if (ok) {
    searchDuration.add(res.timings.duration);
  }

  check(res, {
    "search status 200": (r) => r.status === 200,
    "search has results key": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.items !== undefined || body.results !== undefined;
      } catch {
        return false;
      }
    },
    "search p95 < 1s": (r) => r.timings.duration < 1000,
  });

  // Simulate realistic inter-request think time (0.5–1.5 s)
  sleep(0.5 + Math.random());
}
