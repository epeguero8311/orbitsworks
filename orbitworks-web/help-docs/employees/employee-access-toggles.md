---
title: "Granting or Removing Supervisor and Admin Access for an Employee"
category: employees
keywords: [grant supervisor access, remove supervisor access, grant admin access, remove admin access,
 pin only supervisor, supervisor without login, make employee supervisor, make employee admin,
 promote employee, demote employee, revoke access, turn off admin, turn off supervisor,
 supervisor access toggle, admin access toggle]
---

## What
An employee's edit modal has toggles to grant or remove Supervisor access and Admin access, without creating a separate record for them.

## Why
The same person is often both a regular clocked-in worker and someone who needs override or dashboard authority - this keeps them as one employee record instead of a duplicate.

## Where
Sidebar > Employees > click the employee's row > the access toggle(s) below the phone number field.

## How
What you see depends on whether the employee already has a login (linked to a supervisor or admin invite they've accepted):

**Not yet linked (no login):**
1. Toggle "Supervisor access" on.
2. Leave the email field blank to grant it immediately with just their PIN - no login, no invite. They can override clock-ins and start/end breaks on mobile using their PIN.
3. Or enter an email to send a real invite instead - accepting it creates their login, and their existing PIN, clock history, and site assignments carry over.
4. Save.

**Already linked (has a login):**
1. Toggle "Supervisor access" and "Admin access" independently - on, off, or both, in any combination.
2. The employee's login email is shown underneath for reference.
3. Save.

## What you'll see
- Supervisor access controls mobile override/break authority; Admin access controls web dashboard access. A linked employee can have either, both, or neither - turning both off leaves them with a login but no special access, without deleting their account.
- Granting Supervisor access with an email while unlinked follows the same duplicate-invite check as the Supervisors invite section - a pending invite for that email elsewhere blocks it.
- PIN-only supervisor access never shows up under Admins or Supervisors invites, since no invite was ever sent - it only shows as a toggle on the employee's own record.
