const SENSITIVE_KEYS = [
  'access_token',
  'refresh_token',
  'accessToken',
  'refreshToken',
  'client_secret',
  'clientSecret',
  'authorization',
  'password',
  'start_url',
  'startUrl'
];

function redactValue(key, value) {
  if (value == null) return value;
  const lower = String(key).toLowerCase();
  if (SENSITIVE_KEYS.some((k) => lower.includes(k.replace(/_/g, '')) || lower.includes(k))) {
    return '[REDACTED]';
  }
  if (typeof value === 'string' && value.length > 80 && /^[A-Za-z0-9._-]+$/.test(value)) {
    return '[REDACTED]';
  }
  return value;
}

function redactObject(input, depth = 0) {
  if (depth > 6 || input == null) return input;
  if (Array.isArray(input)) return input.map((item) => redactObject(item, depth + 1));
  if (typeof input !== 'object') return input;

  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'object' && value !== null) {
      out[key] = redactObject(value, depth + 1);
    } else {
      out[key] = redactValue(key, value);
    }
  }
  return out;
}

module.exports = { redactObject, redactValue };
