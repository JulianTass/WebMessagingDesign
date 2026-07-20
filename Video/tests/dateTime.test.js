const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMeetingDateTime,
  isValidTimezone,
  toUtcIcs,
  addMinutes
} = require('../src/utils/dateTime');
const { DateTime } = require('luxon');

describe('dateTime', () => {
  it('parses a future meeting in Australia/Sydney', () => {
    const futureDate = DateTime.now().setZone('Australia/Sydney').plus({ days: 2 });
    const dt = parseMeetingDateTime({
      date: futureDate.toFormat('yyyy-MM-dd'),
      time: '10:00',
      timezone: 'Australia/Sydney'
    });
    assert.equal(dt.zoneName, 'Australia/Sydney');
    assert.equal(dt.hour, 10);
  });

  it('rejects meetings in the past', () => {
    assert.throws(() => parseMeetingDateTime({
      date: '2020-01-01',
      time: '09:00',
      timezone: 'Australia/Sydney'
    }), (err) => err.code === 'MEETING_IN_PAST');
  });

  it('validates timezone', () => {
    assert.equal(isValidTimezone('Australia/Sydney'), true);
    assert.equal(isValidTimezone('Not/A_Timezone'), false);
  });

  it('handles daylight-saving transition window explicitly', () => {
    const dt = DateTime.fromISO('2026-10-04T10:00', { zone: 'Australia/Sydney' });
    assert.equal(dt.isValid, true);
    const end = addMinutes(dt, 30);
    assert.equal(end.diff(dt, 'minutes').minutes, 30);
  });

  it('formats UTC ICS timestamps', () => {
    const dt = DateTime.fromISO('2026-07-24T00:00:00Z');
    assert.match(toUtcIcs(dt), /^20260724T000000Z$/);
  });
});
