/**
 * lib/m8/moderation.ts — blocks abusive or harassing input with a polite
 * reply, before any model call (C4). A short, conservative list: threats,
 * abuse aimed at M8 or a person, and sexual harassment. Frustration
 * ("this is so confusing") is never blocked.
 */
const ABUSE: RegExp[] = [
  /\b(?:i(?:'ll| will| am going to|'m going to|m gonna| wanna)?)\s+(?:kill|hurt|shoot|stab|find)\s+(?:you|u|him|her|them|your)\b/i,
  /\bkill\s+(?:yo)?ur\s*self\b|\bkys\b/i,
  /\bf+u+c+k+\s*(?:you|u|off)\b|\bscrew\s+(?:you|u)\b|\bstfu\b/i,
  /\b(?:you(?:'re| are)|ur|u r)\s+(?:a\s+|an\s+)?(?:fucking\s+)?(?:idiot|moron|stupid|useless|worthless|piece of (?:shit|crap)|bitch|retard(?:ed)?)\b/i,
  /\b(?:send|show)\s+(?:me\s+)?(?:nudes|your\s+(?:body|tits|dick))\b/i,
];

export function isAbusive(text: string): boolean {
  const t = text.normalize("NFKC");
  return ABUSE.some((re) => re.test(t));
}
