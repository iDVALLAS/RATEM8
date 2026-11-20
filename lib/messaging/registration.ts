/**
 * lib/messaging/registration.ts — what a sponsoring company tells the
 * carriers when it registers for business texting (10DLC), and where
 * Twilio sends replies (D23; shared with the setup assistant in D50).
 */
import { STEPS } from "@/lib/journey/steps";

export type Company = { name: string; idLabel: string; idNumber: string };

export const webhookUrls = (base: string) => ({ inbound: `${base}/api/twilio/inbound`, status: `${base}/api/twilio/status` });

/** The Vercel variable that holds a company's Messaging Service SID. */
export const serviceEnvName = (c: Company) => `TWILIO_MESSAGING_SERVICE_SID_${c.idNumber.replace(/\D/g, "")}`;

export function sampleMessages(c: Company): string[] {
  const sample = (key: string) => STEPS.find((s) => s.key === key)?.message?.({ first: "Ann", me: "Pat", portal: null }) ?? "";
  return [...["14B", "17", "22"].map(sample).filter(Boolean), `Hi Ann, it's Pat at ${c.name}. Reply STOP to opt out.`];
}

export function registrationWording(c: Company) {
  return {
    brand: `The sponsoring company itself (${c.name}), with its EIN and business address. Each company registers its own brand; texts never go out under another company's brand.`,
    useCase: "Customer Care. Register this one first. Mortgage marketing campaigns are often refused, and a refusal is final; check-ins go by email until a marketing campaign is approved.",
    description: `${c.name} loan officers text their own borrowers and clients about loans in process (application, disclosures, appraisal, underwriting, closing), document requests that point to a secure portal, and replies to messages the client sent. No lead generation, no third-party lists, no lending marketing to anyone without permission.`,
    optIn: `Borrowers give written permission to receive texts from ${c.name} and its loan officer in their loan application (an e-signed consent naming ${c.name}), or by replying YES to a loan officer. The loan officer records each permission, with where the proof is, before any text is sent. Permission is never a condition of getting a loan.`,
    keywords: "Keywords STOP, QUIT, END, CANCEL, UNSUBSCRIBE, REVOKE and OPTOUT (Command Center also honors plain-language requests like \"stop texting me\").",
    help: `${c.name}: loan updates from your loan officer. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.`,
    optOutConfirmation: `You won't get more texts from ${c.name}.`,
    samples: sampleMessages(c),
  };
}
