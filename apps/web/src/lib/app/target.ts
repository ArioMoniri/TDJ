/**
 * Build target. `TDJ_TARGET=app` (apps/desktop/scripts/build-ui.mjs) builds the static UI that ships inside the
 * macOS and iPadOS apps: every /api/* call is answered on the device (lib/app/adapter.ts). Unset: the web
 * deployment, unchanged.
 */
export const APP = process.env.NEXT_PUBLIC_TDJ_TARGET === "app";

/**
 * What `settings.ai.key` holds in the apps once the DJ saved a key: the key itself lives in the Keychain and only the
 * native side reads it (lib/app/native.ts). Sent as `x-ai-key` it means "use the Keychain's key".
 */
export const KEYCHAIN_KEY = "keychain:";
