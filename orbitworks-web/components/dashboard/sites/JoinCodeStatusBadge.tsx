import type { JoinCodeStatus } from "@/lib/types";

const STATUS_LABEL: Record<JoinCodeStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  full: "Full",
  noSeats: "No seats left",
};

const STATUS_CLASS: Record<JoinCodeStatus, string> = {
  active: "bg-green-50 text-green-700",
  expired: "bg-gray-100 text-gray-600",
  revoked: "bg-red-50 text-red-700",
  full: "bg-amber-50 text-amber-700",
  noSeats: "bg-amber-50 text-amber-700",
};

export function JoinCodeStatusBadge({ status }: { status: JoinCodeStatus }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
