'use strict';

/**
 * Okta + Genesys auth for career-assistant.html only.
 * Mirrors portal flow: Okta login → silent authCode prefetch → Genesys Auth.signIn.
 */

const OKTA_DOMAIN = 'https://integrator-3289699.okta.com';
const OKTA_PORTAL_CLIENT_ID = '0oa14bhl9ck5pJ4iH698';
const OKTA_GENESYS_CLIENT_ID = '0oa14bp5cafStwgaY698';
const OKTA_ISSUER = OKTA_DOMAIN + '/oauth2/default';
const REDIRECT_URI = window.location.origin + window.location.pathname;

const REDIRECT_SESSION_KEY = 'ca-okta-redirect-attempted';
const PENDING_AUTH_CODE_KEY = 'ca-genesys-pending-auth-code';
const GENESYS_PREFETCH_KEY = 'ca-genesys-prefetch-code';
const GENESYS_AUTH_SESSION_KEY = 'ca-genesys-chat-authenticated';
const GENESYS_TRANSACTION_STORAGE_KEY = 'okta-ca-genesys-transaction';

function createOktaStorageManager(prefix) {
  return {
    token: { storageTypes: ['sessionStorage'], storageKey: prefix + '-token' },
    cache: { storageTypes: ['sessionStorage'], storageKey: prefix + '-cache' },
    transaction: { storageTypes: ['sessionStorage'], storageKey: prefix + '-transaction' }
  };
}

const portalOktaAuth = new OktaAuth({
  issuer: OKTA_ISSUER,
  clientId: OKTA_PORTAL_CLIENT_ID,
  redirectUri: REDIRECT_URI,
  scopes: ['openid', 'profile', 'email'],
  pkce: true,
  storageManager: createOktaStorageManager('okta-ca-portal')
});

const genesysOktaAuth = new OktaAuth({
  issuer: OKTA_ISSUER,
  clientId: OKTA_GENESYS_CLIENT_ID,
  redirectUri: REDIRECT_URI,
  scopes: ['openid', 'profile', 'email'],
  pkce: true,
  storageManager: createOktaStorageManager('okta-ca-genesys')
});

const oktaAuth = portalOktaAuth;

function captureAuthCodeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      if (window.CareerMarketplaceGenesysAuth?.persistAuthHandoff) {
        window.CareerMarketplaceGenesysAuth.persistAuthHandoff(code);
      } else {
        sessionStorage.setItem(PENDING_AUTH_CODE_KEY, code);
        try {
          const raw = sessionStorage.getItem(GENESYS_TRANSACTION_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.codeVerifier) {
              sessionStorage.setItem('ca-genesys-pending-code-verifier', parsed.codeVerifier);
            }
            if (parsed.nonce) {
              sessionStorage.setItem('ca-genesys-pending-nonce', parsed.nonce);
            }
          }
        } catch (e) { /* ignore */ }
      }
      return code;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function clearGenesysAuthHandoff() {
  try {
    sessionStorage.removeItem(PENDING_AUTH_CODE_KEY);
    sessionStorage.removeItem('ca-genesys-pending-code-verifier');
    sessionStorage.removeItem('ca-genesys-pending-nonce');
  } catch (e) { /* ignore */ }
  window.CareerMarketplaceGenesysAuth?.clearHandoff?.();
}

function hasPendingAuthHandoff() {
  try {
    return !!sessionStorage.getItem(PENDING_AUTH_CODE_KEY) &&
      !!sessionStorage.getItem('ca-genesys-pending-code-verifier');
  } catch (e) {
    return false;
  }
}

function isGenesysSessionAuthenticated() {
  return CareerMarketplaceAuth.genesysChatAuthenticated ||
    sessionStorage.getItem(GENESYS_AUTH_SESSION_KEY) === 'true';
}

function shouldPrefetchGenesysAuthCode() {
  if (isGenesysSessionAuthenticated()) return false;
  if (hasPendingAuthHandoff()) return false;
  return true;
}

function prefetchGenesysAuthCode(force) {
  if (!force && !shouldPrefetchGenesysAuthCode()) {
    console.debug('[career-assistant] skipping Genesys authCode prefetch — session already has code or is authenticated');
    return;
  }
  clearGenesysAuthHandoff();
  sessionStorage.setItem(GENESYS_PREFETCH_KEY, 'true');
  return genesysOktaAuth.signInWithRedirect({ prompt: 'none' });
}

function ensureGenesysAuthProvider() {
  window.enableCareerAssistantGenesysAuth?.();
}

async function completeLogin(claims) {
  try { sessionStorage.removeItem(REDIRECT_SESSION_KEY); } catch (e) { /* ignore */ }
  CareerMarketplaceAuth.callbacks.onAuthenticated?.(claims);
  prefetchGenesysAuthCode(true);
}

