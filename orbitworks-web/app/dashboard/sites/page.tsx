"use client";

import SitesSection from "@/components/dashboard/sites/SitesSection";
import JobsSection from "@/components/dashboard/sites/JobsSection";
import SubcontractorsSection from "@/components/dashboard/sites/SubcontractorsSection";

export default function JobsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Jobs</h1>
      <p className="mt-1 text-sm text-gray-600">
        Manage job sites, the job titles and pay rates employees can be
        assigned to, and subcontractor companies.
      </p>

      <SitesSection />
      <JobsSection />
      <SubcontractorsSection />
    </div>
  );
}
