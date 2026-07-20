const express = require('express');
const { getConfig } = require('../config');
const { createOAuthState } = require('../utils/crypto');
const { redactObject } = require('../utils/redact');

function createZoomAuthRouter(options = {}) {
  const router = express.Router();
  const config = options.config || getConfig();

  router.get('/zoom', (req, res) => {
    const state = createOAuthState();
    req.session.zoomOAuth = { state };

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.zoom.clientId,
      redirect_uri: config.zoom.redirectUri,
      state,
      scope: config.zoom.scopes
    });

    res.redirect(`${config.zoom.authorizeUrl}?${params.toString()}`);
  });

  router.get('/zoom/callback', async (req, res, next) => {
    try {
      const { code, state, error } = req.query;
      const oauth = req.session.zoomOAuth;

      if (error) {
        const err = new Error('Zoom consent was denied.');
        err.code = 'ZOOM_CONSENT_DENIED';
        err.status = 400;
        throw err;
      }

      if (!oauth || state !== oauth.state) {
        const err = new Error('Invalid OAuth state.');
        err.code = 'ZOOM_CONSENT_DENIED';
        err.status = 400;
        throw err;
      }

      const credentials = Buffer.from(
        `${config.zoom.clientId}:${config.zoom.clientSecret}`
      ).toString('base64');

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.zoom.redirectUri
      });

      const response = await fetch(config.zoom.tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Zoom OAuth token exchange failed:', redactObject(data));
        const err = new Error('Zoom authentication failed.');
        err.code = 'ZOOM_CONSENT_DENIED';
        err.status = 400;
        throw err;
      }

      req.session.zoom = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000
      };
      delete req.session.zoomOAuth;

      res.redirect('/?connected=zoom');
    } catch (error) {
      next(error);
    }
  });

  router.get('/zoom/status', (req, res) => {
    if (config.zoomMock) {
      return res.json({
        connected: true,
        mock: true,
        joinUrl: config.mockZoomJoinUrl,
        meetingId: config.mockZoomMeetingId
      });
    }
    res.json({
      connected: Boolean(req.session.zoom?.accessToken)
    });
  });

  router.post('/zoom/logout', (req, res) => {
    delete req.session.zoom;
    delete req.session.zoomOAuth;
    res.json({ success: true });
  });

  return router;
}

module.exports = { createZoomAuthRouter };
