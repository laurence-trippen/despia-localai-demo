import { createContext } from "react";
import type { UseIntelligenceAPI } from "./useIntelligence";

export const IntelligenceContext = createContext<
  UseIntelligenceAPI | undefined
>(undefined);
