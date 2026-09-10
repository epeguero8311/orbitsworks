---
title: "Biometric Data Policy (Face Verification)"
category: security
keywords: [biometric policy, face verification, facial recognition privacy, rekognition,
 face data, how is my face data stored, delete biometric data, consent for face verification,
 faceid, biometric data policy page, is face data stored]
---

## What
OrbitWorks publishes a Biometric Data Policy page explaining how facial data is handled when a company enables the optional face-verification clock-in feature.

## Why
Biometric data carries legal weight (e.g. BIPA in Illinois and similar laws elsewhere), so the policy spells out exactly what's captured, how it's stored, and how it can be deleted - separate from the general Privacy Policy and Terms.

## Where
Public page at `/biometric-policy` (linked from the site footer / legal pages, not inside the dashboard). Only applies if a company has face verification enabled - it collects nothing under this policy otherwise.

## How
This is a reference document, not a setting - there's nothing to configure here. Key points:
- At enrollment, a photo is sent directly to Amazon Rekognition; only a FaceId reference is stored in OrbitWorks' database, never the underlying facial data itself.
- If an enrollment photo is temporarily kept (for re-enrollment), it's auto-deleted within 30 days and never lands in the primary app database.
- Written, informed consent is required before enrollment, and a timestamped consent record is stored separately from the biometric data.
- A FaceId is deleted (via Rekognition's DeleteFaces) when an employee is deleted, marked inactive with a deletion request, or a delete-my-biometric-data request is made - ordinarily within 30 days.
- Only server-side code can read/write FaceId values; access to face-verification endpoints is authenticated, role-checked, and logged.

## What you'll see
For a deletion request or policy questions, the page points to the contact address on the main website rather than a form on this page itself.
