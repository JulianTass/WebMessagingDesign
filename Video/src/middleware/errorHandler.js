function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const safeMessages = {
    MICROSOFT_NOT_CONNECTED: 'Connect your Microsoft account before scheduling.',
    ZOOM_NOT_CONNECTED: 'Connect your Zoom account before scheduling.',
    MICROSOFT_CONSENT_DENIED: 'Microsoft sign-in was cancelled or denied.',
    ZOOM_CONSENT_DENIED: 'Zoom sign-in was cancelled or denied.',
    MICROSOFT_TOKEN_EXPIRED: 'Microsoft session expired. Please reconnect.',
    ZOOM_TOKEN_EXPIRED: 'Zoom session expired. Please reconnect.',
    ZOOM_MEETING_FAILED: 'Could not create the Zoom meeting.',
    GRAPH_SEND_FAILED: 'Could not send the invitation email.',
    INVALID_EMAIL: 'Please enter a valid customer email address.',
    INVALID_DATE: 'Please enter a valid meeting date.',
    INVALID_TIME: 'Please enter a valid meeting time.',
    INVALID_TIMEZONE: 'Please select a valid timezone.',
    INVALID_DATETIME: 'The date and time are not valid for the selected timezone.',
    MEETING_IN_PAST: 'Meeting time must be in the future.',
    INVALID_DURATION: 'Duration must be 15, 30, 45, or 60 minutes.',
    VALIDATION_ERROR: 'Please check the form and try again.',
    MISSING_ENV: 'Server configuration is incomplete.',
    RATE_LIMIT: 'Too many requests. Please wait and try again.',
    INVITATION_NOT_FOUND: 'This calendar download link has expired or is invalid.',
    MAIL_MESSAGE_NOT_FOUND: 'The sent invitation email could not be found.',
    MAIL_DELETE_FAILED: 'Could not delete the sent invitation email.',
    GRAPH_LIST_FAILED: 'Could not locate the sent invitation email.'
  };

  if (status >= 500) {
    console.error('[error]', err.code || 'INTERNAL_ERROR', err.message);
  }

  if (err.partial && err.meeting) {
    const safeMeeting = { ...err.meeting };
    delete safeMeeting.startUrl;
    return res.status(502).json({
      success: false,
      partial: true,
      code: err.code || 'GRAPH_SEND_FAILED',
      message: err.message,
      meeting: safeMeeting,
      icsDownloadUrl: err.icsDownloadUrl || null
    });
  }

  res.status(status).json({
    success: false,
    code,
    message: safeMessages[code] || err.message || 'An unexpected error occurred.'
  });
}

module.exports = { errorHandler };
