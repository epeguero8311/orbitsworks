"use client";

import { useState } from "react";
import { useSites } from "@/lib/hooks/useSites";
import { useSubcontractors } from "@/lib/hooks/useSubcontractors";
import { useJoinCodes } from "@/lib/hooks/useJoinCodes";
import { JoinCodeModal } from "@/components/dashboard/sites/JoinCodeModal";
import { type JoinCodeAction } from "@/components/dashboard/sites/JoinCodeActionButtons";
import { ActiveJoinCodes } from "@/components/dashboard/sites/ActiveJoinCodes";
import { JoinCodeList } from "@/components/dashboard/sites/JoinCodeList";
import { JoinCodeInfoModal } from "@/components/dashboard/sites/JoinCodeInfoModal";
import { JoinCodesLocked } from "@/components/dashboard/sites/JoinCodesLocked";
import { ConfirmDialog } from "@/components/dashboard/sites/ConfirmDialog";
import type { JoinCodeListItem } from "@/lib/types";
import type { JoinCodeCreateInput } from "@/lib/validators/joinCode";

// Pro only. Core/free sees the locked card and no request is ever made -
// the API routes also return 403 for non-Pro, so this is UI only.
export default function JoinCodesSection() {
  const { sites, isPro, planLoaded, addSite } = useSites();
  const { subcontractors } = useSubcontractors();
  const { data, loading, error, createCode, updateCode, regenerateCode, revokeCode } = useJoinCodes(planLoaded && isPro);

  const [modal, setModal] = useState<{ code: JoinCodeListItem | null } | null>(null);
  const [confirm, setConfirm] = useState<{ action: "regenerate" | "revoke"; code: JoinCodeListItem } | null>(null);
  // By codeId (stable across regenerate), so the modal follows the code
  // after a regenerate or revoke refreshes the list.
  const [infoCodeId, setInfoCodeId] = useState<string | null>(null);
  const infoCode = data?.codes.find((c) => c.codeId === infoCodeId) ?? null;
  const activeCodes = data ? data.codes.filter((c) => c.status === "active") : [];

  function handleAction(action: JoinCodeAction, code: JoinCodeListItem) {
    if (action === "edit") {
      setInfoCodeId(null);
      setModal({ code });
    } else setConfirm({ action, code });
  }

  async function handleSave(input: JoinCodeCreateInput, token: string | null) {
    if (token) await updateCode({ ...input, token });
    else await createCode(input);
  }

  const showPro = planLoaded && isPro;

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-600">
            Crew members scan a crew code to sign up and join your company in the OrbitsWorks app. To clock someone in without the app, use Temporary clock-in link.
          </p>
        </div>
        {showPro && (
          <button
            onClick={() => setModal({ code: null })}
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Create crew code
          </button>
        )}
      </div>

      {!planLoaded ? (
        <p className="mt-4 text-sm text-gray-600">Loading...</p>
      ) : !isPro ? (
        <JoinCodesLocked />
      ) : (
        <>
          {data && (
            <div className="mt-6">
              <ActiveJoinCodes codes={activeCodes} onAction={handleAction} />
            </div>
          )}
          <h2 className="mt-8 text-sm font-semibold text-gray-950">All crew codes</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {data && data.activeCap !== null && (
              <p className="border-b border-gray-200 px-4 py-2 text-xs text-gray-600">
                {data.seatsLeft} of {data.activeCap} active seats left ({data.activeCount} active employees)
              </p>
            )}
            {loading && !data ? (
              <p className="p-4 text-sm text-gray-600">Loading...</p>
            ) : error ? (
              <p className="p-4 text-sm text-red-600">{error}</p>
            ) : !data || data.codes.length === 0 ? (
              <p className="p-4 text-sm text-gray-600">No crew codes yet. Create one to get started.</p>
            ) : (
              <JoinCodeList codes={data.codes} onInfo={(c) => setInfoCodeId(c.codeId)} />
            )}
          </div>
        </>
      )}

      {infoCode && <JoinCodeInfoModal code={infoCode} onAction={handleAction} onClose={() => setInfoCodeId(null)} />}

      {modal && data && (
        <JoinCodeModal
          code={modal.code}
          sites={sites}
          subcontractors={subcontractors}
          activeCap={data.activeCap}
          seatsLeft={data.seatsLeft}
          addSite={addSite}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.action === "revoke" ? "Revoke this crew code?" : "Regenerate this crew code?"}
          message={
            confirm.action === "revoke"
              ? `"${confirm.code.name}" will stop working right away. This can't be undone.`
              : `"${confirm.code.name}" gets a new link and QR. The old one stops working - reprint any posted copies.`
          }
          confirmLabel={confirm.action === "revoke" ? "Revoke" : "Regenerate"}
          danger={confirm.action === "revoke"}
          onConfirm={async () => {
            if (confirm.action === "revoke") await revokeCode(confirm.code.token);
            else await regenerateCode(confirm.code.token);
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
