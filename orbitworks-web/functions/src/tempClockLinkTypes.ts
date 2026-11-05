// ---- Temp clock-in links: what the list calls return (Phase 10 W1) ----
//
// The web hook (lib/hooks/useTempClockLinkPage.ts) mirrors these shapes by
// hand (no import across the functions/web boundary) - keep both in sync.

// History comes 10 at a time, newest first. "Load older" sends the token of
// the last link it has; the next page starts right after that link.
export const TEMP_LINK_HISTORY_PAGE_SIZE = 10;

export interface TempLinkHistoryEntry {
  token: string;
  siteName: string;
  createdByName: string;
  createdAt: number;
  expiresAt: number;
  durationMinutes: number;
  revoked: boolean;
}

export interface TempLinkHistoryPage {
  links: TempLinkHistoryEntry[];
  // The token to send as afterToken for the next page, or null = no more.
  nextAfterToken: string | null;
}

export interface ActiveTempLinkEntry {
  token: string;
  siteId: string | null;
  siteName: string;
  createdByName: string;
  expiresAt: number;
  durationMinutes: number;
}
