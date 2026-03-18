/**
 * Group send: only send to group members who are in the sender's contacts.
 * So users without a contact never receive that sender's message (and can't decrypt it).
 */

import type { Contact, Group } from "./identity";

/**
 * Returns group members that are in the sender's contact list.
 * Used so we only post blobs to recipients we "know" (have as contact).
 */
export function getGroupRecipients(group: Group, myContacts: Contact[]): Contact[] {
  const contactKeyHashes = new Set(myContacts.map((c) => c.keyHash));
  return group.members.filter((m) => contactKeyHashes.has(m.keyHash));
}
