import { afterEach, describe, expect, it } from "vitest";
import { companyCount, companyOfMlo, setCompanyCountForTests, singleCompany } from "./company";
import { bookOf, canSee } from "@/lib/contacts/service";
import type { User } from "./store";
import type { Contact } from "@/lib/contacts/store";

const owner: User = { id: "boss", email: "b@x.com", name: "Boss", role: "owner", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const theirs = { id: "c1", ownerUserId: "lo2" } as Contact;
const mine = { id: "c2", ownerUserId: "boss" } as Contact;

describe("Company lines (D22)", () => {
  afterEach(() => setCompanyCountForTests(null));
  it("knows the sponsoring company of each loan officer, and that there's one today", () => {
    expect(companyOfMlo("mlo-001")).toBeTruthy();
    expect(companyOfMlo("mlo-001")).toBe(companyOfMlo("mlo-002"));
    expect(companyOfMlo("nobody")).toBeNull();
    expect(companyCount()).toBe(1);
    expect(singleCompany()).toBe(true);
  });
  it("the owner sees every book with one sponsor, and only their own with two", () => {
    expect(bookOf(owner)).toBeUndefined();
    expect(canSee(owner, theirs)).toBe(true);
    setCompanyCountForTests(2);
    expect(bookOf(owner)).toBe("boss");
    expect(canSee(owner, theirs)).toBe(false);
    expect(canSee(owner, mine)).toBe(true);
  });
});
