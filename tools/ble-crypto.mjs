// =============================================================================
// ble-crypto.mjs — OSPP BLE v0.6.0 cryptographic primitives + RFC anchors
// =============================================================================
//
// Shared by `generate-ble-vectors.mjs` (oracle producer) and
// `verify-ble-crypto.mjs` (oracle re-deriver). The primitives here implement
// the byte-exact pins of 06-security.md §6.5 / §6.5.1 / §6.5.3:
//
//   Pin 1  ECDH P-256 shared secret = X big-endian, 32 B, zero-left-padded.
//   Pin 3  Key schedule: IKM = es‖ee‖appNonce‖stationNonce, salt _V2,
//          info = LP(deviceId)‖LP(transcriptHash), HKDF-SHA256 → SessionKey.
//   Pin 4  transcriptHash = SHA-256(LP16(helloWire)‖LP16(challengeWire)).
//   Pin 5  AEAD nonce96 = 0x00000000 ‖ U64BE(counter).
//   Pin 6  AEAD = ChaCha20-Poly1305 IETF (RFC 8439), 12-byte nonce.
//   Pin 7  AAD = transcriptHash.
//
// ─── ANTI-CIRCULARITY ───────────────────────────────────────────────────────
// The whole value of this corpus is that it is a CROSS-PLATFORM ORACLE. A
// generator that "verifies" its own output with its own code proves nothing.
// So every primitive below is anchored on an EXTERNAL TRUTH we do not control —
// the published test vectors of RFC 5903 (ECDH P-256), RFC 5869 (HKDF-SHA256),
// and RFC 8439 (ChaCha20-Poly1305 IETF). `runRfcAnchors()` reproduces each
// RFC vector byte-for-byte and THROWS if any primitive fails to. Only after the
// primitives reproduce the RFCs is the OSPP glue (key schedule, transcript,
// cert, AEAD frame) built on top of validated ends.
//
// Defence-in-depth: each primitive is computed with Node's OpenSSL-backed
// `crypto` AND cross-checked against an INDEPENDENT pure-JS implementation
// (@noble/curves, @noble/hashes — the libraries the SDK/app will use). Node and
// @noble agreeing AND both reproducing the RFC vector is a far stronger guard
// than a single implementation. (ChaCha20-Poly1305 has only the Node impl here
// — @noble/ciphers is not a spec-repo dependency — so it is anchored on RFC 8439
// alone; that is stated honestly rather than faked with a second copy.)
// =============================================================================

import crypto from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';

const b = (hex) => Buffer.from(hex, 'hex');
const eqBuf = (x, y) => Buffer.isBuffer(x) && Buffer.isBuffer(y) && x.length === y.length && crypto.timingSafeEqual(x, y);

// ─────────────────────────────────────────────────────────────────────────────
// Byte helpers
// ─────────────────────────────────────────────────────────────────────────────

export function sha256(...chunks) {
  const h = crypto.createHash('sha256');
  for (const c of chunks) h.update(c);
  return h.digest();
}

export function hmacSha256(key, ...chunks) {
  const h = crypto.createHmac('sha256', key);
  for (const c of chunks) h.update(c);
  return h.digest();
}

export function u16be(n) {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error(`u16be out of range: ${n}`);
  const out = Buffer.alloc(2);
  out.writeUInt16BE(n);
  return out;
}

export function u64be(n) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(n));
  return out;
}

// LP(x) = U16BE(byteLength(x)) ‖ x — the single length-prefix used for the HKDF
// `info`, the transcript, and the sessionProof (06-security.md §6.5 Pin 3/4, §6.5.1).
export function lp(x) {
  const buf = Buffer.isBuffer(x) ? x : Buffer.from(x, 'utf-8');
  return Buffer.concat([u16be(buf.length), buf]);
}

