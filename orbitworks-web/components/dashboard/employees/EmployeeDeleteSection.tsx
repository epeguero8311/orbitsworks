"use client";

export function EmployeeDeleteSection({
  employeeName,
  confirmingDelete,
  onStartConfirm,
  onCancelConfirm,
  isDeleting,
  deleteError,
  onDelete,
}: {
  employeeName: string;
  confirmingDelete: boolean;
  onStartConfirm: () => void;
  onCancelConfirm: () => void;
  isDeleting: boolean;
  deleteError: string;
  onDelete: () => void;
}) {
  return (
    <div>
      {!confirmingDelete ? (
        <button
          onClick={onStartConfirm}
          className="rounded-lg border border-red-200 px-5 py-2.5 text-sm font-medium text-red-700 hover:border-red-300 hover:bg-red-50"
        >
          Delete employee
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <p className="text-sm text-red-800">
            Delete {employeeName}? This can&apos;t be undone.
          </p>
          <button
            onClick={onCancelConfirm}
            disabled={isDeleting}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-950 hover:border-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Yes, delete"}
          </button>
        </div>
      )}
      {deleteError && <p className="mt-2 text-sm text-red-600">{deleteError}</p>}
    </div>
  );
}
