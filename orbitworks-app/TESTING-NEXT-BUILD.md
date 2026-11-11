# Testing at the next build

Dev app, dev db (`orbitworks-dev-ew`), test company `jc-test-pro-dev`.

## Employee PIN check (employee-app e5fc76d)

What changed: on the employee clock screen, a saved PIN check value that
matches is instant. Otherwise the phone waits on the network for 3 seconds
at most. A slow or failed server never makes a correct PIN show as wrong.
If the PIN can't be checked in time, the camera opens and the server checks
the PIN when the punch syncs. Code: `lib/pinVerifier.js` (`runPinCheck`),
`lib/pinCheck.js`.

### 1. Correct PIN, good connection

- [ ] Clock in, type the correct PIN: the camera opens right after the 4th
      digit, no wait.
- [ ] The green confirmation does not say "Will sync when online".

### 2. Correct PIN when the saved copy is stale

Setup: put the phone in airplane mode, change this employee's PIN on the
dev website, then turn airplane mode off. Before the app has had a chance
to refresh, type the **new** PIN.

- [ ] Decent connection: the camera opens within a second or two and the
      punch saves normally. No "Wrong PIN".
- [ ] Very weak signal (or iPhone Settings > Developer > Network Link
      Conditioner on "100% Loss"): the keypad never freezes for more than
      about 3 seconds. The camera opens and the confirmation says "Will
      sync when online". No "Wrong PIN".
- [ ] With the signal back, that punch syncs and shows in Time Tracking.

### 3. Wrong PIN and the lock (good connection)

- [ ] 1st wrong PIN: "Wrong PIN. 2 tries left before a 1-minute lock."
- [ ] 2nd wrong PIN: "Wrong PIN. 1 try left before a 1-minute lock."
- [ ] 3rd wrong PIN: "Too many wrong PINs. Try again in 60 seconds."
- [ ] During the lock, even the correct PIN is refused.
- [ ] After the minute, the correct PIN works and the strike count starts
      fresh.

### 4. Airplane mode

- [ ] Correct PIN: the camera opens instantly. The confirmation says "Will
      sync when online".
- [ ] Turn airplane mode off: that punch syncs and shows in Time Tracking.
- [ ] Wrong PIN: "Wrong PIN" shows instantly and counts toward the lock.
- [ ] Expected, not a bug: if the PIN was changed on the website while the
      phone was offline, the new PIN shows as wrong until the phone is back
      online (decided 2026-11-02, unchanged).

## App sign-up Back / Cancel buttons (employee-app bf6e148)

Open a crew code (scan its QR in the app, or open its /j/ link) and start
creating an account. Both buttons are the app's blue button style, in the
top bar beside "Step X of 2".

- [ ] Step 1 ("Create your account") shows Cancel only, no Back. Cancel
      goes straight to the Login screen, no confirm.
- [ ] Step 2 ("A few more details"): Back returns to Step 1 and everything
      typed on Step 1 is still filled in.
- [ ] Step 2: Cancel shows "Leave sign-up? What you entered will be lost."
      Stay keeps you on Step 2 with everything still filled in. Leave goes
      to the Login screen.
- [ ] While the account is being created (after tapping Create account),
      Back and Cancel are both greyed out and do nothing.
- [ ] Unchanged: the selfie camera's Cancel and the QR scanner's Cancel
      look and work as before.
