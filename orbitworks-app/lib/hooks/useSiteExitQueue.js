import { useEffect, useState } from "react";
import { listSiteExits } from "../siteExitStore";
import { subscribePunchQueue } from "../punchQueueEvents";

// Employee App Phase 8: this employee's leave tracking rows on the phone
// (site_exit_queue), re-read whenever the queue changes - same events as
// usePunchQueue / useCommentQueue. Only the log out warning uses it.
export function useSiteExitQueue(companyId, employeeId) {
  const [all, setAll] = useState([]);

  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    let active = true;
    const reload = () =>
      listSiteExits()
        .then((items) => {
          if (active) setAll(items.filter((i) => i.companyId === companyId && i.employeeId === employeeId));
        })
        .catch(() => {});
    reload();
    const unsubscribe = subscribePunchQueue(reload);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [companyId, employeeId]);

  return all;
}
