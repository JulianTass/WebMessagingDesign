const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { errorHandler } = require('../src/middleware/errorHandler');

describe('errorHandler', () => {
  it('returns partial failure payload without tokens', () => {
    const jsonCalls = [];
    const res = {
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        jsonCalls.push(payload);
      }
    };

    errorHandler({
      partial: true,
      code: 'GRAPH_SEND_FAILED',
      message: 'Email failed',
      meeting: {
        title: 'SEEK Employer Consultation',
        joinUrl: 'https://zoom.us/j/example',
        meetingId: '123',
        startUrl: 'https://zoom.us/s/secret'
      },
      icsDownloadUrl: '/api/invitations/abc/download'
    }, {}, res, () => {});

    assert.equal(res.statusCode, 502);
    assert.equal(jsonCalls[0].partial, true);
    assert.equal(jsonCalls[0].meeting.joinUrl, 'https://zoom.us/j/example');
    assert.equal(jsonCalls[0].meeting.startUrl, undefined);
  });
});
