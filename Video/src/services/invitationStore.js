const { getConfig } = require('../config');
const { createInvitationId } = require('../utils/crypto');

const store = new Map();

function saveInvitation(icsContent, metadata) {
  const config = getConfig();
  const id = createInvitationId();
  const expiresAt = Date.now() + config.invitationTtlMs;
  store.set(id, { icsContent, metadata, expiresAt });
  return id;
}

function getInvitation(id) {
  cleanupExpired();
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(id);
    return null;
  }
  return entry;
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(id);
  }
}

function clearStore() {
  store.clear();
}

function deleteInvitation(id) {
  return store.delete(id);
}

module.exports = {
  saveInvitation,
  getInvitation,
  deleteInvitation,
  cleanupExpired,
  clearStore
};
