// =============================================================================
// ble-crypto.mjs — OSPP BLE cryptographic primitives + RFC anchors
// =============================================================================
//
// Shared by `generate-ble-vectors.mjs` (oracle producer), `verify-ble-crypto.mjs`
// (oracle re-deriver) and the signature tools (`sign-example.mjs`,
// `sign-inline-md.mjs`, `verify-example-signatures.mjs`). The primitives here
// implement the byte-exact construction of 06-security.md §6.5 – §6.5.4:
//
//   Pin 1  ECDH P-256 shared secret = X big-endian, 32 B, zero-left-padded.
//   Pin 2  Bare public keys on the wire are compressed SEC1, Base64 (44 chars).
//   Pin 3  Key schedule: IKM = ee‖appNonce‖stationNonce (96 B), salt _V3,
//          info = LP(transcriptHash), HKDF-SHA256 → SessionKey.
//   Pin 4  transcriptHash = SHA-256(LP16(helloWire)‖LP16(challengeWire)), over
//          the full wire Challenge, its stationSignature included.
//   Pin 5  AEAD nonce96 = 0x00000000 ‖ U64BE(counter).
//   Pin 6  AEAD = ChaCha20-Poly1305 IETF (RFC 8439), 12-byte nonce.
//   Pin 7  AAD = transcriptHash.
//   §6.5.2 the station's signature with its certificate key over content it
//          builds itself (TLS 1.3 CertificateVerify shape, OSPP context), and
//          the app's verification gate, steps 1–6.
//   §6.5.4 the device proof over the presentation, both formats.
//
// The ephemeral-static derivation that preceded this one (a static BLE key
// certified by a server-signed StationIdentity, IKM = es‖ee‖…, salt _V2, the
// device identifier in `info`) is replaced; nothing here computes it.
//
// ─── ANTI-CIRCULARITY ───────────────────────────────────────────────────────
// The whole value of this corpus is that it is a CROSS-PLATFORM ORACLE. A
// generator that "verifies" its own output with its own code proves nothing.
// So every primitive below is anchored on an EXTERNAL TRUTH not controlled
// here — the published test vectors of RFC 5903 (ECDH P-256), RFC 5869
// (HKDF-SHA256), and RFC 8439 (ChaCha20-Poly1305 IETF). `runRfcAnchors()`
// reproduces each RFC vector byte-for-byte and THROWS if any primitive fails to.
// Only after the primitives reproduce the RFCs is the OSPP glue (key schedule,
// transcript, station signature, device proof, AEAD frame) built on top of
// validated ends.
//
// Defence-in-depth: each primitive is computed with Node's OpenSSL-backed
// `crypto` AND cross-checked against an INDEPENDENT pure-JS implementation
// (@noble/curves, @noble/hashes — the libraries the SDK/app use). Node and
// @noble agreeing AND both reproducing the RFC vector is a far stronger guard
// than a single implementation. (ChaCha20-Poly1305 has only the Node impl here
// — @noble/ciphers is not a spec-repo dependency — so it is anchored on RFC 8439
// alone; that is stated rather than faked with a second copy.) The X.509 and
// CRL reading below is a minimal DER walker of its own, cross-checked against
// Node's `X509Certificate` where Node exposes the same fact (issuer, signature,
// extended key usage); the generator additionally cross-checks the chain,
// validity and revocation verdicts against the `openssl verify` command line.
// =============================================================================

import crypto from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { ecdsaSign, ecdsaVerify } from '@ospp/protocol/server';
import { canonicalForm } from './canonical-form.mjs';

const b = (hex) => Buffer.from(hex, 'hex');
const eqBuf = (x, y) => Buffer.isBuffer(x) && Buffer.isBuffer(y) && x.length === y.length && crypto.timingSafeEqual(x, y);

// ─────────────────────────────────────────────────────────────────────────────
// Constants of the construction (06-security.md §6.5 – §6.5.4, §4.4)
// ─────────────────────────────────────────────────────────────────────────────

