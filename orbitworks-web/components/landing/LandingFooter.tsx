import Link from "next/link";
import { Orbit } from "lucide-react";

export default function LandingFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Orbit className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold text-gray-950">Orbitsworks</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
            <Link href="/support" className="hover:text-gray-950">
              Support
            </Link>
            <Link href="/privacy" className="hover:text-gray-950">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-gray-950">
              Terms of Service
            </Link>
            <Link href="/login" className="hover:text-gray-950">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-gray-950">
              Get started
            </Link>
          </nav>
        </div>
        <p className="mt-6 text-xs text-gray-600">
          (c) {new Date().getFullYear()} Orbitsworks. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
