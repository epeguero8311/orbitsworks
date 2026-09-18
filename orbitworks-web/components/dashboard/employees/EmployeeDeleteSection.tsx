"use client";

export function EmployeeDeleteSection({
  employeeName,
  confirmingDelete,
  onStartConfirm,
  onCancelConfirm,
  isDeleting,
  deleteError,
  onDelete,
  isSupervisorRemoval,
}: {
  employeeName: string;
  confirmingDelete: boolean;
  onStartConfirm: () => void;
  onCancelConfirm: () => void;
  isDeleting: boolean;
  deleteError: string;
  onDelete: () => void;
  isSupervisorRemoval: boolean;
}) {
  return (
    <div>
      {(!confirmingDelete || isSupervisorRemoval) && (
        <button
          onClick={onStartConfirm}
          className="rounded-lg border border-red-200 px-5 py-2.5 text-sm font-medium text-red-700 hover:border-red-300 hover:bg-red-50"
        >
          {isSupervisorRemoval ? "Remove supervisor" : "Deactivate employee"}
        </button>
      )}

      {!isSupervisorRemoval && confirmingDelete && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <p className="text-sm text-red-800">
            Deactivate {employeeName}? Any open clock session will be
            automatically closed. They can be reactivated later - nothing is
            deleted.
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
            {isDeleting ? "Deactivating..." : "Yes, deactivate"}
          </button>
        </div>
      )}

      {isSupervisorRemoval && confirmingDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          onClick={onCancelConfirm}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-950">
              Remove supervisor login?
            </h3>
            <p className="mt-3 text-sm text-gray-700">
              This permanently deletes <strong>{employeeName}</strong>&apos;s
              account and login access.{" "}
              <strong className="text-red-700">
                This can&apos;t be undone - there is no way to get their
                account back.
              </strong>
            </p>
            <p className="mt-3 text-sm text-gray-700">
              Their employee record, PIN, and full clock/timesheet history
              are kept and untouched. You&apos;ll be able to invite this
              email again afterward if you want to give them access.
            </p>
            {deleteError && (
              <p className="mt-3 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={onCancelConfirm}
                disabled={isDeleting}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-950 hover:border-gray-300 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={isDeleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isDeleting ? "Removing..." : "Yes, permanently remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isSupervisorRemoval && deleteError && (
        <p className="mt-2 text-sm text-red-600">{deleteError}</p>
      )}
    </div>
  );
}
