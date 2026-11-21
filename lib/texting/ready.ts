/**
 * lib/texting/ready.ts — is texting on for this loan officer's company (D76)?
 * The platform's Twilio keys and a Messaging Service for their sponsoring
 * company. Pages use it to say so plainly. SERVER-ONLY.
 */
import type { User } from "@/lib/accounts/store";
import { companyOfMlo, singleCompany } from "@/lib/accounts/company";
import { twilioConfig } from "@/lib/messaging/twilio";
import { textSender } from "./service";

export async function textingReadyFor(user: Pick<User, "mloId">): Promise<boolean> {
  if (!twilioConfig()) return false;
  return !!(await textSender(companyOfMlo(user.mloId), singleCompany()));
}
