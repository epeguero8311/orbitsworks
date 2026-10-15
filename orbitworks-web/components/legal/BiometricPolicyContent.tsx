import { TERMS_VERSION } from "./TermsContent";

export default function BiometricPolicyContent() {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <p className="text-sm text-gray-500">
        Last updated: October 14, 2026 (version {TERMS_VERSION})
      </p>

      <p>
        This Biometric Data Policy describes how OrbitWorks handles the
        photos used by the face-verification feature on Pro plans. Face
        verification runs automatically for any Employee who has a
        profile photo on file; it never runs for an Employee with no
        profile photo, and it never runs on Core plans. If none of
        Customer's Employees have a profile photo, OrbitWorks does not
        process biometric information under this Policy for Customer's
        account.
      </p>

      <h2>1. What Is Collected and How It Is Processed</h2>
      <p>
        Two kinds of photos are involved:
      </p>
      <ul>
        <li>
          <strong>Reference photo</strong>: the Employee's profile photo,
          uploaded by Customer's admin, supervisor, or (where permitted)
          the Employee.
        </li>
        <li>
          <strong>Verification photo</strong>: the photo automatically
          captured by the Orbitsworks app each time the Employee clocks
          in or out with their PIN.
        </li>
      </ul>
      <p>
        Both photos are uploaded directly to Customer's private storage
        area within OrbitWorks' cloud storage provider (Google Cloud /
        Firebase Storage), accessible only to authenticated users of
        Customer's own account.
      </p>
      <p>
        At each clock-in and clock-out, the verification photo is sent
        server-side, over an encrypted connection, to Amazon Web Services
        Rekognition, where it is compared one-to-one against the
        Employee's reference photo using Rekognition's CompareFaces
        operation. OrbitWorks does not use, and does not permit
        Rekognition to use, Rekognition's face-collection, face-indexing,
        or face-search features. No reusable facial template, face
        embedding, or other biometric identifier distinct from the
        photos themselves is created or stored, at Rekognition or
        anywhere else. Rekognition does not retain a copy of either image
        after the comparison call completes; nothing is stored at AWS by
        this feature.
      </p>
      <p>
        The only thing OrbitWorks stores from the comparison is a short
        result summary on the clock event: a status (match, mismatch, or
        no face detected), a similarity score, the threshold used, and
        which reference photo was used. A separate, one-time check also
        runs against a new or changed reference photo (using
        Rekognition's DetectFaces operation) to confirm it contains
        exactly one usable face; this does not involve the Employee's
        clock photos and produces no stored result beyond a pass/fail
        flag on the Employee's record.
      </p>
      <p>
        A face-verification result never blocks, delays, or
        auto-corrects a clock event. A mismatch or no-face result only
        creates an alert for Customer's admins and supervisors to review
        and resolve; it is never used by OrbitWorks to take action on its
        own.
      </p>

      <h2>2. Retention of Photos</h2>
      <p>
        These schedules are automated; OrbitWorks does not wait for a
        manual request to apply them.
      </p>
      <ul>
        <li>
          <strong>Verification photos</strong> (clock-in/clock-out
          photos): deleted 90 days after capture. If a specific
          verification photo has an open mismatch or no-face alert, it is
          kept until that alert is resolved, and is then deleted 90 days
          after resolution instead.
        </li>
        <li>
          <strong>Active reference photo</strong>: deleted 1 year after
          the Employee is deactivated, or 3 years after the Employee's
          last clock event, whichever happens first. This only applies
          once an Employee is deactivated; an active Employee's reference
          photo is not time-limited. If the replaced-photo 30-day
          schedule below would delete it sooner, that schedule applies
          instead.
        </li>
        <li>
          <strong>Replaced reference photo</strong>: when Customer
          replaces an Employee's reference photo, the old photo is kept
          for up to 30 days (to support fraud review if the replacement
          itself looks suspicious) and is then automatically deleted.
        </li>
        <li>
          <strong>Employee record deleted</strong>: the Employee's
          reference photo is deleted immediately, at the same time as the
          Employee record.
        </li>
        <li>
          <strong>Customer's subscription is canceled</strong>: every
          biometric photo for Customer's account (every Employee's
          reference photo and every verification photo) is deleted 90
          days after cancellation. Clock events and Employee records
          themselves are never deleted by this; only the photos, and the
          photo fields that point to them, are removed.
        </li>
      </ul>
      <p>
        If an Employee is reactivated after their reference photo has
        already been deleted under the schedule above, they simply have
        no reference photo on file; face verification is skipped for them
        (the same treatment as an Employee who never had one) until a new
        reference photo is added.
      </p>
      <p>
        Customer or an Employee may also request earlier deletion at any
        time using the process described in Section 4 below.
      </p>

      <h2>3. Consent</h2>
      <p>
        Before adding a reference photo for any Employee (which turns on
        face verification for that Employee), Customer must give the
        Employee written notice of what is collected, why, and for how
        long it may be kept, and obtain the Employee's written consent or
        release where required by applicable law (for example, Illinois'
        BIPA, Texas' CUBI, or Washington's biometric privacy law).
        OrbitWorks provides a sample Employee Biometric and Location
        Notice and Consent template, in English and Spanish, to help
        Customer meet this obligation. OrbitWorks does not independently
        verify that Customer has given notice or obtained consent before
        a photo is uploaded.
      </p>

      <h2>4. Deletion Requests</h2>
      <p>
        An Employee who wants their reference or verification photos
        deleted should first contact their employer (Customer), who can
        remove the Employee's profile photo and request deletion of
        historical clock-event photos on the Employee's behalf. Customer
        or an Employee may also email our support address directly; we
        will act on verified deletion requests, consistent with the
        account-deletion process described on our Support page, ordinarily
        within 30 days, except where information must be retained for
        legal, billing, or dispute-resolution purposes.
      </p>

      <h2>5. Access and Security</h2>
      <p>
        Only server-side application code, never the client, the end
        user's browser or app, or any OrbitWorks employee's ad hoc
        access, calls Rekognition or writes the comparison result.
        Firestore security rules block any client from writing or
        overwriting a face-verification result or reference-photo flag;
        clients may only read a result for clock events within their own
        company. Storage access to the underlying photos is restricted to
        authenticated users of the Employee's own company.
      </p>

      <h2>6. No Independent Use</h2>
      <p>
        OrbitWorks does not use biometric data for any purpose other than
        the timekeeping and attendance verification Customer has enabled,
        and does not sell, lease, trade, or otherwise disclose biometric
        data to any third party, except to Amazon Web Services as the
        processor necessary to perform the comparison described above.
        We do not use biometric data for advertising, profiling, or to
        train artificial-intelligence or machine-learning models.
      </p>

      <h2>7. Changes to This Policy</h2>
      <p>
        We may update this Policy from time to time; material changes
        will be reflected by an updated "Last updated" date.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about this Policy, or requests to delete biometric
        data, can be sent to the contact address provided on our Support
        page.
      </p>
    </div>
  );
}
