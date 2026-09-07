import { redirect } from "next/navigation";

/** Targets moved to the Discover layer — it is not a Red Team-only concept. */
export default function LegacyRedTeamTargetsPage() {
  redirect("/targets");
}
