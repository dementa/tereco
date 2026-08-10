#!/usr/bin/env node
/**
 * Generates the Ed25519 keypair that signs offline assessment packages.
 *
 *   node scripts/gen-package-keys.mjs [keyId]
 *
 * The PRIVATE key goes in the deployment environment and nowhere else.
 * The PUBLIC key goes into desktop/keys/package-keys.json, which ships inside
 * TERECO Collect so a lab machine can verify a grant with no network and no
 * secret of its own.
 *
 * Rotation: run this again with a NEW key id and add the public key alongside
 * the existing one. Machines that have not been updated still verify grants
 * signed by the key they already know, so a rotation does not brick a lab that
 * has not been reinstalled yet. Only remove an old public key once every
 * machine has been updated AND every grant signed with it has expired
 * (PACKAGE_GRANT_TTL_MS, currently 14 days).
 */

import { generateKeyPairSync } from "node:crypto";

const keyId = process.argv[2] ?? `tereco-${new Date().toISOString().slice(0, 10)}`;

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

console.log(`\nKey id: ${keyId}\n`);

console.log("─── Deployment environment (private — never commit) ───\n");
console.log(`TERECO_PACKAGE_KEY_ID=${keyId}`);
// Escaped newlines because most hosting dashboards store env values on one
// line; lib/offline/keys.ts unescapes them on read.
console.log(`TERECO_PACKAGE_SIGNING_KEY="${privatePem.trimEnd().replace(/\n/g, "\\n")}"\n`);

console.log("─── desktop/keys/package-keys.json (public — safe to commit) ───\n");
console.log(JSON.stringify({ [keyId]: publicPem.trimEnd() }, null, 2));
console.log();
