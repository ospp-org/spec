// =============================================================================
// receipt-fields.mjs — the receipt's four signed-only fields, for the signing tools
// =============================================================================
//
// 06-security.md §6.2 adds four fields to receipt_fields that settlement and the
// clock rule read: stationId, bookedDurationSeconds, endReason and clockState. They are signed
// into receipt.data and carried in NO envelope — neither the TransactionEvent payload nor the
// FFF6 Receipt wrapper has them, and both schemas are closed — so a fixture's outer JSON cannot
// supply them the way it supplies every other receipt field.
//
// This module is the one place the signers take them from, so that sign-example.mjs and
// sign-inline-md.mjs cannot disagree: the value already inside the fixture's signed body when
// it carries one (so a fixture can state its own story and every re-run is a no-op), and
// otherwise a deterministic default derived from the outer fields.
// =============================================================================

import { createHash } from 'node:crypto';

export const RECEIPT_SIGNED_ONLY_FIELDS = ['stationId', 'bookedDurationSeconds', 'endReason', 'clockState'];

const END_REASONS = new Set(['TimerExpired', 'Fault', 'Local', 'LocalOutOfCredit', 'Deauthorized', 'OperatorStopped', 'Inactivity', 'ServerStopped']);
const CLOCK_STATES = new Set(['Synchronized', 'Unsynchronized']);

function previousBody(outer) {
  try {
    const body = JSON.parse(Buffer.from(outer?.receipt?.data ?? '', 'base64').toString('utf-8'));
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

// A TransactionEvent envelope has no deviceId (its schema is closed), yet the signed body carries
// one. The value already inside the fixture's signed body wins, so the station's copy and the
// phone's FFF6 copy of one receipt can sign the same device; otherwise `derive` supplies one.
export function envelopeAbsentDeviceId(outer, derive) {
  const prev = previousBody(outer);
  return typeof prev.deviceId === 'string' && prev.deviceId.length >= 1 && prev.deviceId.length <= 128
    ? prev.deviceId
    : derive(outer.offlineTxId);
}

export function signedOnlyFields(outer) {
  const prev = previousBody(outer);
  const seed = String(outer?.offlineTxId ?? '');
  const duration = Number(outer?.durationSeconds);
  const defaultBooked = Number.isFinite(duration) && duration > 0 ? Math.max(60, Math.ceil(duration / 60) * 60) : 300;
  const booked = Number.isInteger(prev.bookedDurationSeconds) && prev.bookedDurationSeconds >= 1 ? prev.bookedDurationSeconds : defaultBooked;
  return {
    stationId: typeof prev.stationId === 'string' && /^stn_[a-f0-9]{8,}$/.test(prev.stationId)
      ? prev.stationId
      : `stn_${createHash('sha256').update(`stationId|${seed}`).digest('hex').slice(0, 8)}`,
    bookedDurationSeconds: booked,
    endReason: END_REASONS.has(prev.endReason) ? prev.endReason : (booked === duration ? 'TimerExpired' : 'Local'),
    clockState: CLOCK_STATES.has(prev.clockState) ? prev.clockState : 'Synchronized',
  };
}
