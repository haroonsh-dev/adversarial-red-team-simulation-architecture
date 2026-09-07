"use client";

import { Target as TargetIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageStack } from "@/components/shared/PageStack";
import { TargetRegistry } from "@/components/targets/TargetRegistry";

export default function TargetsPage() {
  return (
    <PageStack>
      <PageHeader
        title="Targets"
        description="The AI systems you want tested. ARTSA maps each one before it attacks it."
        icon={<TargetIcon className="h-5 w-5" />}
      />
      <TargetRegistry />
    </PageStack>
  );
}
