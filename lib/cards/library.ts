/**
 * lib/cards/library.ts — starter wording for cards by mail (D53).
 * Short enough to fit a notecard in handwriting. No rates, no offers:
 * these are thank-yous and greetings. Fields: {first}, {myFirst}.
 */
export const CARD_FIELDS = ["first", "myFirst"] as const;
export const CARD_MAX = 380;

export const CARD_STARTERS: { id: string; label: string; message: string }[] = [
  { id: "holidays", label: "Happy holidays", message: "Hi {first},\n\nWishing you and yours a warm and happy holiday season. Thank you for letting me be part of your year.\n\nAll the best,\n{myFirst}" },
  { id: "thanksgiving", label: "Thanksgiving", message: "Hi {first},\n\nThis time of year I think about the people I'm grateful for, and you're on that list. Happy Thanksgiving!\n\n{myFirst}" },
  { id: "new-year", label: "New year", message: "Hi {first},\n\nHere's to a happy and healthy new year. If anything comes up with your home this year, I'm always glad to help.\n\n{myFirst}" },
  { id: "closing", label: "Thank you for closing", message: "Hi {first},\n\nCongratulations on your new home! Thank you for trusting me with your loan. It was a pleasure working with you.\n\n{myFirst}" },
  { id: "anniversary", label: "Home anniversary", message: "Hi {first},\n\nHappy home anniversary! I hope the past year in your home has been a great one.\n\n{myFirst}" },
  { id: "neighborhood", label: "Hello, neighbor", message: "Hi neighbor,\n\nI'm {myFirst}, a loan officer here in the area. If you ever have questions about buying, refinancing or your home's equity, I'm glad to help. No pressure, just straight answers.\n\n{myFirst}" },
  { id: "agent-thanks", label: "Thank you (agent)", message: "Hi {first},\n\nThank you for being such a great partner this year. I enjoy working with you and your clients.\n\n{myFirst}" },
];
