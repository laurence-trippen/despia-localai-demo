import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Theme } from "@radix-ui/themes";

import IntelligenceGuard from "./lib/IntelligenceGuard.tsx";
import IntelligenceProvider from "./lib/IntelligenceProvider.tsx";
import SinglePromptApp from "./SinglePromptApp.tsx";
import "@radix-ui/themes/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme>
      <IntelligenceGuard>
        <IntelligenceProvider>
          <SinglePromptApp />
        </IntelligenceProvider>
      </IntelligenceGuard>
    </Theme>
  </StrictMode>
);
