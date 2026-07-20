const crypto = require('crypto');

function createOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

function createInvitationId() {
  return crypto.randomBytes(16).toString('hex');
}

function createUid() {
  return `${crypto.randomUUID()}@seek-meeting-scheduler.local`;
}

module.exports = {
  createOAuthState,
  createPkcePair,
  createInvitationId,
  createUid
};
