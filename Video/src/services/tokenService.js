const { getConfig } = require('../config');
const { redactObject } = require('../utils/redact');

async function refreshZoomToken(session) {
  const config = getConfig();
  const tokens = session.zoom;
  if (!tokens?.refreshToken) {
    const err = new Error('Zoom refresh token is missing. Please reconnect Zoom.');
    err.code = 'ZOOM_TOKEN_EXPIRED';
    err.status = 401;
    throw err;
  }

  const credentials = Buffer.from(
    `${config.zoom.clientId}:${config.zoom.clientSecret}`
  ).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken
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
    console.error('Zoom token refresh failed:', redactObject(data));
    const err = new Error('Zoom token refresh failed. Please reconnect Zoom.');
    err.code = 'ZOOM_TOKEN_EXPIRED';
    err.status = 401;
    throw err;
  }

  session.zoom = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000
  };

  return session.zoom.accessToken;
}

async function getValidZoomAccessToken(session) {
  const tokens = session.zoom;
  if (!tokens?.accessToken) {
    const err = new Error('Zoom account is not connected.');
    err.code = 'ZOOM_NOT_CONNECTED';
    err.status = 401;
    throw err;
  }

  const bufferMs = 60 * 1000;
  if (tokens.expiresAt && Date.now() >= tokens.expiresAt - bufferMs) {
    return refreshZoomToken(session);
  }

  return tokens.accessToken;
}

async function refreshMicrosoftToken(msalClient, session) {
  const account = session.microsoft?.account;
  const tokenCache = session.microsoft?.tokenCache;
  if (!account || !tokenCache) {
    const err = new Error('Microsoft account is not connected.');
    err.code = 'MICROSOFT_NOT_CONNECTED';
    err.status = 401;
    throw err;
  }

  const config = getConfig();
  msalClient.getTokenCache().deserialize(tokenCache);

  try {
    const result = await msalClient.acquireTokenSilent({
      account,
      scopes: config.microsoft.scopes,
      forceRefresh: true
    });

    session.microsoft.tokenCache = msalClient.getTokenCache().serialize();
    session.microsoft.accessToken = result.accessToken;
    session.microsoft.expiresAt = result.expiresOn
      ? result.expiresOn.getTime()
      : Date.now() + 3600 * 1000;

    return result.accessToken;
  } catch (error) {
    console.error('Microsoft token refresh failed:', error.message);
    const err = new Error('Microsoft token expired. Please reconnect Microsoft.');
    err.code = 'MICROSOFT_TOKEN_EXPIRED';
    err.status = 401;
    throw err;
  }
}

async function getValidMicrosoftAccessToken(msalClient, session) {
  if (!session.microsoft?.accessToken) {
    const err = new Error('Microsoft account is not connected.');
    err.code = 'MICROSOFT_NOT_CONNECTED';
    err.status = 401;
    throw err;
  }

  const bufferMs = 60 * 1000;
  if (session.microsoft.expiresAt && Date.now() >= session.microsoft.expiresAt - bufferMs) {
    return refreshMicrosoftToken(msalClient, session);
  }

  return session.microsoft.accessToken;
}

module.exports = {
  refreshZoomToken,
  getValidZoomAccessToken,
  refreshMicrosoftToken,
  getValidMicrosoftAccessToken
};
