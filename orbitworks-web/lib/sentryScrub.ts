// Crew code tokens (/j/{token}) are secrets: blank them in anything sent to
// Sentry (events, transactions, breadcrumbs). Used by the three Sentry
// configs. Safe in browser, server and edge code.

const JOIN_TOKEN_IN_PATH = /(\/j\/)[A-Za-z0-9_-]{16,}/g;

export function redactJoinTokens(text: string): string {
  return text.replace(JOIN_TOKEN_IN_PATH, "$1[redacted]");
}

export function scrubJoinTokens<T>(item: T): T {
  try {
    return JSON.parse(redactJoinTokens(JSON.stringify(item))) as T;
  } catch {
    return item;
  }
}

export const sentryJoinTokenScrubbers = {
  beforeSend: <E>(event: E): E => scrubJoinTokens(event),
  beforeSendTransaction: <E>(event: E): E => scrubJoinTokens(event),
  beforeBreadcrumb: <B>(breadcrumb: B): B => scrubJoinTokens(breadcrumb),
};
