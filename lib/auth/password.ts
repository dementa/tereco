import { randomInt } from "crypto";

// Avoids visually ambiguous characters (0/O, 1/l/I) since these are meant to
// be read off a screen or a printed slip by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Generates a random initial password for a system-provisioned account. */
export function generateTemporaryPassword(length = 6): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += ALPHABET[randomInt(ALPHABET.length)];
  }
  return password;
}
