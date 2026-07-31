"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Search, Bell } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/employees", label: "Employees" },
  { href: "/dashboard/sites", label: "Job Sites" },
  { href: "/dashboard/time", label: "Time Tracking" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/settings", label: "Settings" },
];

function initialsOf(text: string | null | undefined) {
  if (!text) return "?";
  return text.trim().charAt(0).toUpperCase();
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
    }
  }, [loading, currentUser, router]);

  // Live company name — updates instantly if it's changed in Settings
  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      setCompanyName(snapshot.exists() ? snapshot.data().name ?? null : null);
    });
    return unsubscribe;
  }, [userData?.companyId]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!currentUser) {
    // Redirect is in flight (see useEffect above); render nothing meanwhile.
    return null;
  }

  async function handleSignOut() {
    await signOut(auth);
    router.push("/login");
  }

  return (
    <div className="flex min-h-full flex-1 bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <span className="text-sm font-semibold text-gray-950">OrbitWorks</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 px-3 py-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-gray-950">
              {companyName ?? "…"}
            </p>
            <p className="text-xs capitalize text-gray-600">
              {userData?.role ?? "…"}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-gray-200 bg-white px-8 py-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              placeholder="Search…"
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-9 pr-3 text-sm text-gray-950 placeholder:text-gray-600 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <button
            className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>

          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
            {initialsOf(userData?.name ?? companyName)}
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}