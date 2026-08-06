import { createContext, useContext, useState } from "react";

const SiteSessionContext = createContext(null);

export function SiteSessionProvider({ children }) {
  const [selectedSite, setSelectedSite] = useState(null); // null = "All Sites"

  return (
    <SiteSessionContext.Provider value={{ selectedSite, setSelectedSite }}>
      {children}
    </SiteSessionContext.Provider>
  );
}

export function useSiteSession() {
  return useContext(SiteSessionContext);
}
