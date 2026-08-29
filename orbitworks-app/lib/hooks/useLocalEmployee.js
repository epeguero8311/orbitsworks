import { useCallback, useEffect, useState } from "react";
import { getLocalEmployee } from "../pinSync";
import { subscribePinTableChange } from "../pinEvents";

export function useLocalEmployee(employeeId) {
  const [employee, setEmployee] = useState(null);

  const refresh = useCallback(() => {
    if (!employeeId) {
      setEmployee(null);
      return;
    }
    getLocalEmployee(employeeId).then(setEmployee);
  }, [employeeId]);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribePinTableChange(refresh);
    return unsubscribe;
  }, [refresh]);

  return employee;
}