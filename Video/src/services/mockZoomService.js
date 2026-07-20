function createMockZoomMeeting(meetingInput, config) {
  const joinUrl = config.mockZoomJoinUrl;
  const meetingId = config.mockZoomMeetingId;

  return {
    meetingId,
    joinUrl,
    startUrl: 'https://zoom.us/s/mock-host-only-not-for-clients',
    password: config.mockZoomPassword || null,
    topic: meetingInput.title,
    startTime: meetingInput.startTimeIso,
    duration: meetingInput.durationMinutes,
    timezone: meetingInput.timezone,
    mock: true
  };
}

module.exports = { createMockZoomMeeting };
