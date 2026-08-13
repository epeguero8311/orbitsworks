import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { Users, Clock, NotebookPen, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Support",
};

export default function SupportPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <LandingNav />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="text-3xl font-semibold text-gray-950">Support</h1>
          <p className="mt-2 text-sm text-gray-600">
            How the Orbitsworks mobile app works, and where to get help.
          </p>

          <div className="mt-10 space-y-10">
            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                The supervisor app is a job-site kiosk
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                Supervisors use the Orbitsworks mobile app on a phone or
                tablet at the job site to manage the crew for the day. It
                works like a kiosk that stays with the supervisor rather than
                one device shared at a fixed location - here's what it does.
              </p>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-950">
                    See who's on site
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                    The dashboard shows the full employee list for the
                    supervisor's assigned sites, along with a live count of
                    how many people are currently clocked in.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <Clock className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-950">
                    Clock employees in and out
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                    An employee enters their personal PIN on the supervisor's
                    device to clock in or out, the same way they would at a
                    kiosk. A photo is captured at that moment as a visual
                    record for the Company.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <NotebookPen className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-950">
                    Save notes for the day
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                    Supervisors can leave a note for a job site or shift -
                    useful for flagging anything an admin should know about
                    when reviewing the day's activity later.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                Need help with something else?
              </h2>
              <p className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4 text-accent" />
                Contact{" "}
                <Link href="mailto:epeguero8311@gmail.com" className="font-medium text-accent hover:underline">epeguero8311@gmail.com</Link>{" "}
                with any questions.
              </p>
            </section>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
