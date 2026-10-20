import { describe, expect, it } from "vitest";
import { httpJson } from "./headerJson";

describe("httpJson (Dropbox-API-Arg)", () => {
  it("escapes every non-ASCII character as \\uXXXX and stays valid JSON", () => {
    const path = "/Señor · Año 1935 – ñ/set.m3u8";
    const s = httpJson({ path, mode: "add", autorename: true, mute: false });
    // ASCII only: the value can travel in an HTTP header
    for (const ch of s) expect(ch.charCodeAt(0)).toBeLessThan(0x7f);
    expect(s).toContain("Se\\u00f1or \\u00b7 A\\u00f1o 1935 \\u2013 \\u00f1");
    expect(JSON.parse(s)).toEqual({ path, mode: "add", autorename: true, mute: false });
  });
  it("leaves plain ASCII untouched and handles astral characters", () => {
    expect(httpJson({ path: "/set.csv" })).toBe('{"path":"/set.csv"}');
    const s = httpJson({ path: "/🎶/x" });
    expect(s).toBe('{"path":"/\\ud83c\\udfb6/x"}');
    expect(JSON.parse(s)).toEqual({ path: "/🎶/x" });
  });
});
