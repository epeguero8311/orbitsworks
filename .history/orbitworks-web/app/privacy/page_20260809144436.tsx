import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <LandingNav />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="text-3xl font-semibold text-gray-950">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-600">
            Last updated: [date] - This document is a draft and has not yet
            been reviewed by legal counsel.
          </p>

          <div className="prose-sm mt-10 space-y-8 text-sm leading-relaxed text-gray-600">
            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                1. Who this policy covers
              </h2>
              <p className="mt-3">
                This Privacy Policy describes how Orbitsworks ("Orbitsworks,"
                "we," "us") collects, uses, and protects information when a
                business ("Company," "employer") uses Orbitsworks to manage
                its job sites and workforce, and when that Company's
                employees clock in and out using Orbitsworks. Orbitsworks
                acts as a data processor on behalf of the Company for
                employee time and attendance data, including clock-in photos.
              </p>
            </section>

            <section id="clock-in-photos">
              <h2 className="text-lg font-semibold text-gray-950">
                2. Clock-in and clock-out photos
              </h2>
              <p className="mt-3">
                Orbitsworks captures a photo each time an employee clocks in
                or out with their personal PIN, so that a Company has a
                visual record of who was actually on site. This section
                explains exactly how that works.
              </p>

              <h3 className="mt-6 font-semibold text-gray-950">
                Why photos are collected
              </h3>
              <p className="mt-2">
                Clock-in and clock-out photos exist to give the Company
                visual confirmation of who was on site at the time of each
                PIN entry - helping prevent inaccurate time records. Photos
                are used only for this purpose. They are not used for any
                other purpose, including marketing, profiling, or sharing
                with parties outside the employee's own Company.
              </p>

              <h3 className="mt-6 font-semibold text-gray-950">
                When photos are taken
              </h3>
              <p className="mt-2">
                A photo is captured at the moment of each clock-in and
                clock-out entered via PIN at a job site tablet, or when a
                supervisor clocks an employee in or out directly. Clock
                events entered manually by an admin through the web
                dashboard do not include a photo, since no camera is
                involved in that entry method.
              </p>

              <h3 className="mt-6 font-semibold text-gray-950">
                How long photos are retained
              </h3>
              <p className="mt-2">
                Clock-in and clock-out photos are retained for 2 weeks from
                the date they are captured, and are automatically deleted
                after that period. Photos are not kept longer than 2 weeks
                for any employee.
              </p>

              <h3 className="mt-6 font-semibold text-gray-950">
                Who can access photos
              </h3>
              <p className="mt-2">
                Only the employee's own Company - specifically, admins and
                supervisors within that Company's Orbitsworks account - can
                view an employee's clock-in and clock-out photos. Photos are
                never visible to other Companies using Orbitsworks, and are
                never sold or shared with third parties for advertising or
                any purpose unrelated to time and attendance verification.
                Orbitsworks' infrastructure providers (such as our cloud
                hosting and storage providers) process photos on our behalf
                solely to operate the service.
              </p>

              <h3 className="mt-6 font-semibold text-gray-950">
                When photos are deleted
              </h3>
              <p className="mt-2">
                Photos are automatically and permanently deleted 2 weeks
                after capture. An employee or their Company admin may also
                request earlier deletion by contacting Orbitsworks or, where
                available, using in-app tools.
              </p>

              <h3 className="mt-6 font-semibold text-gray-950">
                If an employee can't clock in themselves
              </h3>
              <p className="mt-2">
                Orbitsworks does not currently use automated facial
                verification. Employees clock in and out using a personal
                PIN. If an employee forgets or is unable to use their PIN, a
                supervisor can clock them in or out directly from the job
                site tablet, or an admin can enter the event manually from
                the web dashboard. Automated photo-based identity
                verification is planned for a future release and is not part
                of the service today - this policy will be updated before
                that feature is introduced.
              </p>

              <h3 className="mt-6 font-semibold text-gray-950">
                The Company's responsibility for notice and consent
              </h3>
              <p className="mt-2">
                The Company - not Orbitsworks - is responsible for notifying
                its employees that clock-in and clock-out photos will be
                collected, and for obtaining any consent required by
                applicable law before enrolling an employee in photo
                verification. Depending on where employees are located, this
                may include specific written notice and consent requirements
                under state biometric privacy laws (for example, Illinois'
                Biometric Information Privacy Act, and similar laws in other
                states). Companies should consult their own legal counsel to
                determine what notice and consent their workforce requires,
                and should provide that notice before an employee's first
                clock-in.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                3. Other information we collect
              </h2>
              <p className="mt-3">
                In addition to clock-in and clock-out photos, Orbitsworks
                processes other information needed to operate the service on
                behalf of a Company, including: employee names, job titles,
                phone numbers, hourly rates, job site assignments, and clock
                event timestamps and locations (where location is enabled);
                and account information for Company admins and supervisors,
                such as name and email address.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                4. How we use information
              </h2>
              <p className="mt-3">
                Information collected through Orbitsworks is used to operate
                the time-tracking, scheduling, and reporting features of the
                service for the Company that collected it, to generate
                attendance and payroll reports for that Company, to maintain
                the security and integrity of the service, and to provide
                customer support.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                5. Data security
              </h2>
              <p className="mt-3">
                Orbitsworks stores data using industry-standard cloud
                infrastructure with access controls limiting data to
                authorized users within each Company's account. No method of
                transmission or storage is completely secure, and
                Orbitsworks cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                6. Changes to this policy
              </h2>
              <p className="mt-3">
                We may update this Privacy Policy from time to time. Material
                changes will be reflected by updating the "Last updated" date
                above.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                7. Contact
              </h2>
              <p className="mt-3">
                Questions about this policy can be directed to [contact
                email].
              </p>
            </section>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
