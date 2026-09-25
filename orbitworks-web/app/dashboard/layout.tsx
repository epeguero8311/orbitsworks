"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import {
  LayoutGrid,
  Users,
  Building2,
  Clock,
  ClipboardCheck,
  FileText,
  CreditCard,
  Settings as SettingsIcon,
  LogOut,
  Orbit,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { PastDueBanner } from "@/components/PastDueBanner";
import { HelpChat } from "@/components/help-chat/HelpChat";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/employees", label: "Employees", icon: Users },
  { href: "/dashboard/sites", label: "Jobs", icon: Building2 },
  { href: "/dashboard/time", label: "Time Tracking", icon: Clock },
  { href: "/dashboard/timesheet-approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  // Billing is filtered out below for non-owners - only the owner has
  // Stripe access.
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard, ownerOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("dashboardSidebarCollapsed") === "true";
  });

  useEffect(() => {
    window.localStorage.setItem("dashboardSidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
      return;
    }
    if (!loading && userData?.role === "supervisor") {
      router.push("/mobile-only");
      return;
    }
    if (!loading && userData && userData.role !== "owner" && pathname.startsWith("/dashboard/billing")) {
      router.push("/403");
    }
  }, [loading, currentUser, userData, pathname, router]);

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : null;
      setCompanyName(data?.name ?? null);
      setLogoUrl(data?.logoUrl ?? null);
      setSubscriptionStatus(data?.subscriptionStatus ?? null);
      setPlanTier(data?.planTier ?? null);
    });
    return unsubscribe;
  }, [userData?.companyId]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!currentUser || userData?.role === "supervisor") {
    return null;
  }

  async function handleSignOut() {
    await signOut(auth);
    router.push("/login");
  }

  return (
    <div className="flex min-h-full flex-1 bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col border-r border-gray-200 bg-white transition-[transform,width] duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : ""
        } ${sidebarCollapsed ? "lg:w-[76px]" : "lg:w-60"}`}
      >
        <div
          className={`flex items-center gap-2 border-b border-gray-200 px-6 py-5 ${
            sidebarCollapsed ? "lg:justify-center lg:px-3" : "justify-between"
          }`}
        >
          <div className={`flex items-center gap-2 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
            <Orbit className="h-5 w-5 text-accent shrink-0" />
            <span className="text-base font-semibold text-gray-950">Orbitsworks</span>
          </div>
          <Orbit className={`hidden h-5 w-5 shrink-0 text-accent ${sidebarCollapsed ? "lg:block" : ""}`} />
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1 text-gray-600 hover:bg-gray-50 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className={`flex-1 space-y-1 py-5 ${sidebarCollapsed ? "lg:px-2" : "px-4"}`}>
          {NAV_ITEMS.filter((item) => !item.ownerOnly || userData?.role === "owner").map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  sidebarCollapsed ? "lg:justify-center" : ""
                } ${
                  isActive
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>{item.label}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
            className={`hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950 lg:flex ${
              sidebarCollapsed ? "lg:justify-center" : ""
            }`}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </nav>

        <div className={`border-t border-gray-200 py-4 ${sidebarCollapsed ? "lg:px-2" : "px-4"}`}>
          <button
            onClick={handleSignOut}
            title={sidebarCollapsed ? "Logout" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950 ${
              sidebarCollapsed ? "lg:justify-center" : ""
            }`}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span className={sidebarCollapsed ? "lg:hidden" : ""}>Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {subscriptionStatus === "past_due" && <PastDueBanner />}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6 lg:justify-end lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-50 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {logoUrl && (
            <img
              src={logoUrl}
              alt="Company logo"
              className="h-9 w-9 rounded-full object-cover"
            />
          )}
        </div>

        <div className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </div>
        <HelpChat isSubscribed={subscriptionStatus === "active" && planTier !== "free"} />
      </main>
    </div>
  );
}
