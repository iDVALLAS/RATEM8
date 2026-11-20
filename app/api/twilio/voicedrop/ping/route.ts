/** GET /api/twilio/voicedrop/ping — lets Command Center confirm the public site runs voicemail drops before placing any call (D57). */
export function GET() {
  return Response.json({ ok: true, feature: "voicemail-drops" }, { headers: { "Cache-Control": "no-store" } });
}
