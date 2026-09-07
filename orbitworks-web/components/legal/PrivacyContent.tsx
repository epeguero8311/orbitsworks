import { TERMS_VERSION } from "./TermsContent";

export default function PrivacyContent() {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <p className="text-sm text-gray-500">
        Last updated: September 6, 2026 (version {TERMS_VERSION})
      </p>

      <p>
        This Privacy Policy describes how OrbitWorks collects, uses,
        stores, processes, shares, retains, and deletes personal
        information in connection with the OrbitWorks Service.
      </p>
      <p>
        This Privacy Policy should be read together with our Terms and
        Conditions and Biometric Data Policy.
      </p>

      <h2>1. Information We Collect</h2>
      <p>
        Depending on how a Customer configures and uses OrbitWorks, we may
        collect the following information.
      </p>

      <h3>Account Information</h3>
      <p>
        We may collect administrator and supervisor names, email
        addresses, roles, authentication information, account settings,
        and related account information.
      </p>

      <h3>Employee Information</h3>
      <p>Customers may provide Employee information including:</p>
      <ul>
        <li>name;</li>
        <li>job title;</li>
        <li>phone number;</li>
        <li>date of birth;</li>
        <li>hourly pay rate;</li>
        <li>assigned job sites;</li>
        <li>profile photo;</li>
        <li>employment or workforce identifiers; and</li>
        <li>other information entered by Customer.</li>
      </ul>

      <h3>Job-Site Information</h3>
      <p>
        We may collect job-site names, addresses, assignments, schedules,
        and related workforce information.
      </p>

      <h3>Clock and Attendance Information</h3>
      <p>We may collect information associated with clock events, including:</p>
      <ul>
        <li>clock-in and clock-out timestamps;</li>
        <li>break start and end timestamps;</li>
        <li>associated job site;</li>
        <li>verification method;</li>
        <li>supervisor override information;</li>
        <li>admin-created or edited timestamps;</li>
        <li>notes;</li>
        <li>timesheet approval information; and</li>
        <li>related attendance records.</li>
      </ul>

      <h3>Location Information</h3>
      <p>
        If Customer enables location-based features, OrbitWorks may
        process precise or approximate device location, job-site
        location, geofence information, or location-verification results
        in connection with clock events. The specific location
        information collected depends on the features enabled by
        Customer.
      </p>

      <h3>Photos</h3>
      <p>
        OrbitWorks may process Employee profile photos and photos
        captured during enrollment, clock-in, clock-out, or verification
        workflows. Storage and retention of these photos may depend on
        the feature used and the retention settings described in this
        Policy or the Biometric Data Policy.
      </p>

      <h3>Biometric Information</h3>
      <p>
        If Customer enables face verification, OrbitWorks may process
        biometric information as described in the Biometric Data Policy.
      </p>

      <h3>Billing Information</h3>
      <p>
        Payments are processed by Stripe. OrbitWorks may store Stripe
        customer identifiers, subscription identifiers, payment status,
        billing-plan information, and related transaction references.
        OrbitWorks does not store full payment card numbers.
      </p>

      <h3>Technical Information</h3>
      <p>
        We may collect technical information necessary to operate and
        secure the Service, including IP address, device information,
        browser or application information, authentication events, error
        logs, security events, and usage information.
      </p>

      <h2>2. How We Use Information</h2>
      <p>OrbitWorks may use personal information to:</p>
      <ul>
        <li>provide and operate the Service;</li>
        <li>authenticate users;</li>
        <li>manage Customer accounts;</li>
        <li>record clock events;</li>
        <li>calculate hours, overtime, breaks, and estimated pay;</li>
        <li>manage job sites and assignments;</li>
        <li>provide face-verification or location-verification features;</li>
        <li>generate alerts;</li>
        <li>create reports and exports;</li>
        <li>support timesheet review and approval;</li>
        <li>process subscriptions and billing;</li>
        <li>provide technical support;</li>
        <li>protect the security and integrity of the Service;</li>
        <li>detect fraud, abuse, or unauthorized access;</li>
        <li>maintain and improve the Service;</li>
        <li>comply with applicable legal obligations; and</li>
        <li>enforce our Terms.</li>
      </ul>

      <h2>3. Customer Instructions</h2>
      <p>
        For information Customer submits about Employees, OrbitWorks
        generally processes that information to provide the Service
        according to Customer's configuration and instructions.
      </p>
      <p>
        Customer determines which Employees are added, which features are
        enabled, which information is entered, and how workforce
        information is used for Customer's employment and business
        purposes.
      </p>
      <p>
        Customer remains responsible for complying with laws applicable
        to its relationship with its Employees.
      </p>

      <h2>4. How We Share Information</h2>
      <p>
        OrbitWorks may share information with service providers that
        assist us in operating the Service. These providers may include:
      </p>
      <ul>
        <li>Google Firebase and Google Cloud for hosting, authentication, databases, file storage, and infrastructure;</li>
        <li>Stripe for subscription billing and payment processing;</li>
        <li>Amazon Web Services and Amazon Rekognition for optional face-verification functionality; and</li>
        <li>other infrastructure, security, analytics, communications, or support providers reasonably necessary to operate the Service.</li>
      </ul>
      <p>
        These providers process information only as necessary to provide
        services to OrbitWorks or as otherwise permitted by applicable
        law and their agreements with us.
      </p>
      <p>We do not sell Employee personal information.</p>
      <p>
        We do not share Employee personal information with unrelated
        third parties for their own advertising or marketing purposes.
      </p>
      <p>
        We may also disclose information where reasonably necessary to
        comply with law, respond to lawful legal process, protect the
        rights or security of OrbitWorks or others, investigate fraud or
        misuse, or in connection with a merger, acquisition, financing,
        restructuring, or sale of all or part of OrbitWorks.
      </p>

      <h2>5. Data Retention</h2>
      <p>
        We retain personal information only for as long as reasonably
        necessary to provide the Service, satisfy legitimate business
        purposes, comply with legal obligations, resolve disputes, and
        enforce agreements.
      </p>
      <p>Default retention may include:</p>
      <ul>
        <li>
          <strong>Employee profiles and profile photos</strong>: while the
          Customer account or Employee record remains active and for up
          to 90 days following applicable account termination or
          deletion, unless deleted earlier or retention is required by
          law.
        </li>
        <li>
          <strong>Clock, attendance, timesheet, and related workforce
          records</strong>: while Customer maintains an active account
          and for up to three years following termination, unless
          Customer requests earlier deletion and deletion is legally and
          operationally permissible.
        </li>
        <li>
          <strong>Account information</strong>: for the duration of the
          account and for a reasonable period afterward for security,
          billing, legal, fraud-prevention, and administrative purposes.
        </li>
        <li>
          <strong>Billing and transaction records</strong>: for the
          period reasonably necessary to satisfy tax, accounting,
          fraud-prevention, and legal obligations.
        </li>
        <li>
          <strong>Biometric information</strong>: according to the
          retention and destruction schedule described in the Biometric
          Data Policy.
        </li>
      </ul>
      <p>
        Backup copies may remain for a limited period following deletion
        as part of routine disaster recovery and system backup processes
        before being automatically overwritten or deleted.
      </p>
      <p>
        Customer is responsible for determining what workforce or
        employment records it is legally required to retain and should
        export required records before they are deleted from OrbitWorks.
      </p>

      <h2>6. Access, Correction, Export, and Deletion</h2>
      <p>
        Customers may be able to access, correct, export, or delete
        information through features available in the Service.
      </p>
      <p>
        Employees should generally direct requests regarding information
        controlled by their employer to their employer.
      </p>
      <p>
        Where appropriate, OrbitWorks will assist Customer with verified
        requests to access, correct, export, or delete personal
        information.
      </p>
      <p>
        Certain information may be retained where required or permitted
        by law, including for fraud prevention, security, billing, legal
        compliance, or dispute resolution.
      </p>

      <h2>7. Security</h2>
      <p>
        OrbitWorks uses reasonable administrative, technical, and
        organizational safeguards designed to protect personal
        information.
      </p>
      <p>
        These safeguards may include encryption in transit, authentication
        controls, role-based permissions, access restrictions, tenant
        separation, monitoring, and security controls appropriate to the
        Service.
      </p>
      <p>
        No internet-connected service or information-storage system can
        be guaranteed to be completely secure, and OrbitWorks cannot
        guarantee absolute security.
      </p>

      <h2>8. Data Breaches and Security Incidents</h2>
      <p>
        If OrbitWorks becomes aware of a security incident involving
        personal information, OrbitWorks will investigate the incident
        and take reasonable steps to contain, mitigate, and remediate it.
      </p>
      <p>
        Where required by applicable law or contractual obligation,
        OrbitWorks will provide legally required notifications to
        affected Customers or other parties.
      </p>

      <h2>9. Children's Information</h2>
      <p>
        OrbitWorks is designed for workforce and business use and is not
        intended for use by children except where a Customer lawfully
        employs or otherwise manages a minor and is permitted to process
        the minor's information under applicable law.
      </p>
      <p>
        Customer is responsible for complying with any additional legal
        requirements that apply to workers under the age of majority.
      </p>

      <h2>10. International Processing</h2>
      <p>
        OrbitWorks and its service providers may process information in
        the United States and other locations where they operate.
      </p>
      <p>
        Where legally required, appropriate safeguards will be used for
        international transfers of personal information.
      </p>

      <h2>11. Sale or Transfer of Business</h2>
      <p>
        If OrbitWorks is involved in a merger, acquisition,
        restructuring, financing, bankruptcy, or sale of assets, personal
        information may be transferred as part of that transaction,
        subject to applicable law.
      </p>

      <h2>12. Changes to This Privacy Policy</h2>
      <p>OrbitWorks may update this Privacy Policy from time to time.</p>
      <p>
        Material changes will be reflected by an updated "Last updated"
        date and may also be communicated through the Service, by email,
        or through another reasonable method.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions, privacy requests, or concerns regarding this Privacy
        Policy may be submitted using the contact information provided on
        the OrbitWorks website.
      </p>
    </div>
  );
}