const CareerMarketplaceAuth = {
  oktaAuth: portalOktaAuth,
  portalOktaAuth,
  genesysOktaAuth,
  OKTA_PORTAL_CLIENT_ID,
  OKTA_GENESYS_CLIENT_ID,
  OKTA_CLIENT_ID: OKTA_PORTAL_CLIENT_ID,
  OKTA_DOMAIN,
  OKTA_ISSUER,
  REDIRECT_URI,
  GENESYS_TRANSACTION_STORAGE_KEY,
  GENESYS_PREFETCH_KEY,
  PENDING_AUTH_CODE_KEY,
  PENDING_VERIFIER_KEY: 'ca-genesys-pending-code-verifier',
  PENDING_NONCE_KEY: 'ca-genesys-pending-nonce',
  PENDING_CAPTURED_AT_KEY: 'ca-genesys-pending-captured-at',
  genesysChatAuthenticated: false,

  callbacks: {
    onAuthenticated: null,
    onUnauthenticated: null,
    onRedirecting: null,
    onHandlingCallback: null
  },

  async getUserClaims() {
    const idToken = await portalOktaAuth.tokenManager.get('idToken');
    return idToken ? idToken.claims : null;
  },

  signIn() {
    try { sessionStorage.setItem(REDIRECT_SESSION_KEY, 'true'); } catch (e) { /* ignore */ }
    CareerMarketplaceAuth.callbacks.onRedirecting?.();
    return portalOktaAuth.signInWithRedirect();
  },

  signInForGenesysPrefetch() {
    sessionStorage.setItem(GENESYS_PREFETCH_KEY, 'true');
    return genesysOktaAuth.signInWithRedirect({ prompt: 'none' });
  },

  async signOut() {
    try {
      sessionStorage.removeItem(PENDING_AUTH_CODE_KEY);
      sessionStorage.removeItem(GENESYS_PREFETCH_KEY);
      sessionStorage.removeItem(REDIRECT_SESSION_KEY);
      sessionStorage.removeItem(GENESYS_AUTH_SESSION_KEY);
    } catch (e) { /* ignore */ }
    CareerMarketplaceAuth.genesysChatAuthenticated = false;
    try { await window.CareerMarketplaceGenesysAuth?.logout?.(); } catch (e) { /* ignore */ }
    CareerMarketplaceAuth.callbacks.onUnauthenticated?.();
    await portalOktaAuth.signOut({ closeSession: false });
  },

  onGenesysChatAuthenticated(data) {
    CareerMarketplaceAuth.genesysChatAuthenticated = true;
    try { sessionStorage.setItem(GENESYS_AUTH_SESSION_KEY, 'true'); } catch (e) { /* ignore */ }
    window.dispatchEvent(new CustomEvent('ca:genesys-authenticated', { detail: data }));
  },

  onGenesysInjectionError(error) {
    window.dispatchEvent(new CustomEvent('ca:genesys-auth-error', { detail: error }));
  },

  async init() {
    if (portalOktaAuth.isLoginRedirect()) {
      const isGenesysPrefetch = sessionStorage.getItem(GENESYS_PREFETCH_KEY);

      if (isGenesysPrefetch) {
        sessionStorage.removeItem(GENESYS_PREFETCH_KEY);
        const prefetchCode = new URLSearchParams(window.location.search).get('code');
        if (prefetchCode && window.CareerMarketplaceGenesysAuth?.persistAuthHandoff) {
          window.CareerMarketplaceGenesysAuth.persistAuthHandoff(prefetchCode);
        } else {
          captureAuthCodeFromUrl();
        }
        history.replaceState({}, document.title, window.location.pathname);
        window.CareerMarketplaceGenesysAuth?.queueAutoAuth?.('prefetch-complete');
        const claims = await CareerMarketplaceAuth.getUserClaims();
        if (claims) {
          if (sessionStorage.getItem(GENESYS_AUTH_SESSION_KEY) === 'true') {
            CareerMarketplaceAuth.genesysChatAuthenticated = true;
          }
          CareerMarketplaceAuth.callbacks.onAuthenticated?.(claims);
          if (CareerMarketplaceAuth.genesysChatAuthenticated) {
            window.dispatchEvent(new CustomEvent('ca:genesys-authenticated'));
          }
        }
        return;
      }

      CareerMarketplaceAuth.callbacks.onHandlingCallback?.();
      try {
        await portalOktaAuth.handleLoginRedirect();
      } catch (err) {
        console.error('[career-assistant] Okta callback failed:', err);
        CareerMarketplaceAuth.callbacks.onUnauthenticated?.();
        return;
      }

      history.replaceState({}, document.title, window.location.pathname);
      const claims = await CareerMarketplaceAuth.getUserClaims();
      if (claims) await completeLogin(claims);
      else CareerMarketplaceAuth.callbacks.onUnauthenticated?.();
      return;
    }

    if (await portalOktaAuth.isAuthenticated()) {
      const claims = await CareerMarketplaceAuth.getUserClaims();
      if (claims) {
        if (sessionStorage.getItem(GENESYS_AUTH_SESSION_KEY) === 'true') {
          CareerMarketplaceAuth.genesysChatAuthenticated = true;
        }
        CareerMarketplaceAuth.callbacks.onAuthenticated?.(claims);
        if (isGenesysSessionAuthenticated()) {
          window.dispatchEvent(new CustomEvent('ca:genesys-authenticated'));
        } else if (hasPendingAuthHandoff()) {
          window.CareerMarketplaceGenesysAuth?.queueAutoAuth?.('pending-code-restore');
        } else {
          prefetchGenesysAuthCode();
        }
      } else {
        CareerMarketplaceAuth.callbacks.onUnauthenticated?.();
      }
    } else {
      CareerMarketplaceAuth.callbacks.onUnauthenticated?.();
    }
  }
};

window.CareerMarketplaceAuth = CareerMarketplaceAuth;

document.addEventListener('DOMContentLoaded', () => CareerMarketplaceAuth.init());
