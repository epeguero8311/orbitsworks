"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Bell, LogOut } from "lucide-react";
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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
    }
  }, [loading, currentUser, router]);

  // Live company name + logo — updates instantly if changed in Settings
  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : null;
      setCompanyName(data?.name ?? null);
      setLogoUrl(data?.logoUrl ?? null);
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
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-end gap-4 border-b border-gray-200 bg-white px-8 py-3">
          <button
            className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>

          {logoUrl && (
            <img
              src={logoUrl}
              alt="Company logo"
              className="h-8 w-8 rounded-full object-cover"
            />
          )}
        </div>

        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}