// Left-pad a big-endian byte string to exactly 32 bytes (Pin 1).
export function leftPad32(buf) {
  if (buf.length > 32) throw new Error(`leftPad32: input ${buf.length} > 32 bytes`);
  if (buf.length === 32) return Buffer.from(buf);
  const out = Buffer.alloc(32);
  Buffer.from(buf).copy(out, 32 - buf.length);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pin 1 — ECDH P-256 shared secret (X-only, big-endian, 32 B, zero-left-padded)
// ─────────────────────────────────────────────────────────────────────────────
//
// Inputs are raw bytes. `peerPub` may be compressed (33 B) or uncompressed
// (65 B) SEC1. Returns the 32-byte X coordinate. Computed with Node ECDH and
// cross-checked against @noble; a mismatch throws (never silently picks one).

function uncompressPub(peerPub) {
  const buf = Buffer.from(peerPub);
  if (buf.length === 65 && buf[0] === 0x04) return buf;
  // Decompress (compressed SEC1 → uncompressed) via @noble.
  return Buffer.from(p256.Point.fromBytes(buf).toBytes(false)); // 65-byte uncompressed
}

// §6.5.2 Public-key validation (Normative): before any ECDH, a received P-256
// public key MUST decompress to a valid point on the curve and MUST NOT be the
// identity / point at infinity. Returns the decoded point; throws on a bad key.
// `pub` may be Base64 (the wire form) or raw bytes.
export function validatePublicKey(pub) {
  const buf = Buffer.isBuffer(pub) ? pub : Buffer.from(pub, 'base64');
  const pt = p256.Point.fromBytes(buf); // throws on a non-decodable / off-curve X
  pt.assertValidity();
  if (pt.is0()) throw new Error('public key is the identity / point at infinity');
  return pt;
}

export function ecdhSharedX(privBytes, peerPub) {
  const priv = Buffer.from(privBytes);
  const peerUncompressed = uncompressPub(Buffer.from(peerPub));

  // Primary: Node (OpenSSL). computeSecret returns the raw X; left-pad per Pin 1.
  const ec = crypto.createECDH('prime256v1');
  ec.setPrivateKey(priv);
  const nodeX = leftPad32(ec.computeSecret(peerUncompressed));

  // Cross-check: @noble. getSharedSecret returns a 33-byte compressed point
  // (0x02/0x03 ‖ X) — strip the prefix and left-pad (Pin 1's documented
  // @noble normalisation). Be tolerant of 32/65-byte returns across versions.
  const nobleShared = Buffer.from(p256.getSharedSecret(priv, Buffer.from(peerPub)));
  let nobleX;
  if (nobleShared.length === 33) nobleX = leftPad32(nobleShared.subarray(1));
  else if (nobleShared.length === 65) nobleX = leftPad32(nobleShared.subarray(1, 33));
  else if (nobleShared.length === 32) nobleX = leftPad32(nobleShared);
  else throw new Error(`@noble getSharedSecret unexpected length ${nobleShared.length}`);

  if (!eqBuf(nodeX, nobleX)) {
    throw new Error(`ECDH cross-impl mismatch: node=${nodeX.toString('hex')} noble=${nobleX.toString('hex')}`);
  }
  return nodeX;
}

// Deterministic P-256 test key from a label: scalar = SHA-256(label) reduced
// into [1, n-1] (rehash-with-counter on the negligible chance it is out of
// range or zero). Returns raw private scalar (32 B) + compressed/uncompressed
// public points. Mirrors the existing convention (session-test-key.bin =
// SHA-256("OSPP_TEST_SESSION_KEY_V1")).
export function deriveKeyPair(label) {
  let scalar = sha256(Buffer.from(label, 'utf-8'));
  for (let i = 0; !isValidScalar(scalar); i++) {
    if (i > 1000) throw new Error(`could not derive a valid scalar for ${label}`);
    scalar = sha256(scalar, Buffer.from([i]));
  }
  const pubCompressed = Buffer.from(p256.getPublicKey(scalar, true));   // 33 B
  const pubUncompressed = Buffer.from(p256.getPublicKey(scalar, false)); // 65 B
  return { label, priv: scalar, pubCompressed, pubUncompressed };
}

function isValidScalar(scalar) {
  try {
    return p256.utils.isValidSecretKey
      ? p256.utils.isValidSecretKey(scalar)
      : (p256.getPublicKey(scalar, true), true);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HKDF-SHA256 (RFC 5869) — extract / expand / full
// ─────────────────────────────────────────────────────────────────────────────

export function hkdfExtract(salt, ikm) {
  return hmacSha256(salt, ikm); // PRK = HMAC-Hash(salt, IKM)
}

export function hkdfExpand(prk, info, length) {
  const out = [];
  let t = Buffer.alloc(0);
  let counter = 0;
  let total = 0;
  while (total < length) {
    counter++;
    if (counter > 255) throw new Error('HKDF-Expand: length too large');
    t = hmacSha256(prk, t, info, Buffer.from([counter]));
    out.push(t);
    total += t.length;
  }
  return Buffer.concat(out).subarray(0, length);
}

export function hkdf(salt, ikm, info, length) {
  // Full HKDF, cross-checked against Node hkdfSync AND @noble hkdf.
  const mine = hkdfExpand(hkdfExtract(salt, ikm), info, length);
  const node = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));
  const noble = Buffer.from(nobleHkdf(nobleSha256, ikm, salt, info, length));
  if (!eqBuf(mine, node) || !eqBuf(mine, noble)) {
    throw new Error(`HKDF cross-impl mismatch: mine=${mine.toString('hex')} node=${node.toString('hex')} noble=${noble.toString('hex')}`);
  }
  return mine;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pin 5/6/7 — ChaCha20-Poly1305 IETF (RFC 8439) AEAD
// ─────────────────────────────────────────────────────────────────────────────

// nonce96 = 0x00000000 ‖ U64BE(counter)  (Pin 5)
export function nonce96(counter) {
  return Buffer.concat([Buffer.alloc(4), u64be(counter)]);
}

// Returns sealed = ciphertext ‖ 16-byte Poly1305 tag (libsodium/@noble order).
export function chachaPolySeal(key, nonce, plaintext, aad) {
  const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  if (aad && aad.length) cipher.setAAD(aad, { plaintextLength: plaintext.length });
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ct, tag]);
}

