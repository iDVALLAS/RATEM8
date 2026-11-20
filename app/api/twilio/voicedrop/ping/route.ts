/** GET /api/twilio/voicedrop/ping — lets Command Center confirm the public site runs voicemail drops and M8 calls before placing any call (D57, D58). */
export function GET() {
  return Response.json({ ok: true, feature: "voicemail-drops", features: ["voicemail-drops", "ai-calls"] }, { headers: { "Cache-Control": "no-store" } });
}
