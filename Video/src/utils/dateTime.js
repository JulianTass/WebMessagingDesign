const { DateTime } = require('luxon');

const ALLOWED_DURATIONS = [15, 30, 45, 60];

function isValidTimezone(tz) {
  return DateTime.now().setZone(tz).isValid;
}

function parseMeetingDateTime({ date, time, timezone }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('Date must be in YYYY-MM-DD format.');
    err.code = 'INVALID_DATE';
    err.status = 400;
    throw err;
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    const err = new Error('Time must be in HH:mm format.');
    err.code = 'INVALID_TIME';
    err.status = 400;
    throw err;
  }
  if (!isValidTimezone(timezone)) {
    const err = new Error('Invalid timezone.');
    err.code = 'INVALID_TIMEZONE';
    err.status = 400;
    throw err;
  }

  const local = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!local.isValid) {
    const err = new Error('Invalid date or time for the selected timezone.');
    err.code = 'INVALID_DATETIME';
    err.status = 400;
    throw err;
  }

  if (local <= DateTime.now().setZone(timezone)) {
    const err = new Error('Meeting time must be in the future.');
    err.code = 'MEETING_IN_PAST';
    err.status = 400;
    throw err;
  }

  return local;
}

function toIsoWithOffset(dt) {
  return dt.toISO({ suppressMilliseconds: true, includeOffset: true });
}

function toUtcIcs(dt) {
  return dt.toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
}

function formatForDisplay(dt) {
  return {
    date: dt.toFormat('cccc, d MMMM yyyy'),
    time: dt.toFormat('h:mm a'),
    timezone: dt.zoneName
  };
}

function addMinutes(dt, minutes) {
  return dt.plus({ minutes });
}

module.exports = {
  ALLOWED_DURATIONS,
  isValidTimezone,
  parseMeetingDateTime,
  toIsoWithOffset,
  toUtcIcs,
  formatForDisplay,
  addMinutes
};
