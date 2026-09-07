import { TERMS_VERSION } from "./TermsContent";

export default function BiometricPolicyContent() {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <p className="text-sm text-gray-500">
        Last updated: September 6, 2026 (version {TERMS_VERSION})
      </p>

      <p>
        This Biometric Data Policy describes how OrbitWorks handles
        biometric information when a Customer enables the optional
        face-verification clock-in feature. If Customer's account has not
        enabled face verification, OrbitWorks does not collect or process
        biometric information under this Policy.
      </p>

      <h2>1. What Is Collected</h2>
      <p>
        At enrollment, a facial image is captured and submitted directly
        to Amazon Rekognition over an encrypted connection. Rekognition
        analyzes the image and stores a facial representation within a
        Rekognition Collection scoped to Customer's account, referenced by
        an identifier ("FaceId"). OrbitWorks stores only the FaceId
        reference in its database; OrbitWorks does not have direct access
        to, and does not separately store, the underlying facial
        representation Rekognition creates. At clock-in, a new facial
        image is captured and compared against the Collection, returning a
        match or no-match result only.
      </p>

      <h2>2. Enrollment Photos</h2>
      <p>
        If Customer's enrollment flow retains a copy of the enrollment
        photo (for example, to support re-enrollment), that photo is
        stored in a restricted-access cloud storage bucket and
        automatically deleted no later than 30 days after enrollment is
        completed. Enrollment photos are never stored in the primary
        application database.
      </p>

      <h2>3. Consent</h2>
      <p>
        Customer must obtain each Employee's informed, written consent
        before enrollment, using the notices and disclosures required
        under applicable law. A timestamped record of that consent (who
        consented, when, and what they were told) is stored in OrbitWorks
        separately from the biometric data itself.
      </p>

      <h2>4. Retention and Deletion</h2>
      <p>
        A FaceId reference is retained for as long as the associated
        Employee record remains active with face verification enabled.
        When an Employee is deleted, marked inactive with a deletion
        request, or an Employee or admin invokes the delete-my-biometric-
        data action, OrbitWorks will call Rekognition's DeleteFaces
        operation to remove the stored facial representation and purge
        any retained enrollment photo, ordinarily within 30 days of the
        request.
      </p>

      <h2>5. Access, Logging, and Security</h2>
      <p>
        Only server-side application code, never the client or end users,
        can call Rekognition or read/write FaceId values; Firestore
        security rules block client read access to biometric fields
        entirely. Access to face-verification endpoints is logged
        (requesting user, timestamp, and Employee ID) to support audit and
        compliance review. Requests to these endpoints require
        authentication and a verified role.
      </p>

      <h2>6. No Independent Use</h2>
      <p>
        OrbitWorks does not use biometric data for any purpose other than
        the workforce clock-in verification Customer has enabled, and does
        not sell, license, or disclose biometric data to any third party
        except Amazon Web Services as the processor necessary to provide
        the feature.
      </p>

      <h2>7. Changes to This Policy</h2>
      <p>
        We may update this Policy from time to time; material changes
        will be reflected by an updated "Last updated" date.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about this Policy, or requests to delete biometric data,
        can be sent to the contact address provided on our website.
      </p>
    </div>
  );
}