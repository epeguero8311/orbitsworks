"use client";

import { Pencil } from "lucide-react";

export function EmployeePhotoAndPin({
  employeeName,
  photoPreview,
  photoUrl,
  onPhotoChange,
  currentPin,
  editingPin,
  pinValue,
  pinError,
  onTogglePinEdit,
  onPinInputChange,
}: {
  employeeName: string;
  photoPreview: string | null;
  photoUrl: string | undefined;
  onPhotoChange: (file: File | null) => void;
  currentPin: string;
  editingPin: boolean;
  pinValue: string;
  pinError: string | null;
  onTogglePinEdit: () => void;
  onPinInputChange: (value: string) => void;
}) {
  return (
    <div className="mb-5 flex items-center gap-4">
      {photoPreview || photoUrl ? (
        <img
          src={photoPreview ?? photoUrl}
          alt={employeeName}
          className="h-16 w-16 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-600">
          No photo
        </div>
      )}
      <div>
        <label
          htmlFor="editPhoto"
          className="cursor-pointer rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-950 hover:border-gray-300"
        >
          Change photo
        </label>
        <input
          id="editPhoto"
          type="file"
          accept="image/*"
          onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>
      <div className="ml-auto rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-right">
        <p className="text-xs font-medium text-gray-600">Backup PIN</p>
        <div className="flex items-center justify-end gap-2">
          {editingPin ? (
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={pinValue}
              onChange={(e) => onPinInputChange(e.target.value)}
              maxLength={4}
              className="w-20 rounded-md border border-gray-200 px-2 py-1 text-right font-mono text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          ) : (
            <p className="font-mono text-lg font-semibold text-gray-950">
              {currentPin || "-"}
            </p>
          )}
          <button
            type="button"
            onClick={onTogglePinEdit}
            aria-label={editingPin ? "Cancel PIN edit" : "Edit PIN"}
            className="text-gray-500 hover:text-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
        {pinError && <p className="mt-1 text-xs text-red-600">{pinError}</p>}
      </div>
    </div>
  );
}
