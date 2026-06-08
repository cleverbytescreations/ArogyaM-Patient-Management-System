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

// scrollIntoView polyfill for Radix UI Select (not implemented in jsdom)
window.HTMLElement.prototype.scrollIntoView = function () {};

// ProseMirror/TipTap (RichTextEditor) layout APIs not implemented in jsdom
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}
const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON() {} } as DOMRect;
const emptyRectList = [] as unknown as DOMRectList;
window.HTMLElement.prototype.getClientRects = function () {
  return emptyRectList;
};
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return emptyRect;
};
window.Range.prototype.getClientRects = function () {
  return emptyRectList;
};
window.Range.prototype.getBoundingClientRect = function () {
  return emptyRect;
};

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
