// Input checks: each returns null when valid, else a sentence for the person.

/** @param {RegExp} re @param {string} msg */
const check = (re, msg) => (/** @type {string} */ v) => (re.test(v) ? null : msg);

export const region = check(
  /^[a-z]{2}(-gov)?-[a-z]+-\d$/,
  "An AWS region looks like us-east-1 or eu-central-1.",
);
export const roleArn = check(
  /^arn:aws(-[a-z]+)?:iam::\d{12}:role\/[\w+=,.@/-]{1,128}$/,
  "A role ARN looks like arn:aws:iam::123456789012:role/tdj-github-deploy (the stack's RoleArn output).",
);
export const repo = check(
  /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/,
  "Use owner/name, for example you/TDJ.",
);
export const stage = check(
  /^[a-z][a-z0-9-]{0,30}$/,
  "A stage is lowercase letters, digits and dashes (production, dev).",
);
export const spotifyClientId = check(/^[0-9a-f]{32}$/, "A Spotify Client ID is 32 hexadecimal characters.");
export const spotifySecret = check(/^[0-9a-f]{32}$/, "A Spotify Client secret is 32 hexadecimal characters.");
export const googleClientId = check(
  /^\d{6,}-[a-z0-9]{8,}\.apps\.googleusercontent\.com$/,
  "A Google client ID ends in .apps.googleusercontent.com (Credentials → your OAuth client).",
);
export const googleSecret = check(
  /^[A-Za-z0-9_-]{20,64}$/,
  "A Google client secret is 20–64 letters, digits, - or _ (it usually starts with GOCSPX-).",
);
export const dropboxAppKey = check(/^[a-z0-9]{15}$/, "A Dropbox App key is 15 lowercase letters and digits.");
export const dropboxSecret = check(
  /^[a-z0-9]{15}$/,
  "A Dropbox App secret is 15 lowercase letters and digits.",
);
export const youtubeKey = check(
  /^AIza[0-9A-Za-z_-]{35}$/,
  "A YouTube Data API key starts with AIza and is 39 characters long.",
);
export const pipedreamProject = check(
  /^proj_[A-Za-z0-9]{4,40}$/,
  "A Pipedream project ID starts with proj_.",
);
export const pipedreamClient = check(
  /^[A-Za-z0-9_-]{16,128}$/,
  "A Pipedream OAuth client ID or secret is 16–128 letters, digits, - or _.",
);
export const ascKeyId = check(
  /^[A-Z0-9]{10}$/,
  "The Key ID is 10 capital letters and digits (the row of the key).",
);
export const ascIssuer = check(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "The Issuer ID is a UUID shown above the keys table.",
);
export const teamId = check(/^[A-Z0-9]{10}$/, "A Team ID is 10 capital letters and digits.");
export const bundleId = check(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/, "A bundle ID looks like com.example.tdj.");
export const appleAppId = check(/^\d{6,12}$/, "The Apple ID of the app is the number on App Information.");
export const optional = (/** @type {(v: string) => string | null} */ f) => (/** @type {string} */ v) =>
  v === "" ? null : f(v);
