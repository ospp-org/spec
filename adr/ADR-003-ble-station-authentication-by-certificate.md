---
adr: 003
status: Accepted
date: 2026-10-05
deciders: OSPP Authors
supersedes: ADR-002, decision items 1 and 2
superseded-by: —
---

# ADR-003 — BLE Station Authentication by the Station's Certificate

## Context

[ADR-002](ADR-002-ble-handshake-security-architecture.md) authenticated the station in the BLE
handshake with a key that existed only for BLE: a static ECDH P-256 key pair, generated on the
station, submitted at provisioning as `stationPubKey`, and certified by a **StationIdentity** — a
document `{stationId, organizationId, stationPubKey, issuedAt, expiresAt}` the server signed with
its signing key. The app verified the document and computed `es = ECDH(appEphemeral,
stationStatic)` as the half of the key schedule that authenticated the station.

That design asked for a second identity beside one every station already holds. A station's mTLS
client certificate, issued by the Station CA at provisioning, already names it (`stn_…` in the
subject CN), already sits on a key generated on the station and held in its secure element, and
already has a revocation path: the Station CA's CRL ([`06-security.md` §4.2, §4.4](../spec/06-security.md#44-certificate-requirements)).
The app already holds that CA certificate and that CRL, in the trust bundle of every pass issuance
and every Partial-A authorization ([`app-contract.md` §3.4](../spec/profiles/offline/app-contract.md#34-the-trust-bundle)).
The StationIdentity duplicated the identity, its issuance and its renewal — it had its own expiry
and its own configuration key, `StationIdentityCertificate` — and had no revocation at all: a
compromised static key stayed valid at every app until the document expired. No server issued
one: at `0.44.0` the reference server accepted no BLE key at provisioning and issued no
StationIdentity, as the README's release status said at `0.44.0`.

## Decision

1. **The certificate authenticates the station.** The station presents its mTLS client
   certificate in the Challenge and signs the handshake with that certificate's key
   ([`06-security.md` §6.5.2](../spec/06-security.md#652-station-authentication--the-stations-certificate)).
   The certificate's extended key usage lists, beside `clientAuth`, the OSPP purpose
   `id-kp-osppBleStation`, OID `2.25.57399134409609390163880398392748054115`
   ([`06-security.md` §4.4](../spec/06-security.md#44-certificate-requirements)): *"If the
   extension is present, then the certificate MUST only be used for one of the purposes
   indicated"* ([RFC 5280 §4.2.1.12](https://www.rfc-editor.org/rfc/rfc5280#section-4.2.1.12)).
2. **The signed content follows TLS 1.3's CertificateVerify.** Sixty-four `0x20` octets, an OSPP
   context string, `0x00`, then a hash of the Hello as received and of the Challenge without its
   signature, in the OSPP Canonical Form. The station builds the content itself and never signs
   a digest a peer supplies.
3. **One ECDH, between the two ephemeral keys.** `IKM = ee ‖ appNonce ‖ stationNonce`,
   `salt = "OSPP_BLE_SESSION_V3"`, `info = LP(transcriptHash)`
   ([`06-security.md` §6.5](../spec/06-security.md#65-ble-session-key-derivation--hkdf-sha256)).
   The transcript covers the certificate and the signature, so the session key binds the
   identity the station presented — the binding SIGMA makes, in its basic form, by a MAC under a
   key derived from the shared secret, and without which a signed Diffie-Hellman exchange is
   open to identity misbinding ([Krawczyk, *SIGMA*, CRYPTO 2003](https://www.iacr.org/archive/crypto2003/27290399/27290399.pdf), §3.1, §5.1).
4. **The app verifies before it sends anything.** The chain to the Station CA of its bundle, the
   validity, the bundle's CRL, the key usage, the extended key usage, the curve, the subject CN
   against an intended station where it holds one from an out-of-band channel, and the signature
   — before it derives the key and before any pass or authorization leaves the phone.
5. **Withdrawn.** The StationIdentity document and its schema, the provisioning request's
   `stationPubKey`, the provisioning response's `stationIdentity`, the configuration key
   `StationIdentityCertificate`, the static BLE key and `es`.

The same wire revision takes the device identifier out of the Hello and out of the key schedule,
negotiates the BLE version inside the transcript, and adds the phone's proof of its device key
([`06-security.md` §6.5.4](../spec/06-security.md#654-device-proof-of-possession)). Those are
recorded where they are defined; this record covers the station's side.

## One key, two signatures

NIST's rule is *"In general, a single key shall be used for only one purpose (e.g., encryption,
integrity authentication, key wrapping, random bit generation, or digital signatures)"*, and it
*"does not preclude using a single key in cases where the same process can provide multiple
services"* ([NIST SP 800-57 Part 1 Rev. 5](https://doi.org/10.6028/NIST.SP.800-57pt1r5), §5.2).
The two uses here are one purpose — a digital signature that authenticates the station — made in
two protocols. The hazard of that is cross-protocol: a signature made for one protocol accepted in
the other. TLS 1.3's structure exists against it; its context string *"is used to provide
separation between signatures made in different contexts, helping against potential
cross-protocol attacks"* ([RFC 9846 §4.5.2](https://www.rfc-editor.org/rfc/rfc9846#section-4.5.2), which carries RFC 8446's text unchanged).
OSPP's context string differs from both of TLS 1.3's, and its content begins with a space, never
with the handshake type that begins every TLS 1.2 handshake message a client signs. The rule that
the station signs only content it builds is what keeps the separation from being bypassed by a
peer that asks for a signature over a digest of its choosing.

The key never takes part in key agreement: *"one static public/private key pair shall not be used
for different purposes (for example, a digital-signature key pair is not to be used for key
establishment or vice versa […])"* ([NIST SP 800-56A Rev. 3](https://doi.org/10.6028/NIST.SP.800-56Ar3),
§5.6.3.2). ADR-002's static key was a key-establishment key and had to be a separate key pair for
that reason; with no static key in the key schedule, the reason is gone.

## Consequences

**Positive.** One key and one certificate per station, issued and renewed as they already are; a
revocation the app can see — the CRL of its trust bundle — where the StationIdentity had none; one
member fewer in the provisioning request and in its response; no second identity for a station
to keep consistent with the first.

**Negative and residual** (stated normatively in [`06-security.md` §6.5.2](../spec/06-security.md#652-station-authentication--the-stations-certificate)).
The Challenge carries a certificate, so it is several fragments long. The certificate key signs
once per handshake for any central that writes a Hello, before the app has authenticated
(T13; Appendix B, item 14). A compromise of the key impersonates that station both to the broker
and over BLE, until the certificate is revoked and the CRL reaches the app with its next bundle.
A certificate issued without `id-kp-osppBleStation` cannot serve BLE until it is renewed; since
every certificate carries both purposes from this revision on, that concerns only certificates
issued before it. An expired certificate ends the station's BLE service with its MQTT connection:
the app refuses a certificate outside its validity, so the offline-only BLE mode an expired
station entered before this decision serves no one, and the station waits for its renewal
([`06-security.md` §4.7.3](../spec/06-security.md#473-emergency-renewal)).

## Review gate

ADR-002 made the construction pass a cryptographic review — *"a cryptographer or an adversarial
review on the final construction"* — before it is frozen. That gate is satisfied by an adversarial
review performed by the project's own team against the written checklist of
[`06-security.md` Appendix B](../spec/06-security.md#appendix-b--ble-cryptographic-review-checklist),
recorded item by item. The BLE profile stays EXPERIMENTAL until the review has passed.

## References

- [`06-security.md`](../spec/06-security.md) §4.4 (certificate profile and `id-kp-osppBleStation`),
  §6.5 (key schedule), §6.5.2 (station authentication), §6.5.4 (device proof), Appendix B
  (review checklist).
- [`ble-handshake.md`](../spec/profiles/offline/ble-handshake.md) §3 (Challenge).
- [ADR-002](ADR-002-ble-handshake-security-architecture.md) — the architecture this record amends.
- RFC 5280 §4.2.1.12; RFC 9846 §4.5.2 (RFC 8446 §4.4.3); NIST SP 800-57 Part 1 Rev. 5 §5.2; NIST SP 800-56A Rev. 3
  §5.6.3.2; H. Krawczyk, *SIGMA: the "SIGn-and-MAc" Approach to Authenticated Diffie-Hellman and
  its Use in the IKE Protocols*, CRYPTO 2003.
