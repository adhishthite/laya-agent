import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, resolveTheme } from "./theme";

interface FakeEnv {
  store: Map<string, string>;
  classes: Set<string>;
  attributes: Map<string, string>;
}

/**
 * The theme module reads three browser globals. Stubbing them directly keeps
 * the test hermetic and avoids pulling a full DOM implementation into the
 * dependency tree for fifty lines of logic.
 */
function stubBrowser({ stored, prefersDark }: { stored?: string; prefersDark: boolean }): FakeEnv {
  const env: FakeEnv = {
    store: new Map(stored === undefined ? [] : [["bench-theme", stored]]),
    classes: new Set<string>(),
    attributes: new Map<string, string>(),
  };

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => env.store.get(key) ?? null,
    setItem: (key: string, value: string) => env.store.set(key, value),
  });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: prefersDark }) });
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        toggle: (name: string, on: boolean) =>
          on ? env.classes.add(name) : env.classes.delete(name),
      },
    },
    querySelector: () => ({
      setAttribute: (name: string, value: string) => env.attributes.set(name, value),
    }),
  });

  return env;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveTheme", () => {
  it("prefers a stored choice over the system setting", () => {
    stubBrowser({ stored: "light", prefersDark: true });
    expect(resolveTheme()).toBe("light");
  });

  it("falls back to the system setting when nothing is stored", () => {
    stubBrowser({ prefersDark: true });
    expect(resolveTheme()).toBe("dark");
  });

  it("ignores a stored value that is not a theme", () => {
    stubBrowser({ stored: "sepia", prefersDark: false });
    expect(resolveTheme()).toBe("light");
  });
});

describe("applyTheme", () => {
  it("adds the dark class and darkens the browser chrome", () => {
    const env = stubBrowser({ prefersDark: false });
    applyTheme("dark");
    expect(env.classes.has("dark")).toBe(true);
    expect(env.attributes.get("content")).toBe("#0d1116");
  });

  it("removes the dark class and lightens the browser chrome", () => {
    const env = stubBrowser({ prefersDark: true });
    applyTheme("dark");
    applyTheme("light");
    expect(env.classes.has("dark")).toBe(false);
    expect(env.attributes.get("content")).toBe("#f5f7f9");
  });
});
