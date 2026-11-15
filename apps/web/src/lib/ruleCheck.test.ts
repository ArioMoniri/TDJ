import { approveEdit, checkEdit, type Playlist, recordExceptions, templateIdOf } from "@tdj/core";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
import { approvedKeys, factText, nightExceptionsOf, ruleText, violationTitle } from "./ruleCheck";

const side = (id: string, singer: string | null, year = 1941) => ({
  id,
  title: `Song ${id}`,
  orchestra: "Ángel D'Agostino",
  orchestraId: "angel-d-agostino",
  singer,
  singerId: singer ? "angel-vargas" : null,
  vocal: !!singer,
  rhythm: "tango",
  year,
  era: "golden",
});
const night = (songs: ReturnType<typeof side>[]) =>
  ({
    id: "night-7",
    options: { hours: 4, eras: ["golden"], cortinaStyle: "none" },
    tandas: [
      { index: 1, rhythm: "tango", orchestraId: "angel-d-agostino", orchestra: "Ángel D'Agostino", songs },
    ],
  }) as unknown as Playlist;

afterEach(() => setLocale("en"));

describe("the rule check's words", () => {
  const before = night([side("a", "Angel Vargas"), side("b", "Angel Vargas"), side("c", "Angel Vargas")]);
  const after = night([side("a", "Angel Vargas"), side("x", null), side("c", "Angel Vargas")]);
  it("a violation reads in the DJ's language, the core's plain words translated, names as recorded", () => {
    const v = checkEdit(before, after, { scope: "tandas" }).violations[0]!;
    expect(v.rule).toBe("voice");
    expect(violationTitle(v)).toBe("Tanda 1 mixes instrumental and sung sides");
    expect(factText(v.facts[0]!)).toBe("Song x is instrumental; the rest of this tanda is Angel Vargas");
    setLocale("tr");
    expect(violationTitle(v)).toBe("1. tanda enstrümantal ve vokal parçaları karıştırıyor");
    expect(factText(v.facts[0]!)).toContain("Angel Vargas");
    expect(
      ruleText(
        {
          key: "ruleCheck.fact.vocal_style",
          params: { title: "T", style: "singer-led", rest: "rhythm-led" },
        },
        "",
      ),
    ).toBe("T şarkıcı önde; tandanın geri kalanı ritim önde");
    // an unknown key falls back to the core's English
    expect(ruleText({ key: "ruleCheck.nope", params: {} }, "plain English")).toBe("plain English");
  });
  it("the strict panel's approvals: the featured night's and the DJ's own, this night's only", () => {
    const v = checkEdit(before, after, { scope: "tandas" }).violations;
    const { playlist, exceptions } = approveEdit(after, v, "as said");
    const mine = recordExceptions(undefined, exceptions);
    const keys = approvedKeys(null, mine, "night-7");
    expect(keys.has(templateIdOf(playlist.tandas[0]!))).toBe(true);
    expect(approvedKeys(null, mine, "another").size).toBe(0);
    expect(nightExceptionsOf(mine, "night-7")).toHaveLength(1);
    expect(nightExceptionsOf(mine, undefined)).toHaveLength(0);
  });
});