// Opens sealed (ct‖tag); throws on auth failure.
export function chachaPolyOpen(key, nonce, sealed, aad) {
  if (sealed.length < 16) throw new Error('sealed shorter than the 16-byte tag');
  const ct = sealed.subarray(0, sealed.length - 16);
  const tag = sealed.subarray(sealed.length - 16);
  const decipher = crypto.createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  if (aad && aad.length) decipher.setAAD(aad, { plaintextLength: ct.length });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ─────────────────────────────────────────────────────────────────────────────
// RFC ANCHORS — the external truth. Reproduced byte-for-byte or we throw.
// ─────────────────────────────────────────────────────────────────────────────

// RFC 5903 §8.1 — 256-bit Random ECP Group (ECDH P-256).
const RFC5903 = {
  i: 'C88F01F510D9AC3F70A292DAA2316DE544E9AAB8AFE84049C62A9C57862D1433',
  gix: 'DAD0B65394221CF9B051E1FECA5787D098DFE637FC90B9EF945D0C3772581180',
  giy: '5271A0461CDB8252D61F1C456FA3E59AB1F45B33ACCF5F58389E0577B8990BB3',
  r: 'C6EF9C5D78AE012A011164ACB397CE2088685D8F06BF9BE0B283AB46476BEE53',
  grx: 'D12DFB5289C8D4F81208B70270398C342296970A0BCCB74C736FC7554494BF63',
  gry: '56FBF3CA366CC23E8157854C13C58D6AAC23F046ADA30F8353E74F33039872AB',
  girx: 'D6840F6B42F6EDAFD13116E0E12565202FEF8E9ECE7DCE03812464D04B9442DE',
};

// RFC 5869 — HKDF-SHA256 test cases (Appendix A.1, A.2). A.2's long IKM/salt/
// info are byte ranges in the RFC; reconstruct them programmatically to avoid
// transcription error (matches the RFC's own description verbatim).
const seq = (start, end) => Buffer.from(Array.from({ length: end - start + 1 }, (_, k) => start + k));
const RFC5869 = [
  {
    name: 'A.1',
    ikm: b('0b'.repeat(22)),
    salt: b('000102030405060708090a0b0c'),
    info: b('f0f1f2f3f4f5f6f7f8f9'),
    L: 42,
    prk: '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5',
    okm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
  },
  {
    name: 'A.2',
    ikm: seq(0x00, 0x4f),
    salt: seq(0x60, 0xaf),
    info: seq(0xb0, 0xff),
    L: 82,
    prk: '06a6b88c5853361a06104c9ceb35b45cef760014904671014a193f40c15fc244',
    okm: 'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87',
  },
];

// RFC 8439 §2.8.2 — AEAD_CHACHA20_POLY1305 example.
const RFC8439 = {
  key: seq(0x80, 0x9f), // 32 bytes 0x80..0x9f
  nonce: b('070000004041424344454647'),
  aad: b('50515253c0c1c2c3c4c5c6c7'),
  plaintext: Buffer.from(
    "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
    'utf-8',
  ),
  ciphertext:
    'd31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6' +
    '3dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b36' +
    '92ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc' +
    '3ff4def08e4b7a9de576d26586cec64b6116',
  tag: '1ae10b594f09e26a7e902ecbd0600691',
};

// Run all anchors. Returns a structured report; throws on the FIRST mismatch
// (a wrong primitive must STOP the run, never silently ship a bad oracle).
export function runRfcAnchors() {
  const report = [];

  // ── RFC 5903 (ECDH P-256) ──────────────────────────────────────────────
  const iPriv = b(RFC5903.i);
  const rPriv = b(RFC5903.r);
  const giPub = Buffer.concat([Buffer.from([0x04]), b(RFC5903.gix), b(RFC5903.giy)]);
  const grPub = Buffer.concat([Buffer.from([0x04]), b(RFC5903.grx), b(RFC5903.gry)]);
  const sharedIR = ecdhSharedX(iPriv, grPub); // ECDH(i, responderPub)
  const sharedRI = ecdhSharedX(rPriv, giPub); // ECDH(r, initiatorPub)
  const expectX = b(RFC5903.girx);
  if (!eqBuf(sharedIR, expectX)) throw new Error(`RFC 5903: ECDH(i,gr) X = ${sharedIR.toString('hex')} != ${RFC5903.girx.toLowerCase()}`);
  if (!eqBuf(sharedRI, expectX)) throw new Error(`RFC 5903: ECDH(r,gi) X = ${sharedRI.toString('hex')} != ${RFC5903.girx.toLowerCase()}`);
  // Independent confirmation that deriveKeyPair's public-key derivation agrees
  // with the RFC's published public key for the same private scalar.
  const giDerived = Buffer.from(p256.getPublicKey(iPriv, false));
  if (!eqBuf(giDerived, giPub)) throw new Error('RFC 5903: derived initiator public key != RFC gi');
  report.push({ rfc: 'RFC 5903 §8.1', primitive: 'ECDH P-256 (X-only, 32B, Pin 1)', sharedSecretX: sharedIR.toString('hex'), bothDirectionsMatch: true });

  // ── RFC 5869 (HKDF-SHA256) ─────────────────────────────────────────────
  for (const tc of RFC5869) {
    const prk = hkdfExtract(tc.salt, tc.ikm);
    if (prk.toString('hex') !== tc.prk) throw new Error(`RFC 5869 ${tc.name}: PRK = ${prk.toString('hex')} != ${tc.prk}`);
    const okmExpand = hkdfExpand(prk, tc.info, tc.L);
    if (okmExpand.toString('hex') !== tc.okm) throw new Error(`RFC 5869 ${tc.name}: Expand(PRK) OKM = ${okmExpand.toString('hex')} != ${tc.okm}`);
    const okmFull = hkdf(tc.salt, tc.ikm, tc.info, tc.L); // also cross-checks node + noble
    if (okmFull.toString('hex') !== tc.okm) throw new Error(`RFC 5869 ${tc.name}: full HKDF OKM mismatch`);
    report.push({ rfc: `RFC 5869 ${tc.name}`, primitive: 'HKDF-SHA256 (extract+expand, Pin 3)', prk: prk.toString('hex'), okm: okmFull.toString('hex') });
  }

  // ── RFC 8439 (ChaCha20-Poly1305 IETF) ──────────────────────────────────
  const sealed = chachaPolySeal(RFC8439.key, RFC8439.nonce, RFC8439.plaintext, RFC8439.aad);
  const gotCt = sealed.subarray(0, sealed.length - 16).toString('hex');
  const gotTag = sealed.subarray(sealed.length - 16).toString('hex');
  if (gotCt !== RFC8439.ciphertext) throw new Error(`RFC 8439: ciphertext mismatch\n got ${gotCt}\n exp ${RFC8439.ciphertext}`);
  if (gotTag !== RFC8439.tag) throw new Error(`RFC 8439: tag = ${gotTag} != ${RFC8439.tag}`);
  // Round-trip: open must return the exact plaintext.
  const opened = chachaPolyOpen(RFC8439.key, RFC8439.nonce, sealed, RFC8439.aad);
  if (!eqBuf(opened, RFC8439.plaintext)) throw new Error('RFC 8439: open(seal(pt)) != pt');
  report.push({ rfc: 'RFC 8439 §2.8.2', primitive: 'ChaCha20-Poly1305 IETF (12B nonce, Pin 6)', ciphertext: gotCt, tag: gotTag, roundTrip: true });

  return report;
}

export const RFC_ANCHOR_SOURCES = {
  ecdh: 'RFC 5903 §8.1 (256-bit Random ECP Group)',
  hkdf: 'RFC 5869 Appendix A.1 + A.2 (SHA-256)',
  aead: 'RFC 8439 §2.8.2 (AEAD_CHACHA20_POLY1305)',
};
