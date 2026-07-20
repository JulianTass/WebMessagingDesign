const express = require('express');
const rateLimit = require('express-rate-limit');
const { getConfig } = require('../config');
const { createMsalClient } = require('./microsoftAuth');
const { validateScheduleBody, requireConnections, requireMicrosoft } = require('../middleware/validation');
const { parseMeetingDateTime, toIsoWithOffset, formatForDisplay, addMinutes } = require('../utils/dateTime');
const { createZoomMeeting } = require('../services/zoomService');
const { createMockZoomMeeting } = require('../services/mockZoomService');
const { buildIcsContent } = require('../services/calendarService');
const { sendMeetingInvitation, findSentInvitationMessageWithRetry, deleteSentMessage } = require('../services/microsoftGraphService');
const { saveInvitation, deleteInvitation } = require('../services/invitationStore');
const { getValidMicrosoftAccessToken } = require('../services/tokenService');

const scheduleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      success: false,
      code: 'RATE_LIMIT',
      message: 'Too many scheduling requests. Please wait and try again.'
    });
  }
});

function buildEmailSubject(title) {
  return `Meeting invitation: ${title}`;
}

async function resolveSentMessageId(msalClient, session, lastMeeting) {
  if (lastMeeting.sentMessageId) return lastMeeting.sentMessageId;

  const accessToken = await getValidMicrosoftAccessToken(msalClient, session);
  return findSentInvitationMessageWithRetry(accessToken, {
    subject: buildEmailSubject(lastMeeting.title),
    customerEmail: lastMeeting.customerEmail
  });
}

