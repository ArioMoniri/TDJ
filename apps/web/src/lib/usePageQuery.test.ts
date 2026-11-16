import { describe, expect, it } from "vitest";
import { localSearch, localSearchState, warmLocalSearch } from "./localSearch";
import { initialQuery, queryFromSearch, URL_WRITE_MS, urlWithParam } from "./usePageQuery";
import { SERVICE_DEBOUNCE_MS, SERVICE_MIN_CHARS } from "./useSmartSearch";

/**
 * 2026-11 (the owner: "while the tab changes from Songs to Orchestras or others in Database or Library, the written
 * text should not be deleted; also the search is so slow"): one search text per page, in the address.
 */
describe("the page's one search text", () => {
  it("reads `?q=` from the address (absent: none; empty: empty)", () => {
    expect(queryFromSearch("?q=di%20sarli%201941")).toBe("di sarli 1941");
    expect(queryFromSearch("?tab=orchestras&q=pugliese")).toBe("pugliese");
    expect(queryFromSearch("?tab=orchestras")).toBeNull();
    expect(queryFromSearch("?q=")).toBe("");
    expect(queryFromSearch(`?q=${"x".repeat(1000)}`)?.length).toBe(400);
  });

  it("the address wins over the session's last; nothing gives empty", () => {
    expect(initialQuery("?q=troilo", "pugliese")).toBe("troilo");
    expect(initialQuery("", "pugliese")).toBe("pugliese");
    expect(initialQuery("?tab=cortinas", null)).toBe("");
    // a cleared field in the address (`?q=`) is a choice: the session's older words do not come back
    expect(initialQuery("?q=", "pugliese")).toBe("");
  });

  it("writing it keeps the tab, the other parameters and the hash; clearing drops it", () => {
    expect(urlWithParam("https://t.dj/database?tab=orchestras#top", "q", "d'arienzo 1938")).toBe(
      "/database?tab=orchestras&q=d%27arienzo+1938#top",
    );
    expect(urlWithParam("https://t.dj/database?tab=orchestras&q=pugliese", "q", "")).toBe(
      "/database?tab=orchestras",
    );
    expect(urlWithParam("https://t.dj/library?q=a", "q", null)).toBe("/library");
    // and the round trip
    const u = urlWithParam("https://t.dj/library", "q", "ahora no me conocés & más");
    expect(queryFromSearch(u.slice(u.indexOf("?")))).toBe("ahora no me conocés & más");
  });

  it("the address is written once the words rest, not per keystroke", () => {
    expect(URL_WRITE_MS).toBeGreaterThanOrEqual(200);
  });
});

describe("the search's speed rules", () => {
  it("the connected services wait 350 ms and 3 letters (the catalogue's results never wait for them)", () => {
    expect(SERVICE_DEBOUNCE_MS).toBe(350);
    expect(SERVICE_MIN_CHARS).toBe(3);
  });

  it("without a worker (tests, the apps) the browser search is off and the hooks ask the server", async () => {
    warmLocalSearch();
    expect(localSearchState()).toBe("off");
    await expect(localSearch("pugliese", {})).rejects.toThrow(/not ready/);
  });
});
