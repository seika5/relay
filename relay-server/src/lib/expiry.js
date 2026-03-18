/**
 * 72hr rule: floor time-sent to UTC day, add 72h, add random(0, 1440) minutes.
 * Server uses this at blob receipt time (no sentAt stored).
 * Random is in minutes because the expiry worker runs once per minute.
 */

const MS_72H = 72 * 60 * 60 * 1000;
const MAX_RANDOM_MINUTES = 1440; // 0..1440 inclusive => up to 24h jitter

/**
 * @param {Date} [from = new Date()] Time sent (e.g. blob receipt time).
 * @returns {Date} expiresAt
 */
export function computeExpiresAt(from = new Date()) {
  const sentFloor = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    0, 0, 0, 0
  ));
  const base = new Date(sentFloor.getTime() + MS_72H);
  const randomMinutes = Math.floor(Math.random() * (MAX_RANDOM_MINUTES + 1)); // 0..1440 inclusive
  return new Date(base.getTime() + randomMinutes * 60 * 1000);
}
