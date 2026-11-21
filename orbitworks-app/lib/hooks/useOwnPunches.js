import { useCallback, useEffect, useState } from "react";
import { listAllPunches } from "../punchQueue";
import { subscribePunchQueue } from "../punchQueueEvents";
import { openOwnPunches } from "../roleSync";

// RC1: this person's own Employee App punches still on the phone (made
// before a promotion), live. Empty for anyone who never used the
// Employee App on this phone.
export function useOwnPunches(companyId, employeeId) {
  const [items, setItems] = useState([]);

  const refresh = useCallback(() => {
    const read = companyId && employeeId ? listAllPunches() : Promise.resolve([]);
    read.then((all) => setItems(openOwnPunches(all, companyId, employeeId))).catch(() => setItems([]));
  }, [companyId, employeeId]);

  useEffect(() => {
    refresh();
    return subscribePunchQueue(refresh);
  }, [refresh]);

  return items;
}
