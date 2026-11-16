/**
 * QA fix 2026-11: the Back button of the Song DNA pages — song A → orchestra → song B → Back → orchestra → Back →
 * song A → Back → the page the DJ started on, each Back named after where it goes.
 */
import { describe, expect, it } from "vitest";
import { backStep, type TrailStep, visit } from "./navTrail";

describe("the DNA pages' trail", () => {
  it("walks forward and unwinds to where the DJ started", () => {
    let t: TrailStep[] = [];
    t = visit(t, "/", "Compose");
    t = visit(t, "/song?id=a", "");
    t = visit(t, "/song?id=a", "Ansiedad"); // the page names itself once its data is in
    t = visit(t, "/orchestra?id=x", "Juan D'Arienzo");
    t = visit(t, "/song?id=b", "La Puñalada");
    expect(backStep(t, "/song?id=b")).toEqual({ href: "/orchestra?id=x", label: "Juan D'Arienzo" });
    t = visit(t, "/orchestra?id=x", "Juan D'Arienzo"); // Back
    expect(backStep(t, "/orchestra?id=x")).toEqual({ href: "/song?id=a", label: "Ansiedad" });
    t = visit(t, "/song?id=a", "Ansiedad"); // Back
    expect(backStep(t, "/song?id=a")).toEqual({ href: "/", label: "Compose" });
    t = visit(t, "/", "Compose"); // Back
    expect(t).toEqual([{ href: "/", label: "Compose" }]);
  });
  it("a DNA page opened directly has nowhere to go back to (the button goes to the Library)", () => {
    expect(backStep(visit([], "/song?id=a", "Ansiedad"), "/song?id=a")).toBeNull();
  });
});