function createScheduleRouter(options = {}) {
  const router = express.Router();
  const config = options.config || getConfig();
  const msalClient = createMsalClient(config);

  router.post('/', scheduleLimiter, requireConnections, async (req, res, next) => {
    try {
      const input = validateScheduleBody(req.body);
      const startLocal = parseMeetingDateTime(input);
      const endLocal = addMinutes(startLocal, input.durationMinutes);

      const meetingInput = {
        title: input.title,
        description: input.description,
        startTimeIso: toIsoWithOffset(startLocal),
        timezone: input.timezone,
        durationMinutes: input.durationMinutes
      };

      let zoomMeeting;
      try {
        zoomMeeting = config.zoomMock
          ? createMockZoomMeeting(meetingInput, config)
          : await createZoomMeeting(req.session, meetingInput);
      } catch (error) {
        return next(error);
      }

      // Store meeting in session for email retry without duplicate Zoom creation
      req.session.lastMeeting = {
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        title: input.title,
        description: input.description,
        date: input.date,
        time: input.time,
        timezone: input.timezone,
        durationMinutes: input.durationMinutes,
        joinUrl: zoomMeeting.joinUrl,
        meetingId: zoomMeeting.meetingId,
        startTime: toIsoWithOffset(startLocal)
      };

      const organizerEmail = req.session.microsoft.email || null;
      const icsContent = buildIcsContent({
        title: input.title,
        description: input.description,
        startUtc: startLocal,
        endUtc: endLocal,
        joinUrl: zoomMeeting.joinUrl,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        organizerEmail,
        agentName: config.agentName
      });

      const invitationId = saveInvitation(icsContent, {
        title: input.title,
        customerEmail: input.customerEmail
      });
      req.session.lastMeeting.invitationId = invitationId;

      const display = formatForDisplay(startLocal);

      let sendResult;
      try {
        sendResult = await sendMeetingInvitation(msalClient, req.session, {
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          title: input.title,
          formattedDate: display.date,
          formattedTime: display.time,
          timezone: input.timezone,
          durationMinutes: input.durationMinutes,
          joinUrl: zoomMeeting.joinUrl,
          icsContent
        });
      } catch (emailError) {
        emailError.partial = true;
        emailError.meeting = {
          title: input.title,
          startTime: toIsoWithOffset(startLocal),
          durationMinutes: input.durationMinutes,
          timezone: input.timezone,
          joinUrl: zoomMeeting.joinUrl,
          meetingId: zoomMeeting.meetingId
        };
        emailError.icsDownloadUrl = `/api/invitations/${invitationId}/download`;
        emailError.message = config.zoomMock
          ? 'The demo meeting was prepared, but the invitation email could not be sent. You can download the calendar file or retry sending.'
          : 'The Zoom meeting was created, but the invitation email could not be sent. You can download the calendar file or retry sending.';
        return next(emailError);
      }

      req.session.lastMeeting.emailSent = true;
      req.session.lastMeeting.sentMessageId = sendResult.sentMessageId || null;
      req.session.lastMeeting.emailSubject = sendResult.subject;

      res.json({
        success: true,
        message: config.zoomMock
          ? 'The demo meeting was prepared and the invitation was sent.'
          : 'The meeting was created and the invitation was sent.',
        emailSent: true,
        meeting: {
          title: input.title,
          startTime: toIsoWithOffset(startLocal),
          durationMinutes: input.durationMinutes,
          timezone: input.timezone,
          joinUrl: zoomMeeting.joinUrl,
          meetingId: zoomMeeting.meetingId
        },
        icsDownloadUrl: `/api/invitations/${invitationId}/download`
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/retry-email', scheduleLimiter, requireConnections, async (req, res, next) => {
    try {
      const last = req.session.lastMeeting;
      if (!last?.joinUrl) {
        const err = new Error('No meeting is available to resend. Schedule a meeting first.');
        err.code = 'VALIDATION_ERROR';
        err.status = 400;
        throw err;
      }

      const startLocal = parseMeetingDateTime({
        date: last.date,
        time: last.time,
        timezone: last.timezone
      });
      const endLocal = addMinutes(startLocal, last.durationMinutes);
      const display = formatForDisplay(startLocal);
      const organizerEmail = req.session.microsoft.email || null;

      const icsContent = buildIcsContent({
        title: last.title,
        description: last.description,
        startUtc: startLocal,
        endUtc: endLocal,
        joinUrl: last.joinUrl,
        customerName: last.customerName,
        customerEmail: last.customerEmail,
        organizerEmail,
        agentName: config.agentName
      });

      const invitationId = saveInvitation(icsContent, {
        title: last.title,
        customerEmail: last.customerEmail
      });

      const sendResult = await sendMeetingInvitation(msalClient, req.session, {
        customerName: last.customerName,
        customerEmail: last.customerEmail,
        title: last.title,
        formattedDate: display.date,
        formattedTime: display.time,
        timezone: last.timezone,
        durationMinutes: last.durationMinutes,
        joinUrl: last.joinUrl,
        icsContent
      });

      req.session.lastMeeting.emailSent = true;
      req.session.lastMeeting.sentMessageId = sendResult.sentMessageId || null;
      req.session.lastMeeting.emailSubject = sendResult.subject;
      req.session.lastMeeting.invitationId = invitationId;

      res.json({
        success: true,
        message: 'The invitation email was sent.',
        emailSent: true,
        meeting: {
          title: last.title,
          startTime: last.startTime,
          durationMinutes: last.durationMinutes,
          timezone: last.timezone,
          joinUrl: last.joinUrl,
          meetingId: last.meetingId
        },
        icsDownloadUrl: `/api/invitations/${invitationId}/download`
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/delete-email', scheduleLimiter, requireMicrosoft, async (req, res, next) => {
    try {
      const last = req.session.lastMeeting;
      if (!last?.emailSent) {
        const err = new Error('No sent invitation email is available to delete.');
        err.code = 'VALIDATION_ERROR';
        err.status = 400;
        throw err;
      }

      const messageId = await resolveSentMessageId(msalClient, req.session, last);
      if (!messageId) {
        const err = new Error('Could not find the sent invitation email in Sent Items.');
        err.code = 'MAIL_MESSAGE_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      const accessToken = await getValidMicrosoftAccessToken(msalClient, req.session);
      await deleteSentMessage(accessToken, messageId);

      if (last.invitationId) {
        deleteInvitation(last.invitationId);
      }

      req.session.lastMeeting = {
        ...last,
        emailSent: false,
        sentMessageId: null,
        invitationId: null
      };

      res.json({
        success: true,
        message: 'The sent invitation email was deleted from your Sent Items.'
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createScheduleRouter };
