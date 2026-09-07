import { redirect } from "next/navigation";

/** Old connect URL — Get started is the one setup page. */
export default function ClientOnboardingRedirect() {
  redirect("/get-started");
}
