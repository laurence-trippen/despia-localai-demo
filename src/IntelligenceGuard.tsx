import type React from "react";

function IntelligenceGuard({ children }: React.PropsWithChildren) {
  return window.intelligence ? children: <div>No Intelligence API found!</div>;
}

export default IntelligenceGuard;
