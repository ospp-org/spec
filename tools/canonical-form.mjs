/**
 * OSPP Canonical Form — the specification repository's own implementation.
 *
 * Source of truth: `spec/06-security.md` §4.8.1, lines 677–688. Every step below
 * cites the rule it implements. A reader must be able to check this file against
 * that text without opening another repository.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS DOES NOT `import { canonicalize } from '@ospp/protocol'`
 * ─────────────────────────────────────────────────────────────────────────────
 * Because a conformance gate that canonicalizes with the SDK is verifying the SDK
 * against the SDK's own implementation. It passes whatever the SDK does, including
 * whatever it does wrong. This repository has produced that shape twice already —
 * a gate that compared the two SDKs to each other instead of to the registry, and
 * a suite that defended the wrong value for 5004 — so the rule here is deliberate:
 *
 *     the tools re-implement the rule FROM THE TEXT, once, and never import it.
 *
 * "Once" is the other half. Before 0.13.0 `verify-mqtt-mac.mjs` carried its own
 * copy and it was wrong in exactly the way the SDKs had just been repaired for
 * (`Object.keys(v).sort()`, step 1 below) — a third implementation is a third
 * thing to get wrong. One module, re-implemented on purpose, imported by every
 * tool that needs it.
 *
 * This is not hypothetical for this repo. `sign-inline-md.mjs`, `sign-example.mjs`,
 * `verify-example-signatures.mjs`, `verify-ble-crypto.mjs` and
 * `generate-ble-vectors.mjs` DO import `canonicalize` from `@ospp/protocol`, and
 * the installed copy is 0.5.4 — which carries both defects step 1 describes. The
 * measured exposure is currently zero (no signed payload in the tree has keys
 * whose two orderings differ, and none has integer-like keys), which is why that
 * chain has not been moved here in the same change. It is recorded in
 * KNOWN-ISSUES; do not "simplify" this module into that import.
 *
 * If you are about to make this file shorter by importing the SDK: the gate goes
 * silently circular the moment you do, and nothing will fail to tell you.
 */

/**
 * Step 1 comparator — `06-security.md:679`:
 *   "Recursively sort object keys at every nesting level using lexicographic byte
 *    ordering of the UTF-8 encoded key strings."
 *
 * Byte ordering of UTF-8, NOT `Array.prototype.sort()`, which compares UTF-16 code
 * units. The two disagree across the BMP boundary: U+1D400 is the surrogate pair
 * D835 DC00, so UTF-16 sorts it below U+FFFD, while its UTF-8 encoding starts F0
 * and sorts above. `{U+FFFD, U+1D400}` is the minimal disagreeing pair.
 */
export function compareKeysUtf8(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * Step 3, strings — `06-security.md:682`:
 *   minimal required escaping — exactly `"`, `\`, and C0 (U+0000–U+001F), those
 *   being the only characters RFC 8259 §7 requires escaped; two-character forms
 *   where RFC 8259 defines one; everything else literal.
 *
 * U+007F DEL and C1 (U+0080–U+009F) are Unicode category Cc but are NOT escaped:
 * RFC 8259 does not require it, so escaping them would be an escape sequence used
 * for a character that does not require one, which :682 forbids. Same for
 * U+2028/U+2029 (Zl/Zp). Both are pinned by the conformance vectors.
 */
const SHORT_ESCAPE = { 0x08: '\\b', 0x09: '\\t', 0x0a: '\\n', 0x0c: '\\f', 0x0d: '\\r' };

export function encodeString(s) {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (c < 0x20) out += SHORT_ESCAPE[c] ?? '\\u' + c.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out + '"';
}

/**
 * Step 3, numbers — `06-security.md:685`:
 *   "Integers: emit without leading zeros, without a leading `+`, and without a
 *    trailing decimal point."
 *
 * :687 records that floating point is undefined in this version rather than
 * defaulting to whatever the host language prints, so a non-integer is refused
 * instead of silently serialized.
 */
export function encodeNumber(n) {
  if (!Number.isInteger(n)) {
    throw new RangeError(
      `non-integer number ${n}: 06-security.md §4.8.1 leaves IEEE 754 serialization ` +
      'undefined in this version, so canonicalizing one would invent a rule');
  }
  return String(n);
}

/**
 * The whole algorithm. Returns the canonical STRING; step 4 (`:688`, "Encode as
 * UTF-8 bytes") is `Buffer.from(result, 'utf8')` — see canonicalBytes below.
 *
 * Step 2 (`:680`) is expressed by building the output with `,` and `:` and no
 * whitespace anywhere.
 */
export function canonicalForm(value) {
  if (value === null) return 'null';                                  // :686
  if (typeof value === 'boolean') return value ? 'true' : 'false';    // :686
  if (typeof value === 'number') return encodeNumber(value);          // :685
  if (typeof value === 'string') return encodeString(value);          // :682
  if (Array.isArray(value)) {
    // :679 — "Array element order is preserved (arrays are not reordered)."
    return '[' + value.map(canonicalForm).join(',') + ']';
  }
  if (typeof value === 'object') {
    // :679 — recursive key sort, UTF-8 byte order.
    const keys = Object.keys(value).sort(compareKeysUtf8);
    return '{' + keys.map(k => encodeString(k) + ':' + canonicalForm(value[k])).join(',') + '}';
  }
  throw new TypeError(`value of type ${typeof value} has no canonical form`);
}

/** Step 4 — `06-security.md:688`. */
export function canonicalBytes(value) {
  return Buffer.from(canonicalForm(value), 'utf8');
}
