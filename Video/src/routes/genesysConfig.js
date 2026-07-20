const express = require('express');
const { getConfig } = require('../config');
const { parseMeetingDateTime } = require('../utils/dateTime');

function createGenesysRouter(options = {}) {
  const router = express.Router();
  const config = options.config || getConfig();

  router.get('/config', (req, res) => {
    res.json({
      queueId: config.genesys.queueId,
      agentId: config.genesys.agentId,
      scriptId: config.genesys.scriptId,
      defaultCallerId: config.genesys.defaultCallerId,
      agentName: config.agentName,
      zoomJoinUrl: config.mockZoomJoinUrl,
      zoomMeetingId: config.mockZoomMeetingId,
      bookingSource: 'SEEK Portal'
    });
  });

  router.post('/format-time', (req, res, next) => {
    try {
      const { date, time, timezone } = req.body || {};
      if (!date || !time || !timezone) {
        const err = new Error('Date, time, and timezone are required.');
        err.code = 'VALIDATION_ERROR';
        err.status = 400;
        throw err;
      }

      const startLocal = parseMeetingDateTime({ date, time, timezone });
      res.json({ callbackScheduledTime: startLocal.toUTC().toISO() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createGenesysRouter };
