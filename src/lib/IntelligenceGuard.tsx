import type React from "react";

function IntelligenceGuard({
  children,
  disable = false,
}: {
  children: React.ReactNode;
  disable?: boolean;
}) {
  if (disable) return children;

  return window.intelligence ? children : <div>No Intelligence API found!</div>;
}

export default IntelligenceGuard;
