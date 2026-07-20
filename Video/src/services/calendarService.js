const { createEvent } = require('ics');
const { createUid } = require('../utils/crypto');
const { toUtcIcs } = require('../utils/dateTime');

function buildIcsContent({
  title,
  description,
  startUtc,
  endUtc,
  joinUrl,
  customerName,
  customerEmail,
  organizerEmail,
  organizerName = 'SEEK Support',
  agentName = 'Isabella'
}) {
  const uid = createUid();
  const dtStamp = toUtcIcs(startUtc.minus({ minutes: 1 }).toUTC());

  const fullDescription = [
    `Agent: ${agentName}`,
    description || '',
    '',
    `Join Zoom Meeting: ${joinUrl}`
  ].filter(Boolean).join('\n');

  const event = {
    uid,
    method: 'REQUEST',
    productId: 'seek-meeting-scheduler',
    status: 'CONFIRMED',
    start: startUtc.toUTC().toFormat('yyyy-M-d-H-m').split('-').map(Number),
    startInputType: 'utc',
    end: endUtc.toUTC().toFormat('yyyy-M-d-H-m').split('-').map(Number),
    endInputType: 'utc',
    title,
    description: fullDescription,
    location: 'Zoom',
    url: joinUrl,
    organizer: organizerEmail
      ? { name: organizerName, email: organizerEmail }
      : { name: organizerName },
    attendees: [
      {
        name: customerName,
        email: customerEmail,
        rsvp: true,
        partstat: 'NEEDS-ACTION',
        role: 'REQ-PARTICIPANT'
      }
    ],
    alarms: [
      {
        action: 'display',
        description: 'Reminder',
        trigger: { hours: 0, minutes: 10, before: true }
      }
    ]
  };

  const { error, value } = createEvent(event);
  if (error) {
    const err = new Error(`Failed to generate calendar invitation: ${error.message}`);
    err.code = 'ICS_GENERATION_FAILED';
    err.status = 500;
    throw err;
  }

  // Ensure CRLF line endings per RFC
  return value.replace(/\r?\n/g, '\r\n');
}

module.exports = { buildIcsContent };
