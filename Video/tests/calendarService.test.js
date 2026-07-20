const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { buildIcsContent } = require('../src/services/calendarService');

describe('calendarService', () => {
  it('creates ICS with required fields and CRLF endings', () => {
    const start = DateTime.fromISO('2026-07-24T10:00:00', { zone: 'Australia/Sydney' });
    const end = start.plus({ minutes: 30 });
    const joinUrl = 'https://zoom.us/j/123456789';

    const ics = buildIcsContent({
      title: 'SEEK Employer Consultation',
      description: 'Review of your job advertisement',
      startUtc: start,
      endUtc: end,
      joinUrl,
      customerName: 'Margaret Smith',
      customerEmail: 'margaret@example.com',
      organizerEmail: 'host@hotmail.com',
      agentName: 'Isabella'
    });

    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /VERSION:2.0/);
    assert.match(ics, /PRODID:seek-meeting-scheduler/);
    assert.match(ics, /UID:/);
    assert.match(ics, /DTSTAMP:/);
    assert.match(ics, /DTSTART:/);
    assert.match(ics, /DTEND:/);
    assert.match(ics, /SUMMARY:SEEK Employer Consultation/);
    assert.match(ics, /LOCATION:Zoom/);
    assert.match(ics, /URL:https:\/\/zoom.us\/j\/123456789/);
    assert.match(ics, /STATUS:CONFIRMED/);
    assert.match(ics, /METHOD:REQUEST/);
    assert.match(ics, /ATTENDEE/);
    assert.match(ics, /Agent: Isabella/);
    assert.match(ics, /VALARM/);
    assert.match(ics, /\r\n/);
    assert.doesNotMatch(ics, /start_url/i);
  });

  it('escapes commas and semicolons in descriptions', () => {
    const start = DateTime.fromISO('2026-08-01T09:00:00', { zone: 'UTC' });
    const end = start.plus({ minutes: 15 });

    const ics = buildIcsContent({
      title: 'Consultation',
      description: 'Line one; line two, with punctuation',
      startUtc: start,
      endUtc: end,
      joinUrl: 'https://zoom.us/j/example',
      customerName: 'Alex',
      customerEmail: 'alex@example.com'
    });

    assert.match(ics, /DESCRIPTION:/);
    assert.doesNotMatch(ics, /DESCRIPTION:Line one; line two, with punctuation/);
  });
});
