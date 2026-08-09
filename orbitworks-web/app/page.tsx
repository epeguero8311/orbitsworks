import Link from "next/link";
import { Camera, LayoutDashboard, Tablet, FileSpreadsheet } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";

const FEATURES = [
  {
    icon: Camera,
    title: "PIN clock-ins with photo proof",
    description:
      "Employees clock in and out with a personal PIN, and a photo is captured at that moment as proof of who was on site. If an employee can't clock in themselves, a supervisor can do it for them directly.",
  },
  {
    icon: LayoutDashboard,
    title: "Live job site dashboard",
    description:
      "See who's clocked in, at which site, and for how long - updated in real time as your crews work.",
  },
  {
    icon: Tablet,
    title: "One tablet per site",
    description:
      "Supervisors run the whole crew from a single tablet at the job site - no per-employee phone or app required.",
  },
  {
    icon: FileSpreadsheet,
    title: "Payroll-ready reports",
    description:
      "Export timesheets, payroll hours, and attendance to Excel or CSV - formatted and ready to hand off.",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Add your job sites and crew",
    description:
      "Set up sites, invite supervisors, and add employees in minutes.",
  },
  {
    number: "2",
    title: "Crew clocks in on-site",
    description:
      "Employees enter their PIN at the tablet, and a photo is captured as proof of who was there.",
  },
  {
    number: "3",
    title: "Review and export",
    description:
      "Check the live dashboard, catch issues with alerts, and export reports when payroll's due.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <LandingNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="overflow-hidden bg-gray-50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
            <div>
              <h1 className="text-3xl font-semibold leading-tight text-gray-950 sm:text-4xl lg:text-5xl">
                Know who's on site, the moment they clock in.
              </h1>
              <p className="mt-5 max-w-lg text-base text-gray-600 sm:text-lg">
                Orbitsworks gives job-site crews PIN clock-ins with photo
                proof, live supervisor dashboards, and payroll-ready reports
                - built for construction and field service teams.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  Get started free
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg border border-gray-200 px-6 py-3 text-sm font-medium text-gray-950 transition-colors hover:border-gray-300"
                >
                  Log in
                </Link>
              </div>
            </div>

            <div className="relative mx-auto flex h-72 w-72 items-center justify-center rounded-full bg-accent sm:h-80 sm:w-80">
              <style>{`
                @keyframes orbitSpinSlow {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                @keyframes orbitSpinSlowReverse {
                  from { transform: rotate(360deg); }
                  to { transform: rotate(0deg); }
                }
              `}</style>
              <div
                className="absolute inset-6 rounded-full border border-white/25"
                style={{ animation: "orbitSpinSlow 70s linear infinite" }}
              >
                <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-white" />
              </div>
              <div
                className="absolute inset-16 rounded-full border border-white/25"
                style={{ animation: "orbitSpinSlowReverse 50s linear infinite" }}
              >
                <span className="absolute top-1/2 -right-1.5 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white" />
              </div>
              <div
                className="absolute inset-24 rounded-full border border-white/25"
                style={{ animation: "orbitSpinSlow 40s linear infinite" }}
              >
                <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white" />
              </div>
              <div className="h-5 w-5 rounded-full bg-white" />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="text-2xl font-semibold text-gray-950 sm:text-3xl">
            Everything a job-site crew needs, in one place.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-xl border border-gray-200 bg-white p-6"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
                    <Icon className="h-5 w-5 text-accent" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-gray-950">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-gray-600">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="bg-gray-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <h2 className="text-2xl font-semibold text-gray-950 sm:text-3xl">
              Set up once, clock in every day.
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.number}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                    {step.number}
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-gray-950">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-gray-600">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust / security summary */}
        <section id="trust" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 sm:p-10">
            <h2 className="text-2xl font-semibold text-gray-950 sm:text-3xl">
              Clock-in photos, handled carefully.
            </h2>
            <ul className="mt-6 space-y-3 text-sm text-gray-600">
              <li>
                Photos are used only to confirm who clocked in and out -
                never for anything else.
              </li>
              <li>
                A photo is captured each time an employee clocks in or out
                with their PIN.
              </li>
              <li>Photos are deleted every 2 weeks.</li>
              <li>
                Only the employee's own company - their admins and
                supervisors - can view them.
              </li>
              <li>
                If an employee can't enter their PIN, a supervisor can clock
                them in directly.
              </li>
              <li>
                It's the employer's responsibility to notify employees and
                obtain any legally required consent before enrollment.
              </li>
            </ul>
            <Link
              href="/privacy"
              className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
            >
              Read the full Privacy Policy -&gt;
            </Link>
          </div>
        </section>

        {/* CTA banner */}
        <section className="bg-accent">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">
              Ready to see it on your job site?
            </h2>
            <p className="mt-3 text-sm text-white/80">
              Set up your company and start tracking your crew today.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-medium text-accent transition-colors hover:bg-gray-50"
            >
              Get started free
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
