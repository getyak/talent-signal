import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PASSWORD_CREDENTIAL_PATTERN =
  /^scrypt\$v1\$([a-f0-9]{32,128})\$([a-f0-9]{128})$/i;
const KEY_LENGTH = 64;
const DUMMY_SALT = "f1f2f3f4f5f6f7f8f9fafbfcfdfeff00";

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

export async function encodePasswordCredential(
  password: string,
  salt = randomBytes(16).toString("hex"),
): Promise<string> {
  if (!/^[a-f0-9]{32,128}$/i.test(salt)) {
    throw new Error("Password salt must be 16-64 bytes of hexadecimal.");
  }
  const hash = await derive(password, salt.toLowerCase());
  return `scrypt$v1$${salt.toLowerCase()}$${hash.toString("hex")}`;
}

export async function verifyPasswordCredential(
  password: string,
  encoded: string,
): Promise<boolean> {
  const match = PASSWORD_CREDENTIAL_PATTERN.exec(encoded);
  if (!match) {
    await derive(password, DUMMY_SALT);
    return false;
  }
  const [, salt, expectedHex] = match;
  if (!salt || !expectedHex) {
    await derive(password, DUMMY_SALT);
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await derive(password, salt.toLowerCase());
  return timingSafeEqual(actual, expected);
}

export async function consumeDummyPasswordWork(password: string) {
  await derive(password, DUMMY_SALT);
}
