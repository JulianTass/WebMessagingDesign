const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateScheduleBody } = require('../src/middleware/validation');

describe('validation', () => {
  it('accepts valid schedule input', () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const date = future.toISOString().slice(0, 10);

    const result = validateScheduleBody({
      customerName: 'Margaret Smith',
      customerEmail: 'margaret@example.com',
      title: 'SEEK Employer Consultation',
      description: 'Review job ad.',
      date,
      time: '10:00',
      durationMinutes: 30,
      timezone: 'Australia/Sydney'
    });

    assert.equal(result.customerEmail, 'margaret@example.com');
    assert.equal(result.durationMinutes, 30);
  });

  it('rejects invalid email addresses', () => {
    assert.throws(() => validateScheduleBody({
      customerName: 'Test',
      customerEmail: 'not-an-email',
      title: 'Title',
      date: '2099-01-01',
      time: '10:00',
      durationMinutes: 30,
      timezone: 'Australia/Sydney'
    }), (err) => err.code === 'VALIDATION_ERROR');
  });

  it('rejects unsupported durations', () => {
    assert.throws(() => validateScheduleBody({
      customerName: 'Test',
      customerEmail: 'test@example.com',
      title: 'Title',
      date: '2099-01-01',
      time: '10:00',
      durationMinutes: 25,
      timezone: 'Australia/Sydney'
    }), (err) => err.code === 'VALIDATION_ERROR');
  });
});
