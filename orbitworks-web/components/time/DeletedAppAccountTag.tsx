// Employee App "Delete account" (functions/src/employeeAccount.ts): the
// employee deleted their own app login. Their row and clock events stay as
// the company's records; this tag marks them on the Employees page and on
// their clock events. Renders nothing otherwise.
export function DeletedAppAccountTag({ deleted, className = "" }: { deleted: boolean; className?: string }) {
  if (!deleted) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 ${className}`}
      title="This employee deleted their OrbitsWorks app account. Their photo, selfie and PIN were deleted. Their clock history stays."
    >
      Deleted app account
    </span>
  );
}
