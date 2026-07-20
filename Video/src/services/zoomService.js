const { getConfig } = require('../config');
const { redactObject } = require('../utils/redact');
const { getValidZoomAccessToken } = require('./tokenService');

async function createZoomMeeting(session, meetingInput) {
  const config = getConfig();
  const accessToken = await getValidZoomAccessToken(session);

  const payload = {
    topic: meetingInput.title,
    type: 2,
    start_time: meetingInput.startTimeIso,
    timezone: meetingInput.timezone,
    duration: meetingInput.durationMinutes,
    agenda: meetingInput.description || '',
    settings: {
      waiting_room: true,
      join_before_host: false,
      participant_video: true,
      host_video: true,
      mute_upon_entry: true,
      auto_recording: 'none'
    }
  };

  const response = await fetch(`${config.zoom.apiBase}/users/me/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Zoom meeting creation failed:', redactObject(data));
    const err = new Error(data.message || 'Failed to create Zoom meeting.');
    err.code = 'ZOOM_MEETING_FAILED';
    err.status = 502;
    throw err;
  }

  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    password: data.password || null,
    topic: data.topic,
    startTime: data.start_time,
    duration: data.duration,
    timezone: data.timezone
  };
}

module.exports = { createZoomMeeting };
