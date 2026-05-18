import React from "react";
import useIntelligence from "./useIntelligence";
import { IntelligenceContext } from "./IntelligenceContext";

export default function IntelligenceProvider({
  children,
}: React.PropsWithChildren) {
  const useIntelligenceAPI = useIntelligence();

  return (
    <IntelligenceContext.Provider value={useIntelligenceAPI}>
      {children}
    </IntelligenceContext.Provider>
  );
}
