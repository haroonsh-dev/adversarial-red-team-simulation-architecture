import { Suspense } from "react";
import ReplayContent from "./ReplayContent";
import { PageSuspenseFallback } from "@/components/shared/PageSuspenseFallback";

export default function SessionsPage() {
  return (
    <Suspense fallback={<PageSuspenseFallback label="Loading sessions…" />}>
      <ReplayContent />
    </Suspense>
  );
}
