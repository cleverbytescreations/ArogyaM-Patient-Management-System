import "@testing-library/jest-dom";
import { expect, beforeAll, afterEach, afterAll } from "vitest";
import { toHaveNoViolations } from "jest-axe";
import { server } from "./mocks/server";

expect.extend(toHaveNoViolations);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Radix UI / jsdom polyfills
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Pointer events polyfill for Radix UI interactive components
Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
  value: () => false,
  writable: true,
});
Object.defineProperty(window.HTMLElement.prototype, "setPointerCapture", {
  value: () => {},
  writable: true,
});
Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
  value: () => {},
  writable: true,
});
