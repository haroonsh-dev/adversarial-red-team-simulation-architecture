import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageStack } from "@/components/shared/PageStack";
import { GuardCapabilityMap } from "@/components/sandbox/GuardCapabilityMap";
import { Button } from "@/components/ui/button";

export default function GuardCapabilitiesPage() {
  return (
    <PageStack>
      <PageHeader
        title="What we stop"
        description="What ARTSA can stop — mapped to the screens you use to test and roll out."
        icon={<Shield className="h-5 w-5" />}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/sandbox">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sandbox
            </Link>
          </Button>
        }
      />
      <GuardCapabilityMap defaultCollapsed className="surface-panel" />
    </PageStack>
  );
}
