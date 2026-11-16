"use client";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/**
 * Every exported file (M3U8, Rekordbox XML, Traktor NML, Serato / DJ CSV, XSPF, JSON, set list, the transfer CSV,
 * a night file, the history, the database) leaves through here.
 *
 * - The apps (Tauri): the native save panel on the Mac, the Files picker on iPhone / iPad (`save_file`,
 *   src-tauri/src/commands.rs). WebKit drops a blob download silently there, and a link that is never in the
 *   document is not seen by the bridge shim's click handler, so the page calls the command itself.
 * - Browsers: a download link, in the document while it is clicked (Firefox ignores a detached one; Safari on
 *   iOS saves it to Downloads / offers Files).
 */
export function downloadBlob(
  name: string,
  body: string,
  mime: string,
  invoke = tauriInvoke(),
): Promise<void> {
  if (invoke) {
    const bytes = Array.from(new TextEncoder().encode(body));
    return invoke("save_file", { name, bytes }).then(
      () => undefined,
      (e) => console.error("save failed", e),
    );
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: mime }));
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
  return Promise.resolve();
}

function tauriInvoke(): Invoke | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__?.invoke;
}
