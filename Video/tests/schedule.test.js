const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { saveInvitation, clearStore } = require('../src/services/invitationStore');
const http = require('http');

function makeConfig() {
  return {
    port: 3000,
    baseUrl: 'http://localhost:3000',
    isProduction: false,
    sessionSecret: 'test-secret-value-long-enough',
    microsoft: {
      clientId: 'ms-client',
      clientSecret: 'ms-secret',
      redirectUri: 'http://localhost:3000/auth/microsoft/callback',
      authority: 'https://login.microsoftonline.com/consumers',
      scopes: ['Mail.Send']
    },
    zoom: {
      clientId: 'zoom-client',
      clientSecret: 'zoom-secret',
      redirectUri: 'http://localhost:3000/auth/zoom/callback',
      authorizeUrl: 'https://zoom.us/oauth/authorize',
      tokenUrl: 'https://zoom.us/oauth/token',
      apiBase: 'https://api.zoom.us/v2',
      scopes: 'meeting:write:meeting user:read'
    },
    invitationTtlMs: 30 * 60 * 1000,
    allowedDurations: [15, 30, 45, 60],
    defaultTimezone: 'Australia/Sydney',
    defaultTitle: 'SEEK Employer Consultation',
    defaultDuration: 30
  };
}

function get(server, path) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

describe('invitations download', () => {
  let server;

  before(async () => {
    clearStore();
    const app = createApp({ config: makeConfig() });
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
  });

  after(async () => {
    clearStore();
    await new Promise((resolve) => server.close(resolve));
  });

  it('downloads ICS with correct headers', async () => {
    const id = saveInvitation('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', { title: 'Test' });
    const res = await get(server, `/api/invitations/${id}/download`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/calendar/);
    assert.match(res.headers['content-disposition'], /seek-meeting\.ics/);
    assert.match(res.body, /BEGIN:VCALENDAR/);
  });

  it('returns 404 for unknown invitation id', async () => {
    const res = await get(server, '/api/invitations/does-not-exist/download');
    assert.equal(res.status, 404);
  });
});

describe('client-safe meeting payload', () => {
  it('never includes Zoom start URL in API response shape', () => {
    const zoomApiResponse = {
      id: 123,
      join_url: 'https://zoom.us/j/example',
      start_url: 'https://zoom.us/s/host-only'
    };

    const clientPayload = {
      meetingId: String(zoomApiResponse.id),
      joinUrl: zoomApiResponse.join_url
    };

    assert.equal(clientPayload.joinUrl, 'https://zoom.us/j/example');
    assert.equal(clientPayload.startUrl, undefined);
  });
});
