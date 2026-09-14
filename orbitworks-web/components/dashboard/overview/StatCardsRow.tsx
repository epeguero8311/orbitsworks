import { Users, Building2, Clock, Coffee } from "lucide-react";
import StatCard from "@/components/dashboard/overview/StatCard";

export default function StatCardsRow({
  loading,
  activeSitesCount,
  totalActive,
  onBreakCount,
  avgHoursWorked,
}: {
  loading: boolean;
  activeSitesCount: number;
  totalActive: number;
  onBreakCount: number;
  avgHoursWorked: string;
}) {
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={Building2}
        iconBg="bg-purple-50"
        iconColor="text-purple-600"
        label="Active job sites"
        value={activeSitesCount}
        loading={loading}
      />
      <StatCard
        icon={Users}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        label="Active employees"
        value={totalActive}
        loading={loading}
      />
      <StatCard
        icon={Coffee}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        label="On break"
        value={onBreakCount}
        loading={loading}
      />
      <StatCard
        icon={Clock}
        iconBg="bg-green-50"
        iconColor="text-green-600"
        label="Avg. hrs worked / employee"
        value={avgHoursWorked}
        loading={loading}
      />
    </div>
  );
}
