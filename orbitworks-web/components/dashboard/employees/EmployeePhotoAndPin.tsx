"use client";

import { Pencil } from "lucide-react";

export function EmployeePhotoAndPin({
  employeeName,
  photoPreview,
  photoUrl,
  faceReferenceBad,
  onPhotoChange,
  confirmingRemovePhoto,
  onStartRemovePhoto,
  onCancelRemovePhoto,
  isRemovingPhoto,
  removePhotoError,
  onRemovePhoto,
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
  // Face Verification (Pro) - true when employee.faceReference.status is
  // "bad" for the CURRENTLY SAVED photoUrl. A fresh, not-yet-saved
  // photoPreview clears the warning optimistically - the real flag only
  // updates once the new photo is actually saved and re-checked server-side
  // (onEmployeePhotoWrite), but showing a stale warning over a photo the
  // admin just picked to fix it would be confusing.
  faceReferenceBad?: boolean;
  onPhotoChange: (file: File | null) => void;
  // "Remove photo" (biometric audit c): deletes the saved reference photo
  // server-side (removeEmployeePhoto). Only offered for a saved photo, not
  // a just-picked preview (that one isn't saved yet - Change photo again).
  confirmingRemovePhoto: boolean;
  onStartRemovePhoto: () => void;
  onCancelRemovePhoto: () => void;
  isRemovingPhoto: boolean;
  removePhotoError: string;
  onRemovePhoto: () => void;
  currentPin: string;
  editingPin: boolean;
  pinValue: string;
  pinError: string | null;
  onTogglePinEdit: () => void;
  onPinInputChange: (value: string) => void;
}) {
  const showBadReferenceWarning = !!faceReferenceBad && !photoPreview;
  const canRemovePhoto = !!photoUrl && !photoPreview;
  return (
    <div className="mb-5">
      <div className="flex items-center gap-4">
        <div>
          {photoPreview || photoUrl ? (
            <img
              src={photoPreview ?? photoUrl}
              alt={employeeName}
              className={`h-16 w-16 rounded-full object-cover ${
                showBadReferenceWarning ? "ring-2 ring-amber-400" : ""
              }`}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-600">
              No photo
            </div>
          )}
          {showBadReferenceWarning && (
            <p className="mt-1 max-w-[6.5rem] text-center text-[11px] leading-tight text-amber-700">
              No usable face - face verification paused until replaced
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <label
            htmlFor="editPhoto"
            className="cursor-pointer rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-950 hover:border-gray-300"
          >
            Change photo
          </label>
          {canRemovePhoto && !confirmingRemovePhoto && (
            <button
              type="button"
              onClick={onStartRemovePhoto}
              className="text-sm font-medium text-red-700 hover:underline"
            >
              Remove photo
            </button>
          )}
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

      {confirmingRemovePhoto && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800">
            Remove {employeeName}&apos;s photo? It&apos;s deleted for good. Face
            checks stop for them until you add a new photo. Their clock-in and
            clock-out photos and past results stay.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={onCancelRemovePhoto}
              disabled={isRemovingPhoto}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-950 hover:border-gray-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onRemovePhoto}
              disabled={isRemovingPhoto}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {isRemovingPhoto ? "Removing..." : "Yes, remove photo"}
            </button>
          </div>
        </div>
      )}
      {removePhotoError && <p className="mt-2 text-sm text-red-600">{removePhotoError}</p>}
    </div>
  );
}