export const BLE_VERSION = '0.3.0';
export const SALT_V3 = Buffer.from('OSPP_BLE_SESSION_V3', 'utf-8');
export const KDF_LABEL_A2S = Buffer.from('OSPP-BLE-v0.6.0-key-app-to-station', 'utf-8');
export const KDF_LABEL_S2A = Buffer.from('OSPP-BLE-v0.6.0-key-station-to-app', 'utf-8');
export const SESSION_CONFIRM_LABEL = Buffer.from('AuthResponse_OK', 'utf-8');
export const STATION_SIGNATURE_CONTEXT = 'OSPP BLE station, Challenge signature';
export const DEVICE_PROOF_LABEL = 'OSPP BLE device proof v1';
export const OID_OSPP_BLE_STATION = '2.25.57399134409609390163880398392748054115';
export const OID_CLIENT_AUTH = '1.3.6.1.5.5.7.3.2';
const OID_KEY_USAGE = '2.5.29.15';
const OID_EXT_KEY_USAGE = '2.5.29.37';
const OID_COMMON_NAME = '2.5.4.3';
const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';
const OID_PRIME256V1 = '1.2.840.10045.3.1.7';
const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';

// The OSPP error the app surfaces on any failure of its verification gate (§6.5.2 step 6).
export const GATE_ERROR = { errorCode: 2013, errorText: 'BLE_AUTH_FAILED' };

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

// LP(x) = U16BE(byteLength(x)) ‖ x — the one length prefix of the handshake: the
// HKDF `info`, the transcript, the station's signed content, the sessionProof and
// the device proof (06-security.md §6.5 Pin 3).
export function lp(x) {
  const buf = Buffer.isBuffer(x) ? x : Buffer.from(x, 'utf-8');
  return Buffer.concat([u16be(buf.length), buf]);
}

// decimal(x): the shortest base-10 ASCII string of a non-negative integer
// (ble-handshake.md §4.1) — no leading zeros, no sign.
export function decimal(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`decimal(): not a non-negative integer: ${n}`);
  return String(n);
}

// Left-pad a big-endian byte string to exactly 32 bytes (Pin 1).
export function leftPad32(buf) {
  if (buf.length > 32) throw new Error(`leftPad32: input ${buf.length} > 32 bytes`);
  if (buf.length === 32) return Buffer.from(buf);
  const out = Buffer.alloc(32);
  Buffer.from(buf).copy(out, 32 - buf.length);
  return out;
}

// The bytes of a message as it travels: compact JSON, in the key order of the
// object. The transcript (Pin 4) hashes exactly these octets.
export const wireBytes = (obj) => Buffer.from(JSON.stringify(obj), 'utf-8');

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

// Public-key validation (06-security.md §6.5, Normative): before any ECDH, a
// received P-256 public key MUST decompress to a valid point on the curve and
// MUST NOT be the identity / point at infinity. Returns the decoded point;
// throws on a bad key. `pub` may be Base64 (the wire form) or raw bytes.
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
  // @noble normalisation). Tolerant of 32/65-byte returns across versions.
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

// A raw P-256 key pair as Node KeyObjects, for signing with @ospp/protocol's
// ecdsaSign (RFC 6979, low-s) and verifying with node:crypto.
export function p256KeyObjects(privScalar) {
  const pubU = Buffer.from(p256.getPublicKey(privScalar, false));
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: pubU.subarray(1, 33).toString('base64url'),
    y: pubU.subarray(33, 65).toString('base64url'),
    d: Buffer.from(privScalar).toString('base64url'),
  };
  const privateKey = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const { d: _d, ...pubJwk } = jwk;
  const publicKey = crypto.createPublicKey({ key: pubJwk, format: 'jwk' });
  return { privateKey, publicKey };
}

