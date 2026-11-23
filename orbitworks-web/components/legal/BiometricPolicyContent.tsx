import { TERMS_VERSION } from "./TermsContent";

export default function BiometricPolicyContent() {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <p className="text-sm text-gray-500">
        Last updated: November 17, 2026 (version {TERMS_VERSION})
      </p>

      <p>
        This Biometric Data Policy describes how OrbitsWorks handles the
        photos used by the face-verification feature on Pro plans. Face
        verification runs automatically for any Employee who has a
        profile photo on file; it never runs for an Employee with no
        profile photo, and it never runs on Core plans. If none of
        Customer&apos;s Employees have a profile photo, OrbitsWorks does not
        process biometric information under this Policy for Customer&apos;s
        account.
      </p>

      <h2>1. What Is Collected and How It Is Processed</h2>
      <p>
        Two kinds of photos are involved:
      </p>
      <ul>
        <li>
          <strong>Reference photo</strong>: the Employee&apos;s profile photo,
          uploaded by Customer&apos;s admin, supervisor, or (where permitted)
          the Employee. An Employee who signs up in the OrbitsWorks app
          takes a sign-up selfie, which becomes their reference photo; a
          copy of that selfie is kept with it and follows the same
          schedules below.
        </li>
        <li>
          <strong>Verification photo</strong>: the photo automatically
          captured by the OrbitsWorks app each time the Employee clocks
          in or out with their PIN.
        </li>
      </ul>
      <p>
        Both photos are uploaded directly to Customer&apos;s storage area
        within OrbitsWorks&apos; cloud storage provider (Google Cloud /
        Firebase Storage). In OrbitsWorks they are shown only to signed-in
        users of Customer&apos;s own account. Each photo is served through a
        private link: a long, unguessable web address. Anyone who is
        given that link can open the photo, so photo links and exported
        reports should not be shared outside Customer&apos;s organization.
      </p>
      <p>
        At each clock-in and clock-out, the verification photo is sent
        server-side, over an encrypted connection, to Amazon Web Services
        Rekognition, where it is compared one-to-one against the
        Employee&apos;s reference photo using Rekognition&apos;s CompareFaces
        operation. OrbitsWorks does not use, and does not permit
        Rekognition to use, Rekognition&apos;s face-collection, face-indexing,
        or face-search features. OrbitsWorks does not create or store any
        reusable facial template, face embedding, or other biometric
        identifier distinct from the photos themselves.
      </p>
      <p>
        The only thing OrbitsWorks stores from the comparison is a short
        result summary on the clock event: a status (match, mismatch, or
        no face detected), a similarity score, the threshold used, and
        which reference photo was used. A separate, one-time check also
        runs against a new or changed reference photo (using
        Rekognition&apos;s DetectFaces operation) to confirm it contains
        exactly one usable face; this does not involve the Employee&apos;s
        clock photos and produces no stored result beyond a pass/fail
        flag on the Employee&apos;s record.
      </p>
      <p>
        A face-verification result never blocks, delays, or
        auto-corrects a clock event. A mismatch or no-face result only
        creates an alert for Customer&apos;s admins and supervisors to review
        and resolve; it is never used by OrbitsWorks to take action on its
        own.
      </p>

      <h2>2. Retention of Photos</h2>
      <p>
        These schedules are automated; OrbitsWorks does not wait for a
        manual request to apply them.
      </p>
      <ul>
        <li>
          <strong>Verification photos</strong> (clock-in/clock-out
          photos, taken on every plan whether or not face verification is
          on): deleted 90 days after capture. If a specific
          verification photo has an open mismatch or no-face alert, it is
          kept until that alert is resolved, and is then deleted 90 days
          after resolution instead.
        </li>
        <li>
          <strong>Active reference photo</strong> (together with any
          sign-up selfie): deleted 1 year after
          the Employee is deactivated, or 3 years after the Employee&apos;s
          last clock event, whichever happens first. This only applies
          once an Employee is deactivated; an active Employee&apos;s reference
          photo is not time-limited. If the replaced-photo 30-day
          schedule below would delete it sooner, that schedule applies
          instead.
        </li>
        <li>
          <strong>Replaced reference photo</strong>: when Customer
          replaces an Employee&apos;s reference photo, the old photo is kept
          for up to 30 days (to support fraud review if the replacement
          itself looks suspicious) and is then automatically deleted.
        </li>
        <li>
          <strong>Employee record deleted</strong>: the Employee&apos;s
          reference photo and every copy of it, including a sign-up
          selfie, are deleted immediately. Clock events and their
          face-verification results are kept as Customer&apos;s records;
          their verification photos follow the 90-day schedule above.
        </li>
        <li>
          <strong>Profile photo removed</strong>: when Customer uses Remove
          photo, the reference photo and every copy of it are deleted
          immediately, and face verification stops for that Employee until
          a new photo is added.
        </li>
        <li>
          <strong>Employee App account deleted</strong>: when an Employee
          deletes their account in the OrbitsWorks app, their reference
          photo and sign-up selfie are deleted immediately. Their clock
          events stay as Customer&apos;s records.
        </li>
        <li>
          <strong>Customer&apos;s subscription is canceled</strong>: every
          biometric photo for Customer&apos;s account (every Employee&apos;s
          reference photo, any sign-up selfie, and every verification
          photo) is deleted 90
          days after cancellation. Clock events and Employee records
          themselves are never deleted by this; only the photos, and the
          photo fields that point to them, are removed.
        </li>
      </ul>
      <p>
        Face-verification results (status and similarity score) stay with
        the clock event as part of Customer&apos;s attendance records. Deleted
        files can be recovered by our storage provider for up to 7 days
        before they are permanently removed.
      </p>
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
        long it may be kept, and obtain the Employee&apos;s written consent or
        release where required by applicable law (for example, Illinois&apos;
        BIPA, Texas&apos; CUBI, or Washington&apos;s biometric privacy law).
        OrbitsWorks provides a sample Employee Biometric and Location
        Notice and Consent template, in English and Spanish, to help
        Customer meet this obligation. OrbitsWorks does not independently
        verify that Customer has given notice or obtained consent before
        a photo is uploaded.
      </p>

      <h2>4. Deletion Requests</h2>
      <p>
        An Employee who wants their reference or verification photos
        deleted should first contact their employer (Customer), who can
        remove the Employee&apos;s profile photo with Remove photo and request
        deletion of historical clock-event photos on the Employee&apos;s
        behalf. Employees who use the OrbitsWorks app can also delete
        their account in the app&apos;s Settings, which deletes their
        reference photo and sign-up selfie right away. Customer
        or an Employee may also email our support address directly; we
        will act on verified deletion requests, consistent with the
        account-deletion process described on our Support page, ordinarily
        within 30 days, except where information must be retained for
        legal, billing, or dispute-resolution purposes.
      </p>

      <h2>5. Access and Security</h2>
      <p>
        Only server-side application code, never the client, the end
        user&apos;s browser or app, or any OrbitsWorks employee&apos;s ad hoc
        access, calls Rekognition or writes the comparison result.
        Firestore security rules block any client from writing or
        overwriting a face-verification result or reference-photo flag;
        clients may only read a result for clock events within their own
        company. The underlying photos are reached only through private
        links, as described in Section 1.
      </p>

      <h2>6. No Independent Use</h2>
      <p>
        OrbitsWorks does not use biometric data for any purpose other than
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
        will be reflected by an updated &quot;Last updated&quot; date.
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
