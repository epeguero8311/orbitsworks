import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <LandingNav />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="text-3xl font-semibold text-gray-950">Terms of Service</h1>
          <p className="mt-2 text-sm text-gray-600">
            Last updated: August 11, 2026 - This document is a draft and has
            not yet been reviewed by legal counsel.
          </p>

          <div className="mt-10 space-y-8 text-sm leading-relaxed text-gray-600">
            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                1. Acceptance of terms
              </h2>
              <p className="mt-3">
                By creating an account or using Orbitsworks, you agree to
                these Terms of Service on behalf of yourself and, if
                applicable, the business you represent ("Company"). If you do
                not agree, do not use Orbitsworks.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                2. Description of service
              </h2>
              <p className="mt-3">
                Orbitsworks is a workforce management platform that allows a
                Company to manage job sites, track employee clock-ins and
                clock-outs (including PIN entry and photo capture), and
                generate attendance and payroll reports.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                3. Accounts and eligibility
              </h2>
              <p className="mt-3">
                Orbitsworks is intended for use by businesses and their
                authorized personnel, not individual consumers. The person
                creating a Company account represents that they have
                authority to bind that Company to these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                4. The Company's responsibilities
              </h2>
              <p className="mt-3">
                The Company is responsible for the accuracy of the
                information it enters into Orbitsworks, for managing which of
                its personnel have admin or supervisor access, and for
                complying with all laws applicable to its use of the service
                - including, where applicable, providing employees with any
                notice and obtaining any consent required before collecting
                clock-in or clock-out photos, as described in the Privacy
                Policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                5. Acceptable use
              </h2>
              <p className="mt-3">
                You agree not to use Orbitsworks to violate any law, to
                collect data about individuals without the notice or consent
                required by law, to interfere with the operation of the
                service, or to attempt to access data belonging to a Company
                other than your own.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                6. Data ownership
              </h2>
              <p className="mt-3">
                As between Orbitsworks and the Company, the Company retains
                ownership of the employee and attendance data it submits to
                the service. Orbitsworks processes that data on the
                Company's behalf as described in the Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                7. Termination
              </h2>
              <p className="mt-3">
                A Company may stop using Orbitsworks at any time. Orbitsworks
                may suspend or terminate access to the service for violation
                of these Terms or for non-payment of applicable fees.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                8. Disclaimers
              </h2>
              <p className="mt-3">
                Orbitsworks is provided "as is." We do not guarantee that the
                service will be uninterrupted or error-free. Clock-in and
                clock-out verification currently relies on employee-entered
                PINs and supervisor oversight rather than automated identity
                verification; if automated facial verification is
                introduced in the future, it will be described in an
                updated version of this policy and the Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                9. Limitation of liability
              </h2>
              <p className="mt-3">
                To the maximum extent permitted by law, Orbitsworks will not
                be liable for indirect, incidental, or consequential damages
                arising from use of the service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                10. Changes to these terms
              </h2>
              <p className="mt-3">
                We may update these Terms from time to time. Material
                changes will be reflected by updating the "Last updated" date
                above.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                11. Contact
              </h2>
              <p className="mt-3">
                Questions about these Terms can be directed to
                epeguero8311@gmail.com.
              </p>
            </section>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
