import { afterEach, describe, expect, it } from "vitest";
import { serviceForCompany, twilioConfig } from "./twilio";

describe("A texting sender per sponsoring company (D23)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it("uses the company's own Messaging Service, and the shared one only while there's one sponsor", () => {
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MGshared";
    process.env.TWILIO_MESSAGING_SERVICE_SID_1111 = "MGone";
    expect(serviceForCompany("1111", false)).toBe("MGone");
    expect(serviceForCompany("2222", true)).toBe("MGshared");
    expect(serviceForCompany("2222", false)).toBeNull();
    expect(serviceForCompany(null, false)).toBeNull();
  });
  it("counts as connected with only per-company services", () => {
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    process.env.TWILIO_ACCOUNT_SID = "AC1";
    process.env.TWILIO_AUTH_TOKEN = "t";
    process.env.TWILIO_MESSAGING_SERVICE_SID_1111 = "MGone";
    expect(twilioConfig()).toMatchObject({ sid: "AC1", service: "MGone" });
  });
});
