# Placeholder ANTHROPIC_API_KEY on prod (Nov 26, 2026)

Placeholder ANTHROPIC_API_KEY on prod - delete ONLY after the release build is live and stable (it's what lets build-2026-11-24-001 start for rollback).

- Why: the secret was deleted 2026-11-26 19:38 UTC while the live website build `build-2026-11-24-001` (main 85a96c1) still referenced `ANTHROPIC_API_KEY` version 2, so every new Cloud Run instance aborted at startup (500 on every page).
- Fix (2026-11-27 03:33 UTC, R2): secret `ANTHROPIC_API_KEY` recreated in orbitworks-7ef59 with a placeholder value (not a real key), versions 1 and 2 enabled; `firebase-app-hosting-compute@orbitworks-7ef59.iam.gserviceaccount.com` has `roles/secretmanager.secretAccessor` on it. Site back at 03:34 UTC, no rebuild, no git change.
- Side effect while it exists: the old website's help chat answers "Sorry, I'm having trouble right now..." (the Anthropic call fails and is caught) and writes one `helpChatErrors` doc per question. Other pages are unaffected.
- Delete it only when: the release build (top branch, no ANTHROPIC_API_KEY in apphosting.yaml) serves 100% and is stable, and rollback to build-2026-11-24-001 is no longer needed. Then also remove the `helpChat*` collections (planned cleanup).
