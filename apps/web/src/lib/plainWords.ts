/**
 * Words that belong to engineers, never to a DJ's screen: setting names of the deployment, cloud services and the
 * plumbing behind a page. The vitest suite checks the Guide's copy with it and the e2e suite checks every page's text.
 */

/** an UPPER_SNAKE setting name ("TDJ_DB_TABLE", "NEXT_PUBLIC_APP_URL", "SPOTIFY_CLIENT_ID") */
const SETTING_NAME = /\b(?:TDJ_\w*|NEXT_PUBLIC_\w+|[A-Z][A-Z0-9]{2,}_[A-Z0-9_]*[A-Z0-9])\b/;

/** plumbing words, any case */
const PLUMBING =
  /\b(?:workspace|lambda|dynamo ?db|api routes?|server config(?:uration)?|env(?:ironment)? var(?:iable)?s?|process\.env|config store|backend|endpoint|ssm|oidc|iam|cloudfront|s3 bucket|stack trace|json|undefined|NaN)\b/i;

/** the first engineer word in `text`, or null when it reads like a DJ wrote it */
export function engineerWord(text: string): string | null {
  return text.match(SETTING_NAME)?.[0] ?? text.match(PLUMBING)?.[0] ?? null;
}

/** the patterns themselves, for the e2e check (it runs them in the page) */
export const ENGINEER_PATTERNS = { setting: SETTING_NAME.source, plumbing: PLUMBING.source } as const;
