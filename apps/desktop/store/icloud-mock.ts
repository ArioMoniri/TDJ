/**
 * The app's iCloud Documents folder (src-tauri/src/icloud.rs), mocked: what `icloud_status`, `icloud_list`,
 * `icloud_read`, `icloud_write` and `icloud_remove` answer, with the same checks as the Rust side (a space is 32
 * base64url characters, a record file `<22 base64url>.tdjsync`, its content a sealed record). One `ICloudDrive` shared
 * by two mocked apps is one iCloud account: what one writes, the other lists, as two Apple devices do.
 */
export interface ICloudDrive {
  /** `<space>/<name>` → { data, modified } */
  files: Map<string, { data: string; modified: number }>;
  /** false: iCloud Drive off on this device (`icloud_status` → off) */
  signedIn: boolean;
  /** the clock files are stamped with (ms; each write moves it on) */
  clock: number;
}

export const newDrive = (): ICloudDrive => ({
  files: new Map(),
  signedIn: true,
  clock: Date.parse("2026-11-20T20:00:00Z"),
});

const B64 = /^[A-Za-z0-9_-]+$/;
const validSpace = (s: unknown): s is string => typeof s === "string" && s.length === 32 && B64.test(s);
const validName = (n: unknown): n is string =>
  typeof n === "string" && /^[A-Za-z0-9_-]{22}\.tdjsync$/.test(n);
const MAX_BLOB = 350_000;

type Fail = { error: { message: string; status: number } };
const fail = (message: string): Fail => ({ error: { message, status: 400 } });

/** Answers one `icloud_*` command, or undefined when `cmd` is not one. `available`: an Apple build with iCloud. */
export function icloudCommand(
  drive: ICloudDrive,
  cmd: string,
  args: Record<string, unknown>,
  available = true,
): unknown {
  if (!cmd.startsWith("icloud_")) return undefined;
  if (cmd === "icloud_status")
    return !available
      ? { available: false, reason: "unsupported" }
      : drive.signedIn
        ? { available: true }
        : { available: false, reason: "off" };
  if (!available) return fail("unsupported");
  if (!drive.signedIn) return fail("off");
  const space = args.space;
  if (!validSpace(space)) return fail("bad space");
  switch (cmd) {
    case "icloud_list":
      return [...drive.files]
        .filter(([k]) => k.startsWith(`${space}/`))
        .map(([k, f]) => ({ name: k.slice(space.length + 1), modified: f.modified, size: f.data.length }))
        .sort((a, b) => (a.name < b.name ? -1 : 1));
    case "icloud_read": {
      if (!validName(args.name)) return fail("bad name");
      return drive.files.get(`${space}/${args.name}`)?.data ?? null;
    }
    case "icloud_write": {
      const data = args.data;
      if (!validName(args.name)) return fail("bad name");
      if (typeof data !== "string" || !data || data.length > MAX_BLOB || !B64.test(data))
        return fail("not a sealed record");
      drive.clock += 1000;
      drive.files.set(`${space}/${args.name}`, { data, modified: drive.clock });
      return null;
    }
    case "icloud_remove":
      for (const k of [...drive.files.keys()]) if (k.startsWith(`${space}/`)) drive.files.delete(k);
      return null;
    default:
      return fail("unknown command");
  }
}