// The SPKI PEM of a compressed or uncompressed SEC1 P-256 point.
export function publicKeyPemFromSec1(pub) {
  const buf = Buffer.isBuffer(pub) ? pub : Buffer.from(pub, 'base64');
  const u = Buffer.from(validatePublicKey(buf).toBytes(false));
  const key = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: u.subarray(1, 33).toString('base64url'), y: u.subarray(33, 65).toString('base64url') },
    format: 'jwk',
  });
  return key.export({ type: 'spki', format: 'pem' });
}

// ─────────────────────────────────────────────────────────────────────────────
// The test device key (conformance/test-keys/README.md, "OfflinePass fixtures"):
// scalar = SHA-256("OSPP_TEST_DEVICE_KEY_V1:" + deviceId) as a big-endian
// integer, mod (n − 1), plus 1. No device key file is committed.
// ─────────────────────────────────────────────────────────────────────────────

const P256_N = p256.Point.CURVE().n;

export function deviceTestKey(deviceId) {
  const h = BigInt('0x' + sha256(Buffer.from(`OSPP_TEST_DEVICE_KEY_V1:${deviceId}`, 'utf-8')).toString('hex'));
  const d = (h % (P256_N - 1n)) + 1n;
  const priv = Buffer.from(d.toString(16).padStart(64, '0'), 'hex');
  const pubCompressed = Buffer.from(p256.getPublicKey(priv, true));
  return { priv, pubCompressed, devicePublicKey: pubCompressed.toString('base64'), ...p256KeyObjects(priv) };
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
// Pin 4 + Pin 3 — transcript and key schedule
// ─────────────────────────────────────────────────────────────────────────────

// transcriptHash = SHA-256( LP16(helloWire) ‖ LP16(challengeWire) ) over the raw
// reassembled wire octets — the Challenge as sent, its stationSignature included.
export function transcriptHashOf(helloWire, challengeWire) {
  return sha256(lp(helloWire), lp(challengeWire));
}

// IKM = ee ‖ appNonce ‖ stationNonce; salt _V3; info = LP(transcriptHash).
export function deriveSessionKeys({ ee, appNonce, stationNonce, transcriptHash }) {
  for (const [name, v] of [['ee', ee], ['appNonce', appNonce], ['stationNonce', stationNonce], ['transcriptHash', transcriptHash]]) {
    if (!Buffer.isBuffer(v) || v.length !== 32) throw new Error(`deriveSessionKeys: ${name} must be 32 bytes`);
  }
  const ikm = Buffer.concat([ee, appNonce, stationNonce]); // 3 × 32 = 96 bytes
  const info = lp(transcriptHash);
  const sessionKey = hkdf(SALT_V3, ikm, info, 32);
  return {
    ikm,
    info,
    sessionKey,
    kAppToStation: hkdfExpand(sessionKey, KDF_LABEL_A2S, 32),
    kStationToApp: hkdfExpand(sessionKey, KDF_LABEL_S2A, 32),
    sessionKeyConfirmation: hmacSha256(sessionKey, SESSION_CONFIRM_LABEL).toString('base64'),
  };
}

// sessionProof = HMAC-SHA256(key, LP("OfflineAuthRequest") ‖ LP(passId) ‖ LP(decimal(counter)))
// (ble-handshake.md §4.1).
export function sessionProofMessage(passId, counter) {
  return Buffer.concat([lp('OfflineAuthRequest'), lp(passId), lp(decimal(counter))]);
}
export function sessionProofOf(key, passId, counter) {
  return hmacSha256(key, sessionProofMessage(passId, counter)).toString('base64');
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
// ECDSA helpers — DER signatures, low-s (06-security.md §6.2 Note 6)
// ─────────────────────────────────────────────────────────────────────────────

// Parse a DER ECDSA-Sig-Value into {r, s} BigInts; throws on malformed DER.
export function parseEcdsaDer(sigB64) {
  const der = Buffer.from(sigB64, 'base64');
  const top = readTlv(der, 0);
  if (top.tag !== 0x30 || top.end !== der.length) throw new Error('signature is not one DER SEQUENCE');
  const r = readTlv(der, top.start);
  const s = readTlv(der, r.end);
  if (r.tag !== 0x02 || s.tag !== 0x02 || s.end !== top.end) throw new Error('signature is not SEQUENCE { INTEGER r, INTEGER s }');
  return { r: BigInt('0x' + (der.subarray(r.start, r.end).toString('hex') || '00')), s: BigInt('0x' + (der.subarray(s.start, s.end).toString('hex') || '00')) };
}

// Low-s is a signing-time requirement (Note 6): every signature this corpus
// produces must satisfy it, and the generator and verifier assert it of their
// own output. A verifier of a peer's signature accepts either half.
export function isLowS(sigB64, order = P256_N) {
  return parseEcdsaDer(sigB64).s <= order / 2n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DER walker — X.509 certificates and CRLs (RFC 5280)
// ─────────────────────────────────────────────────────────────────────────────

export function readTlv(buf, pos) {
  if (pos + 2 > buf.length) throw new Error(`DER: truncated header at ${pos}`);
  const tag = buf[pos];
  if ((tag & 0x1f) === 0x1f) throw new Error('DER: multi-byte tags are not used by X.509 and are not supported');
  let len = buf[pos + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error(`DER: unsupported length form at ${pos}`);
    if (pos + 2 + n > buf.length) throw new Error(`DER: truncated length at ${pos}`);
    len = 0;
    for (let i = 0; i < n; i++) len = (len * 256) + buf[pos + 2 + i];
    hdr = 2 + n;
  }
  const start = pos + hdr;
  const end = start + len;
  if (end > buf.length) throw new Error(`DER: value overruns buffer at ${pos}`);
  return { tag, start, end, hdr, raw: buf.subarray(pos, end), value: buf.subarray(start, end) };
}

function children(buf, tlv) {
  const out = [];
  for (let p = tlv.start; p < tlv.end;) {
    const c = readTlv(buf, p);
    out.push(c);
    p = c.end;
  }
  return out;
}

function oidToString(bytes) {
  const parts = [];
  let v = 0n;
  for (let i = 0; i < bytes.length; i++) {
    v = (v << 7n) | BigInt(bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      if (parts.length === 0) {
        const first = v < 80n ? v / 40n : 2n;
        parts.push(first, v - first * 40n);
      } else {
        parts.push(v);
      }
      v = 0n;
    }
  }
  return parts.map(String).join('.');
}

function derTime(buf, tlv) {
  const s = tlv.value.toString('ascii');
  let m;
  if (tlv.tag === 0x17 && (m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/))) {
    const yy = Number(m[1]);
    return new Date(Date.UTC(yy >= 50 ? 1900 + yy : 2000 + yy, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  }
  if (tlv.tag === 0x18 && (m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/))) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  }
  throw new Error(`DER: unsupported time encoding ${s}`);
}

function nameCommonName(buf, nameTlv) {
  for (const rdn of children(buf, nameTlv)) {
    for (const atv of children(buf, rdn)) {
      const [oid, val] = children(buf, atv);
      if (oidToString(oid.value) === OID_COMMON_NAME) return val.value.toString('utf-8');
    }
  }
  return null;
}

function serialHex(intTlv) {
  let h = intTlv.value.toString('hex').replace(/^(00)+(?=..)/, '');
  return h.toUpperCase();
}

export function pemToDer(pem) {
  const m = String(pem).match(/-----BEGIN [A-Z0-9 ]+-----([\s\S]+?)-----END [A-Z0-9 ]+-----/);
  if (!m) throw new Error('not a PEM block');
  return Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
}

export function derToPem(der, label) {
  const b64 = Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

// Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
export function parseCertificate(der) {
  der = Buffer.from(der);
  const cert = readTlv(der, 0);
  if (cert.tag !== 0x30 || cert.end !== der.length) throw new Error('certificate is not one DER SEQUENCE');
  const [tbs, sigAlg, sigVal] = children(der, cert);
  const t = children(der, tbs);
  let i = 0;
  let version = 1;
  if (t[i].tag === 0xa0) { version = Number(readTlv(der, t[i].start).value[0]) + 1; i++; }
  const serial = t[i++];
  i++; // signature AlgorithmIdentifier inside tbs
  const issuer = t[i++];
  const validity = t[i++];
  const subject = t[i++];
  const spki = t[i++];
  let extensions = null;
  for (; i < t.length; i++) if (t[i].tag === 0xa3) extensions = readTlv(der, t[i].start);
  const [nb, na] = children(der, validity);
  const [spkiAlg] = children(der, spki);
  const spkiAlgParts = children(der, spkiAlg);
  const keyAlg = oidToString(spkiAlgParts[0].value);
  const keyCurve = spkiAlgParts[1] && spkiAlgParts[1].tag === 0x06 ? oidToString(spkiAlgParts[1].value) : null;
  const ext = new Map();
  if (extensions) {
    for (const e of children(der, extensions)) {
      const parts = children(der, e);
      const oid = oidToString(parts[0].value);
      const critical = parts.length === 3 && parts[1].tag === 0x01 && parts[1].value[0] !== 0;
      ext.set(oid, { critical, value: parts[parts.length - 1].value });
    }
  }
  // KeyUsage ::= BIT STRING; bit 0 digitalSignature (RFC 5280 §4.2.1.3).
  let keyUsage = null;
  if (ext.has(OID_KEY_USAGE)) {
    const bs = readTlv(ext.get(OID_KEY_USAGE).value, 0);
    const bits = bs.value.subarray(1);
    keyUsage = {
      digitalSignature: bits.length > 0 && (bits[0] & 0x80) !== 0,
      keyAgreement: bits.length > 0 && (bits[0] & 0x08) !== 0,
    };
  }
  // ExtKeyUsageSyntax ::= SEQUENCE OF KeyPurposeId (RFC 5280 §4.2.1.12).
  let ekuOids = null;
  if (ext.has(OID_EXT_KEY_USAGE)) {
    const v = ext.get(OID_EXT_KEY_USAGE).value;
    ekuOids = children(v, readTlv(v, 0)).map((o) => oidToString(o.value));
  }
  return {
    der,
    version,
    tbsRaw: tbs.raw,
    serialHex: serialHex(serial),
    issuerRaw: issuer.raw,
    subjectRaw: subject.raw,
    subjectCN: nameCommonName(der, subject),
    notBefore: derTime(der, nb),
    notAfter: derTime(der, na),
    keyAlg,
    keyCurve,
    keyUsage,
    ekuOids,
    signatureAlgorithm: oidToString(children(der, sigAlg)[0].value),
    signatureDer: sigVal.value.subarray(1), // BIT STRING: drop the unused-bits octet
  };
}

// CertificateList ::= SEQUENCE { tbsCertList, signatureAlgorithm, signatureValue }
export function parseCrl(der) {
  der = Buffer.from(der);
  const crl = readTlv(der, 0);
  if (crl.tag !== 0x30 || crl.end !== der.length) throw new Error('CRL is not one DER SEQUENCE');
  const [tbs, sigAlg, sigVal] = children(der, crl);
  const t = children(der, tbs);
  let i = 0;
  if (t[i].tag === 0x02) i++; // version
  i++; // signature AlgorithmIdentifier
  const issuer = t[i++];
  const thisUpdate = derTime(der, t[i++]);
  let nextUpdate = null;
  if (t[i] && (t[i].tag === 0x17 || t[i].tag === 0x18)) nextUpdate = derTime(der, t[i++]);
  const revoked = new Set();
  if (t[i] && t[i].tag === 0x30) {
    for (const entry of children(der, t[i])) revoked.add(serialHex(children(der, entry)[0]));
    i++;
  }
  return {
    der,
    tbsRaw: tbs.raw,
    issuerRaw: issuer.raw,
    thisUpdate,
    nextUpdate,
    revokedSerials: revoked,
    signatureAlgorithm: oidToString(children(der, sigAlg)[0].value),
    signatureDer: sigVal.value.subarray(1),
  };
}

// The public key of a certificate as a Node KeyObject.
export function certificatePublicKey(der) {
  return new crypto.X509Certificate(Buffer.from(der)).publicKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// §6.5.2 — the station's signature over the handshake
// ─────────────────────────────────────────────────────────────────────────────

// challengeBody  = the Challenge object without its stationSignature member
// th_sig         = SHA-256( LP(helloBytes) ‖ LP(OSPP_Canonical_Form(challengeBody)) )
// signedContent  = 0x20 × 64 ‖ UTF8(context) ‖ 0x00 ‖ th_sig
export function stationSignedContent(helloBytes, challenge) {
  const { stationSignature: _omit, ...challengeBody } = challenge;
  const thSig = sha256(lp(Buffer.from(helloBytes)), lp(Buffer.from(canonicalForm(challengeBody), 'utf-8')));
  return Buffer.concat([Buffer.alloc(64, 0x20), Buffer.from(STATION_SIGNATURE_CONTEXT, 'utf-8'), Buffer.from([0x00]), thSig]);
}

// Signs with the station's certificate key: ECDSA-P256-SHA256, RFC 6979, low-s, DER, Base64.
export function signStationChallenge(stationKeyPem, helloBytes, challenge) {
  const sig = ecdsaSign(stationKeyPem, stationSignedContent(helloBytes, challenge));
  if (!isLowS(sig)) throw new Error('station signature is not low-s (06-security.md §6.2 Note 6)');
  return sig;
}

// The app's verification gate (06-security.md §6.5.2, steps 1–6). Implements
// the listed steps; where a step names a signature under the CA's key, the signed
// object's issuer name is matched to the CA's subject as well, as RFC 5280 path and
// CRL validation do:
//   1. the certificate chains to the Station CA: its signature verifies under
//      the CA's key and its issuer is the CA's subject; `at`, with `skewSeconds`,
//      lies within its validity;
//   2. its serial is on no entry of the CRL, whose signature verifies under the
//      CA's key — the CRL as held, whatever its update times;
//   3. a P-256 key, key usage with digitalSignature, extended key usage with the
//      OSPP BLE station purpose;
//   4. stationId = subject CN; equal to `intendedStationId` when one is given;
//   5. stationSignature verifies over the content above with the certificate key;
//   6. any failure → abort, no credential, 2013 BLE_AUTH_FAILED.
// Returns { ok, step, reason, stationId, certificate }.
export function stationVerificationGate({ challenge, helloBytes, caCertPem, crlPem, at, skewSeconds = 0, intendedStationId = null }) {
  const fail = (step, reason) => ({ ok: false, step, reason, ...GATE_ERROR });
  let cert;
  try {
    if (typeof challenge.stationCertificate !== 'string') return fail(1, 'stationCertificate missing');
    cert = parseCertificate(Buffer.from(challenge.stationCertificate, 'base64'));
  } catch (e) {
    return fail(1, `stationCertificate is not a DER certificate: ${e.message}`);
  }
  const caDer = pemToDer(caCertPem);
  const ca = parseCertificate(caDer);
  const caKey = certificatePublicKey(caDer);
  const atMs = Date.parse(at);
  if (!Number.isFinite(atMs)) throw new Error(`gate: unparseable time ${at}`);

  // Step 1.
  if (!cert.issuerRaw.equals(ca.subjectRaw)) return fail(1, 'issuer is not the Station CA subject');
  if (cert.signatureAlgorithm !== OID_ECDSA_SHA256) return fail(1, `certificate signature algorithm ${cert.signatureAlgorithm} is not ecdsa-with-SHA256`);
  if (!crypto.verify('sha256', cert.tbsRaw, caKey, cert.signatureDer)) return fail(1, 'certificate signature does not verify under the Station CA key');
  const node = new crypto.X509Certificate(cert.der);
  if (!node.verify(caKey)) throw new Error('gate cross-check: DER walker and Node X509Certificate disagree on the certificate signature');
  if (atMs + skewSeconds * 1000 < cert.notBefore.getTime()) return fail(1, `not valid before ${cert.notBefore.toISOString()}`);
  if (atMs - skewSeconds * 1000 > cert.notAfter.getTime()) return fail(1, `expired at ${cert.notAfter.toISOString()}`);

  // Step 2.
  const crl = parseCrl(pemToDer(crlPem));
  if (!crl.issuerRaw.equals(ca.subjectRaw)) return fail(2, 'CRL issuer is not the Station CA subject');
  if (!crypto.verify('sha256', crl.tbsRaw, caKey, crl.signatureDer)) return fail(2, 'CRL signature does not verify under the Station CA key');
  if (crl.revokedSerials.has(cert.serialHex)) return fail(2, `serial ${cert.serialHex} is on the CRL`);

  // Step 3.
  if (cert.keyAlg !== OID_EC_PUBLIC_KEY || cert.keyCurve !== OID_PRIME256V1) return fail(3, `key is not P-256 (alg ${cert.keyAlg}, curve ${cert.keyCurve})`);
  if (!cert.keyUsage || !cert.keyUsage.digitalSignature) return fail(3, 'key usage does not include digitalSignature');
  if (!cert.ekuOids || !cert.ekuOids.includes(OID_OSPP_BLE_STATION)) return fail(3, 'extended key usage does not include id-kp-osppBleStation');
  const nodeEku = node.keyUsage ?? [];
  if (cert.ekuOids.join(',') !== nodeEku.join(',')) throw new Error(`gate cross-check: EKU disagrees (DER ${cert.ekuOids} vs Node ${nodeEku})`);

  // Step 4.
  const stationId = cert.subjectCN;
  // station-id.schema.json: ^stn_[a-f0-9]{8,}$
  if (typeof stationId !== 'string' || !/^stn_[a-f0-9]{8,}$/.test(stationId)) return fail(4, `subject CN ${stationId} is not a stationId`);
  if (intendedStationId !== null && stationId !== intendedStationId) return fail(4, `certificate names ${stationId}, the intended station is ${intendedStationId}`);

  // Step 5.
  if (typeof challenge.stationSignature !== 'string') return fail(5, 'stationSignature missing');
  const content = stationSignedContent(helloBytes, challenge);
  const certKeyPem = node.publicKey.export({ type: 'spki', format: 'pem' });
  if (!ecdsaVerify(certKeyPem, content, challenge.stationSignature)) return fail(5, 'stationSignature does not verify over the Hello and this Challenge');

  return { ok: true, step: null, reason: null, stationId, certificate: cert, certKeyPem, signedContent: content };
}

// ─────────────────────────────────────────────────────────────────────────────
// §6.5.4 — the device proof
// ─────────────────────────────────────────────────────────────────────────────

// proofInput = LP("OSPP BLE device proof v1") ‖ LP(transcriptHash) ‖ LP(stationId)
//            ‖ LP(passId) ‖ LP(decimal(counter)) ‖ LP(bayId) ‖ LP(serviceId)
//            ‖ LP(decimal(requestedDurationSeconds))
export function deviceProofInput({ transcriptHash, stationId, passId, counter, bayId, serviceId, requestedDurationSeconds }) {
  if (!Buffer.isBuffer(transcriptHash) || transcriptHash.length !== 32) throw new Error('deviceProofInput: transcriptHash must be 32 bytes');
  return Buffer.concat([
    lp(DEVICE_PROOF_LABEL), lp(transcriptHash), lp(stationId),
    lp(passId), lp(decimal(counter)),
    lp(bayId), lp(serviceId), lp(decimal(requestedDurationSeconds)),
  ]);
}

// The two formats of device-proof.schema.json, read from the schema's enum so the
// tools follow a rename rather than restate the names.
export function deviceProofFormats(schema) {
  const values = schema?.properties?.format?.enum ?? [];
  const android = values.find((v) => /android/i.test(v));
  const apple = values.find((v) => /apple|appattest/i.test(v));
  if (!android || !apple || values.length !== 2) throw new Error(`device-proof formats not recognised: ${JSON.stringify(values)}`);
  return { android, apple };
}

// A synthetic App Attest authenticator data: rpIdHash (32) ‖ flags (1) ‖ counter (4, BE).
export function syntheticAuthenticatorData(appId, counter) {
  const c = Buffer.alloc(4);
  c.writeUInt32BE(counter);
  return Buffer.concat([sha256(Buffer.from(appId, 'utf-8')), Buffer.from([0x00]), c]);
}

// Produces the deviceProof object. `kind` is 'android' or 'apple'; `formats` the
// two schema names; `deviceKey` from deviceTestKey().
export function makeDeviceProof({ kind, formats, deviceKey, proofInput, authenticatorData = null }) {
  if (kind === 'android') {
    const signature = ecdsaSign(deviceKey.privateKey, proofInput);
    if (!isLowS(signature)) throw new Error('device proof signature is not low-s');
    return { format: formats.android, signature };
  }
  if (kind === 'apple') {
    if (!Buffer.isBuffer(authenticatorData)) throw new Error('apple device proof needs authenticatorData');
    const clientDataHash = sha256(proofInput);
    const nonce = sha256(authenticatorData, clientDataHash);
    const signature = ecdsaSign(deviceKey.privateKey, nonce);
    if (!isLowS(signature)) throw new Error('device proof signature is not low-s');
    return { format: formats.apple, signature, authenticatorData: authenticatorData.toString('base64') };
  }
  throw new Error(`unknown device proof kind ${kind}`);
}

// Verifies a deviceProof under the pass's devicePublicKey. Returns { ok, reason, signedBytes }.
// `signedBytes` is what the ECDSA signature covers (proofInput, or the App Attest nonce).
export function verifyDeviceProof({ deviceProof, devicePublicKey, proofInput, formats }) {
  let keyPem;
  try {
    keyPem = publicKeyPemFromSec1(devicePublicKey);
  } catch (e) {
    return { ok: false, reason: `devicePublicKey is not a valid compressed P-256 point: ${e.message}` };
  }
  if (!deviceProof || typeof deviceProof.signature !== 'string') return { ok: false, reason: 'deviceProof.signature missing' };
  if (deviceProof.format === formats.android) {
    if ('authenticatorData' in deviceProof) return { ok: false, reason: `${formats.android} carries no authenticatorData` };
    return ecdsaVerify(keyPem, proofInput, deviceProof.signature)
      ? { ok: true, signedBytes: proofInput, keyPem }
      : { ok: false, reason: 'signature does not verify over the proof input' };
  }
  if (deviceProof.format === formats.apple) {
    if (typeof deviceProof.authenticatorData !== 'string') return { ok: false, reason: `${formats.apple} needs authenticatorData` };
    const nonce = sha256(Buffer.from(deviceProof.authenticatorData, 'base64'), sha256(proofInput));
    return ecdsaVerify(keyPem, nonce, deviceProof.signature)
      ? { ok: true, signedBytes: nonce, keyPem }
      : { ok: false, reason: 'signature does not verify over the nonce SHA-256(authenticatorData || SHA-256(proof input))' };
  }
  return { ok: false, reason: `unknown deviceProof.format ${deviceProof.format}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// RFC ANCHORS — the external truth. Reproduced byte-for-byte or the run throws.
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
