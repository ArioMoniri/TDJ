import { describe, expect, it } from "vitest";
import { encodeWav } from "./audition";

describe("the audition's WAV", () => {
  it("is a 16-bit PCM RIFF with the buffer's rate, channels and samples", async () => {
    const ch = [new Float32Array([0, 0.5, -1, 2]), new Float32Array([0, -0.5, 1, -2])];
    const blob = encodeWav({
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 4,
      getChannelData: (c) => ch[c]!,
    });
    expect(blob.type).toBe("audio/wav");
    const v = new DataView(await blob.arrayBuffer());
    const s = (o: number, n: number) => String.fromCharCode(...new Uint8Array(v.buffer, o, n));
    expect(s(0, 4)).toBe("RIFF");
    expect(s(8, 4)).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(40, true)).toBe(4 * 2 * 2);
    // interleaved, clipped to ±1
    expect(v.getInt16(44 + 2 * 2, true)).toBe(Math.round(0.5 * 0x7fff - 0.5) + 0);
    expect(v.getInt16(44 + 6 * 2, true)).toBe(0x7fff);
    expect(v.getInt16(44 + 7 * 2, true)).toBe(-0x8000);
  });
});
