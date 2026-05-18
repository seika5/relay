/**
 * Unit tests for group send: only send to group members who are in the sender's contacts.
 * See context/user-story-local-test.md.
 */

import { describe, it, expect } from "vitest";
import { getGroupRecipients } from "../groupSend";
import type { Contact, Group } from "../identity";

describe("getGroupRecipients", () => {
  const alice: Contact = { keyHash: "aa", publicKey: "pubA" };
  const bob: Contact = { keyHash: "bb", publicKey: "pubB" };
  const carol: Contact = { keyHash: "cc", publicKey: "pubC" };

  it("returns only group members that are in my contacts", () => {
    const group: Group = {
      id: "g1",
      name: "Test",
      members: [alice, bob, carol],
    };
    const myContacts: Contact[] = [alice, carol];
    const got = getGroupRecipients(group, myContacts);
    expect(got).toHaveLength(2);
    expect(got.map((c) => c.keyHash).sort()).toEqual(["aa", "cc"]);
  });

  it("returns empty when I have none of the group members as contacts", () => {
    const group: Group = { id: "g1", members: [alice, bob] };
    const myContacts: Contact[] = [carol];
    const got = getGroupRecipients(group, myContacts);
    expect(got).toHaveLength(0);
  });

  it("returns all when I have everyone as contacts", () => {
    const group: Group = { id: "g1", members: [alice, bob] };
    const myContacts: Contact[] = [alice, bob];
    const got = getGroupRecipients(group, myContacts);
    expect(got).toHaveLength(2);
    expect(got.map((c) => c.keyHash).sort()).toEqual(["aa", "bb"]);
  });

  it("does not duplicate if contact appears twice in group", () => {
    const group: Group = { id: "g1", members: [alice, alice] };
    const myContacts: Contact[] = [alice];
    const got = getGroupRecipients(group, myContacts);
    expect(got).toHaveLength(2);
  });
});
