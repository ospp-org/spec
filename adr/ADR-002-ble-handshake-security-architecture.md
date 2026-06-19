---
adr: 002
status: Accepted
date: 2026-06-19
deciders: OSPP Authors
supersedes: —
superseded-by: —
---

# ADR-002 — BLE Handshake Security Architecture (application-layer ECDH, not LTK)

## Context

Through `v0.5.x` the BLE session key was derived as:

```
SessionKey = HKDF-SHA256(ikm = LTK ‖ appNonce ‖ stationNonce,
                         salt = "OSPP_BLE_SESSION_V1",
                         info = deviceId ‖ stationId, 32)
```

where `LTK` is the BLE Long-Term Key from LESC pairing. This is **not implementable**:

- **iOS** Core Bluetooth exposes no key material; pairing is mediated entirely by the OS; AccessorySetupKit (iOS 18+) does not expose keys. There is no legitimate path for a third-party app to read the LTK.
- **Android** link keys live in the system Bluetooth stack (`bt_config.conf`, system/root only); the public API exposes bonding state, never the key.
- Only the station firmware sees its own LTK — irrelevant, because the derivation needs the LTK on **both** ends.

So `§6.5` as written could only ever be exercised between two simulators with custom stacks, never by a real mobile app. The naïve "relax it — set `LTK = 0`" is worse than a weakening: `IKM` collapses onto `appNonce ‖ stationNonce`, values every endpoint already knows, so the OfflinePass becomes a **bearer token** — a rogue station harvests a pass, replays it to the real station with `counter+1` and a self-computed `sessionProof`, and the victim is billed. `sessionProof` would be cryptographic theatre (a "hollow safety net"); the pass's "non-transferable" / "replay-protected" properties would be void in practice.

A second secret for the IKM can come only from (I) the link layer (LTK — ruled out), (II) an out-of-band channel (per-station QR/NFC — breaks unscoped offline passes and adds ops burden), or (III) application-layer cryptography. (III) is the only option that works on real iOS/Android with no pairing dependency.

A Noise Protocol Framework instantiation was evaluated and rejected for OSPP's constraints: there is **no usable Noise library for P-256** on the three implementation platforms (PHP: none; ESP32/mbedTLS firmware: none with a P-256 backend — decisive, since the weakest link commands the design; React Native: none combining the NK/NX pattern *with* P-256). P-256 is outside the Noise spec (§12 permits only 25519/448). Because the handshake must be **byte-identical** across the app (TS), the station simulator (PHP), and the firmware (MCU), and two of those three would hand-roll the framework anyway, Noise's "formal, hard to get wrong" benefit erodes exactly where bugs are most expensive (RF flash/debug cycles). FIDO's caBLEv2 (`Noise_NK_P256_AESGCM_SHA256`) is real but FIDO itself notes most off-the-shelf Noise libraries are unusable and implemented it manually.

## Decision

Adopt **option (d): authenticated application-layer ECDH over P-256**, with BLE pairing demoted to OPTIONAL — decision **D1**. Concretely:

1. **Key agreement:** two ECDH P-256 operations — `es = ECDH(appEphemeral, stationStatic)` (authenticates the station via its certified static key) and `ee = ECDH(appEphemeral, stationEphemeral)` (full forward secrecy). `IKM = es ‖ ee ‖ appNonce ‖ stationNonce`, `salt = "OSPP_BLE_SESSION_V2"`, `info` length-prefixed with a handshake-transcript hash.
2. **Station authentication:** a server-signed **StationIdentity certificate** (`{stationId, organizationId, stationPubKey, issuedAt, expiresAt}`, OSPP-canonical + ECDSA-P256, signed by the existing server signing key) carried in the Challenge. The app verifies it **before** transmitting any pass; the station's BLE ECDH key is **dedicated** (key-separated from the ECDSA mTLS/receipt key per SP 800-56A).
3. **Channel:** **AEAD = ChaCha20-Poly1305 IETF (RFC 8439)** over all post-Challenge messages, under per-direction keys expanded from the session key, with a per-direction counter nonce and `AAD = transcriptHash`. Encrypt-then-fragment.
4. **Curve:** P-256 everywhere — NOT X25519 (the existing PKI, secure elements, and mTLS are all P-256).

Two hygiene properties are borrowed from Noise **explicitly, without the framework**: a **length-prefixed transcript hash** over the whole handshake (kills the ambiguous-concatenation class), and a **fixed AEAD nonce-counter discipline** per direction (kills the GCM-style nonce-reuse footgun). The full byte-exact contract is the **8 pins** in `06-security.md` §6.4/§6.5: (1) ECDH X-only left-pad, (2) compressed-SEC1 pubkey encoding, (3) key schedule, (4) transcript layout, (5) AEAD nonce, (6) ChaCha20-Poly1305 IETF not XChaCha, (7) per-frame AAD, (8) canonical JSON.

## Why not (a)/(a′) "LTK = 0" or pairing-mandated

`(a)`/`(a′)` are the "solution of the moment" the project forbids: they are trivial to implement but a security lie (bearer-token collapse above; `just-works` pairing does not authenticate, and a NoInputNoOutput public station cannot do MitM-protected pairing). Mandating pairing is also operationally unscalable for public self-service — bond-table exhaustion across thousands of distinct phones and an OS pairing dialog mid-handshake that breaks the 10-second budget.

## Consequences

**Positive.** Works on real iOS/Android with zero pairing dependency; full forward secrecy; channel binding stronger than the LTK ever provided (binds the authenticated station identity + full transcript); closes findings N4/N15/N17/N23 as a side effect of the AEAD channel and length-prefixing; the app stores zero per-station keys (root-CA model: it verifies every station with the server key it already holds).

**Negative / residual (normative, see `06-security.md` §6.5.2).** Offline revocation is best-effort (short `expiresAt` + rotation; an offline app cannot fetch CRL/OCSP); a compromised station static key permits impersonation of **that one station** until its certificate expires (blast radius = 1 station); a pure relay is **not** prevented (the certificate proves "a legitimate station", not "the station in front of you") — acceptable because authorization is by the cryptographic pass, not proximity, so OSPP is immune to the Tesla/Kwikset proximity-unlock class.

**Cost.** Breaking change to the BLE handshake wire format → `v0.6.0`. The profile has no executable implementation yet, so this is the cheapest moment in the project's history for the break. Conformance vectors are regenerated once (the glue ECDH/HKDF/AEAD has no public cross-language vector and is auto-generated, anchored on RFC 5903 §8.1 and RFC 8439 §2.8.2).

## Status

**Accepted** — D1 is taken; this ADR records it. The concrete construction and its vectors **MUST** pass a dedicated cryptographic-review gate (a cryptographer or an adversarial review on the final construction) **before** `v0.6.0` is frozen/tagged. This ADR governs the architecture; `06-security.md` §6.4/§6.5 governs the byte-exact mechanics.

## References

- `spec/06-security.md` §6.4 (BLE Transport Security), §6.5 / §6.5.1 / §6.5.2 / §6.5.3 (ECDH derivation, sessionProof, StationIdentity, AEAD channel).
- `spec/profiles/offline/ble-handshake.md` (handshake messages + canonical `sessionProof` §4.1).
- `CHANGELOG.md` — `0.6.0` entry.
- `ADR-001` — cross-repo lockstep versioning (the `v0.6.0` tag lands on all three repos together).
- External design record (csms-server repo): `BUILD-PLAN-BLE-OFFLINE.md` (decision D1, the 8 pins, handshake mechanics) and `REPORT-DESIGN-BLE-OFFLINE-FINALIZATION-20260613.md` (findings N1–N23, option taxonomy).
