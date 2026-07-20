const { ALLOWED_DURATIONS, isValidTimezone } = require('../utils/dateTime');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateScheduleBody(body) {
  const errors = [];
  const customerName = trimString(body.customerName);
  const customerEmail = trimString(body.customerEmail).toLowerCase();
  const title = trimString(body.title);
  const description = trimString(body.description);
  const date = trimString(body.date);
  const time = trimString(body.time);
  const timezone = trimString(body.timezone);
  const durationMinutes = parseInt(body.durationMinutes, 10);

  if (!customerName) errors.push('Customer name is required.');
  if (!customerEmail || !EMAIL_REGEX.test(customerEmail)) {
    errors.push('A valid customer email is required.');
  }
  if (!title) errors.push('Meeting title is required.');
  if (!date) errors.push('Meeting date is required.');
  if (!time) errors.push('Start time is required.');
  if (!timezone || !isValidTimezone(timezone)) errors.push('A valid timezone is required.');
  if (!ALLOWED_DURATIONS.includes(durationMinutes)) {
    errors.push('Duration must be 15, 30, 45, or 60 minutes.');
  }

  if (errors.length > 0) {
    const err = new Error(errors.join(' '));
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  return {
    customerName: customerName.slice(0, 120),
    customerEmail: customerEmail.slice(0, 254),
    title: title.slice(0, 200),
    description: description.slice(0, 2000),
    date,
    time,
    timezone,
    durationMinutes
  };
}

const { getConfig } = require('../config');

function requireConnections(req, res, next) {
  const config = getConfig();
  if (!req.session.microsoft?.accessToken) {
    const err = new Error('Microsoft account is not connected.');
    err.code = 'MICROSOFT_NOT_CONNECTED';
    err.status = 401;
    return next(err);
  }
  if (!config.zoomMock && !req.session.zoom?.accessToken) {
    const err = new Error('Zoom account is not connected.');
    err.code = 'ZOOM_NOT_CONNECTED';
    err.status = 401;
    return next(err);
  }
  next();
}

function requireMicrosoft(req, res, next) {
  if (!req.session.microsoft?.accessToken) {
    const err = new Error('Microsoft account is not connected.');
    err.code = 'MICROSOFT_NOT_CONNECTED';
    err.status = 401;
    return next(err);
  }
  next();
}

module.exports = {
  validateScheduleBody,
  requireConnections,
  requireMicrosoft,
  EMAIL_REGEX
};
