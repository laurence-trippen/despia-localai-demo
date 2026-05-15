import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Theme } from "@radix-ui/themes";

import IntelligenceGuard from "./lib/IntelligenceGuard.tsx";
import IntelligenceProvider from "./lib/IntelligenceProvider.tsx";
import ChatApp from "./ChatApp.tsx";
import { installFakeBridge } from "./lib/FakeBridge.ts";

import "@radix-ui/themes/styles.css";

if (import.meta.env.DEV) {
  installFakeBridge();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme>
      <IntelligenceGuard>
        <IntelligenceProvider>
          <ChatApp />
        </IntelligenceProvider>
      </IntelligenceGuard>
    </Theme>
  </StrictMode>,
);
