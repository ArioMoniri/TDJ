/**
 * albumSpan reads an album title's years as an inclusive span. A range written with a two-digit end
 * ("1940-42 Instrumental", "1938/39", "1940–42") ends in that year of the same century, not in the start year.
 */
import { describe, expect, it } from "vitest";
import { albumSpan, judgeStreams } from "../src/index";

describe("albumSpan", () => {
  it("reads four-digit years and ranges", () => {
    expect(albumSpan("(1939-1940), Vol. 4")).toEqual([1939, 1940]);
    expect(albumSpan("Serie 78 RPM 1940-1947")).toEqual([1940, 1947]);
    expect(albumSpan("(1944), Vol. 12")).toEqual([1944, 1944]);
    expect(albumSpan("Grandes Éxitos")).toBeNull();
    expect(albumSpan(null)).toBeNull();
  });
  it("reads a two-digit range end (hyphen, slash, en dash) in the start year's century", () => {
    expect(albumSpan("1940-42 Instrumental")).toEqual([1940, 1942]);
    expect(albumSpan("Recordings 1938/39")).toEqual([1938, 1939]);
    expect(albumSpan("1940–42")).toEqual([1940, 1942]);
    expect(albumSpan("Recordings 1943-46, Vol. 2")).toEqual([1943, 1946]);
  });
  it("does not read a volume, a track number or a backwards end as a year", () => {
    expect(albumSpan("1940-42 Vol. 12")).toEqual([1940, 1942]);
    expect(albumSpan("1944-5 Vol. 3")).toEqual([1944, 1944]);
    expect(albumSpan("1944-12")).toEqual([1944, 1944]);
    expect(albumSpan("1940-42, Vol. 45")).toEqual([1940, 1942]);
    // a spaced "1944 - 20 Grandes Éxitos" is a count, not a year
    expect(albumSpan("Tango 1944 - 20 Grandes Éxitos")).toEqual([1944, 1944]);
  });
});

describe("judgeStreams on a two-digit album range", () => {
  it("a 1942 side on '1940-42 Instrumental' is not rejected as an earlier album", () => {
    const row = {
      title: "Independencia",
      orchestra: "Juan D'Arienzo",
      vocal: false,
      year: 1942,
      date: "1942-12-22",
      rhythm: "tango",
    };
    const sp = {
      uri: "spotify:track:2ZCkzZONq0jfUzhaBy7Vx4",
      durationMs: 154000,
      album: "1940-42 Instrumental",
      matched: "Juan D'Arienzo – Independencia",
    };
    expect(judgeStreams(row, sp, null).spotify).toBeNull();
    // a 1945 side on the same album is still another record
    expect(judgeStreams({ ...row, year: 1945, date: "1945-04-17" }, sp, null).spotify).toMatch(
      /earlier album/,
    );
  });
});
