require('dotenv').config();

const REQUIRED_ENV = [
  'SESSION_SECRET',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_REDIRECT_URI',
  'ZOOM_CLIENT_ID',
  'ZOOM_CLIENT_SECRET',
  'ZOOM_REDIRECT_URI'
];

function getConfig() {
  const port = parseInt(process.env.PORT || '3000', 10);
  const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const isProduction = process.env.NODE_ENV === 'production';
  const zoomClientId = process.env.ZOOM_CLIENT_ID || '';
  const zoomMock = process.env.ZOOM_MOCK === 'true'
    || zoomClientId.startsWith('placeholder');

  return {
    port,
    baseUrl,
    isProduction,
    sessionSecret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    zoomMock,
    mockZoomJoinUrl: process.env.MOCK_ZOOM_JOIN_URL || 'https://genesys.zoom.us/j/5730504836?pwd=0x39uWU7imanPc5YigqzSal2LbDLjn.1',
    mockZoomMeetingId: process.env.MOCK_ZOOM_MEETING_ID || '5730504836',
    mockZoomPassword: process.env.MOCK_ZOOM_PASSWORD || '0x39uWU7imanPc5YigqzSal2LbDLjn.1',
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      redirectUri: process.env.MICROSOFT_REDIRECT_URI || `${baseUrl}/auth/microsoft/callback`,
      authority: 'https://login.microsoftonline.com/consumers',
      scopes: ['openid', 'profile', 'offline_access', 'User.Read', 'Mail.Send', 'Mail.ReadWrite']
    },
    zoom: {
      clientId: zoomClientId,
      clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
      redirectUri: process.env.ZOOM_REDIRECT_URI || `${baseUrl}/auth/zoom/callback`,
      authorizeUrl: 'https://zoom.us/oauth/authorize',
      tokenUrl: 'https://zoom.us/oauth/token',
      apiBase: 'https://api.zoom.us/v2',
      scopes: 'meeting:write:meeting meeting:write:registrant user:read'
    },
    invitationTtlMs: 30 * 60 * 1000,
    allowedDurations: [15, 30, 45, 60],
    defaultTimezone: 'Australia/Sydney',
    defaultTitle: 'SEEK Employer Consultation',
    defaultDuration: 30,
    agentName: process.env.AGENT_NAME || 'Isabella',
    genesys: {
      queueId: process.env.GENESYS_QUEUE_ID || 'de865468-2bb4-4e40-be02-1467f0a39e13',
      agentId: process.env.GENESYS_AGENT_ID || '5b84d62b-67b1-49d5-9fd8-abcdef123456',
      scriptId: process.env.GENESYS_SCRIPT_ID || '7503eccf-f0e0-49ed-a2d5-c877edccd065',
      defaultCallerId: process.env.GENESYS_DEFAULT_CALLER_ID || '+61406910251'
    }
  };
}

function validateConfig(config) {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const err = new Error(`Missing required environment variables: ${missing.join(', ')}`);
    err.code = 'MISSING_ENV';
    err.status = 500;
    throw err;
  }
  return config;
}

module.exports = { getConfig, validateConfig, REQUIRED_ENV };
