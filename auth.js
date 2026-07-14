'use strict';

/**
 * Okta PKCE for portal login + background Genesys authCode prefetch.
 * Portal loads immediately on Okta return. A silent second Okta redirect
 * stores a fresh authCode for Genesys so opening Web Messenger is authenticated.
 */

const OKTA_DOMAIN = 'https://integrator-3289699.okta.com';
/** SPA app — browser PKCE login + portal JWT (no client secret in browser). */
const OKTA_PORTAL_CLIENT_ID = '0oa14bhl9ck5pJ4iH698';
/** Web app (Acme) — authCode for Genesys server-side exchange (client secret in Genesys Admin). */
const OKTA_GENESYS_CLIENT_ID = '0oa14bp5cafStwgaY698';
const OKTA_ISSUER = OKTA_DOMAIN + '/oauth2/default';
const REDIRECT_URI = window.location.origin + window.location.pathname;

const REDIRECT_SESSION_KEY = 'okta-redirect-attempted';
const PENDING_AUTH_CODE_KEY = 'genesys-pending-auth-code';
const GENESYS_PREFETCH_KEY = 'genesys-prefetch-code';
const GENESYS_TRANSACTION_STORAGE_KEY = 'okta-genesys-transaction';

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
  storageManager: createOktaStorageManager('okta-portal')
});

const genesysOktaAuth = new OktaAuth({
  issuer: OKTA_ISSUER,
  clientId: OKTA_GENESYS_CLIENT_ID,
  redirectUri: REDIRECT_URI,
  scopes: ['openid', 'profile', 'email'],
  pkce: true,
  storageManager: createOktaStorageManager('okta-genesys')
});

/** @deprecated use portalOktaAuth — kept for existing integrations */
const oktaAuth = portalOktaAuth;

function getOktaNonce() {
  try {
    const raw = window.sessionStorage.getItem('okta-genesys-transaction') ||
                window.sessionStorage.getItem('okta-portal-transaction') ||
                window.sessionStorage.getItem('okta-transaction-storage') ||
                window.sessionStorage.getItem('okta-pkce-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.nonce) return parsed.nonce;
    }
  } catch (e) { /* ignore */ }
  return undefined;
}

function redactToken(token) {
  if (!token || typeof token !== 'string') return token;
  if (token.length <= 20) return '***';
  return token.slice(0, 8) + '…' + token.slice(-8);
}

function captureAuthCodeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      if (window.TalentHubGenesysAuth?.persistAuthHandoff) {
        window.TalentHubGenesysAuth.persistAuthHandoff(code);
      } else {
        sessionStorage.setItem(PENDING_AUTH_CODE_KEY, code);
      }
      console.log('📡 Captured Okta authCode for Genesys (redacted):', redactToken(code));
      return code;
    }
  } catch (e) {
    console.warn('Could not capture auth code:', e);
  }
  return null;
}

function clearRedirectAttempt() {
  try { sessionStorage.removeItem(REDIRECT_SESSION_KEY); } catch (e) { /* ignore */ }
}

function markRedirectAttempt() {
  try { sessionStorage.setItem(REDIRECT_SESSION_KEY, 'true'); } catch (e) { /* ignore */ }
}

async function logOktaJwtDebug(label) {
  const idToken = await portalOktaAuth.tokenManager.get('idToken');
  if (!idToken) return;
  console.group('🧪 [JWT DEBUG] ' + label);
  console.log('Claims:', idToken.claims);
  if (window.TalentHubDebug?.isEnabled?.()) {
    console.log('Full ID Token:', idToken.idToken);
  }
  console.groupEnd();
}

async function completePortalLogin(claims) {
  clearRedirectAttempt();
  console.log('Okta login successful');
  await logOktaJwtDebug('After Okta login');

  if (window.TalentHubTrace) {
    window.TalentHubTrace.success('1-PORTAL-LOGIN-COMPLETE', {
      user: claims?.email || claims?.sub,
      next: 'prefetching Genesys authCode in background'
    });
  }

  if (window.TalentHubGenesys?.showLauncherAfterLogin) {
    window.TalentHubGenesys.showLauncherAfterLogin();
  }

  if (TalentHubAuth.callbacks.onAuthenticated) {
    TalentHubAuth.callbacks.onAuthenticated(claims);
  }
}

function clearGenesysAuthHandoff() {
  try {
    sessionStorage.removeItem(PENDING_AUTH_CODE_KEY);
    sessionStorage.removeItem('genesys-pending-code-verifier');
    sessionStorage.removeItem('genesys-pending-nonce');
  } catch (e) { /* ignore */ }
  if (window.TalentHubGenesysAuth?.clearHandoff) {
    window.TalentHubGenesysAuth.clearHandoff();
  }
}

function prefetchGenesysAuthCode() {
  clearGenesysAuthHandoff();
  window.TalentHubTrace?.log('2-PREFETCH-START', {
    method: 'Okta signInWithRedirect prompt=none',
    clientId: OKTA_GENESYS_CLIENT_ID
  });
  sessionStorage.setItem(GENESYS_PREFETCH_KEY, 'true');
  genesysOktaAuth.signInWithRedirect({ prompt: 'none' });
}

const TalentHubAuth = {
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
  getOktaNonce,
  redactToken,
  genesysChatAuthenticated: false,

  callbacks: {
    onAuthenticated: null,
    onUnauthenticated: null,
    onAuthError: null,
    onRedirecting: null,
    onHandlingCallback: null
  },

  async getUserClaims() {
    const idToken = await portalOktaAuth.tokenManager.get('idToken');
    return idToken ? idToken.claims : null;
  },

  signIn() {
    markRedirectAttempt();
    TalentHubAuth.callbacks.onRedirecting?.();
    return portalOktaAuth.signInWithRedirect();
  },

  /** Silent redirect via Genesys Web app client — captures authCode only (no browser token exchange). */
  signInForGenesysPrefetch() {
    sessionStorage.setItem(GENESYS_PREFETCH_KEY, 'true');
    return genesysOktaAuth.signInWithRedirect({ prompt: 'none' });
  },

  async signOut() {
    clearRedirectAttempt();
    try {
      sessionStorage.removeItem(PENDING_AUTH_CODE_KEY);
      sessionStorage.removeItem(GENESYS_PREFETCH_KEY);
    } catch (e) { /* ignore */ }
    TalentHubAuth.genesysChatAuthenticated = false;
    if (window.TalentHubGenesys?.hideLauncher) window.TalentHubGenesys.hideLauncher();
    try { await window.TalentHubGenesysAuth?.logout?.(); } catch (e) { /* ignore */ }
    TalentHubAuth.callbacks.onUnauthenticated?.();
    await portalOktaAuth.signOut({ closeSession: false });
  },

  onGenesysChatAuthenticated(data) {
    console.log('✅ Genesys Web Messaging authenticated');
    TalentHubAuth.genesysChatAuthenticated = true;
  },

  onGenesysInjectionError(error) {
    const data = error?.data ?? error;
    const msg = (typeof data === 'object' && data !== null)
      ? (data.message || data.error || data.error_description ||
         (error?.eventName === 'authError' ? 'Unable to fetch authentication token (Genesys→Okta server exchange)' : null))
      : String(data);
    window.TalentHubTrace?.error('8-GENESYS-INJECTION-FAILED', {
      message: msg || 'Genesys authentication failed — check 8-EXCHANGE-FAILED-SERVER above',
      full: error?.data ?? error
    });
  },

  renderUnauthedState() {
    if (window.TalentHubGenesys?.hideLauncher) window.TalentHubGenesys.hideLauncher();
    TalentHubAuth.callbacks.onUnauthenticated?.();
  },

  async init() {
    if (portalOktaAuth.isLoginRedirect()) {
      const isGenesysPrefetch = sessionStorage.getItem(GENESYS_PREFETCH_KEY);

      if (isGenesysPrefetch) {
        sessionStorage.removeItem(GENESYS_PREFETCH_KEY);
        captureAuthCodeFromUrl();
        // #region agent log
        fetch('http://127.0.0.1:7627/ingest/63da4487-a4a4-40e8-94a8-611f0aeafd46', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'c75c01' },
          body: JSON.stringify({
            sessionId: 'c75c01',
            runId: 'pre-fix',
            hypothesisId: 'H-C',
            location: 'auth.js:prefetch-return',
            message: 'genesys prefetch redirect returned',
            data: {
              genesysClientId: OKTA_GENESYS_CLIENT_ID,
              portalClientId: OKTA_PORTAL_CLIENT_ID,
              redirectUri: REDIRECT_URI,
              hasCodeInUrl: !!new URLSearchParams(window.location.search).get('code')
            },
            timestamp: Date.now()
          })
        }).catch(() => {});
        // #endregion
        history.replaceState({}, document.title, window.location.pathname);
        window.TalentHubTrace?.success('2-PREFETCH-COMPLETE', {
          hint: 'authCode stored — will Auth.signIn after MessagingService.started',
          genesysClientId: OKTA_GENESYS_CLIENT_ID
        });
        window.TalentHubGenesysAuth?.queueAutoAuth?.('prefetch-complete');

        const claims = await TalentHubAuth.getUserClaims();
        if (claims) {
          if (window.TalentHubGenesys?.showLauncherAfterLogin) {
            window.TalentHubGenesys.showLauncherAfterLogin();
          }
          if (TalentHubAuth.callbacks.onAuthenticated) {
            TalentHubAuth.callbacks.onAuthenticated(claims);
          }
        }
        return;
      }

      TalentHubAuth.callbacks.onHandlingCallback?.();
      try {
        await portalOktaAuth.handleLoginRedirect();
      } catch (err) {
        console.error('Okta handleLoginRedirect failed:', err);
        window.TalentHubTrace?.error('1-PORTAL-LOGIN-FAILED', {
          message: err?.message,
          hint: 'Portal uses SPA client (no secret). Genesys uses Acme Web app separately.'
        });
        TalentHubAuth.renderUnauthedState();
        return;
      }

      history.replaceState({}, document.title, window.location.pathname);
      clearRedirectAttempt();

      const claims = await TalentHubAuth.getUserClaims();
      if (claims) {
        await completePortalLogin(claims);
        prefetchGenesysAuthCode();
      } else {
        TalentHubAuth.renderUnauthedState();
      }
      return;
    }

    const isAuthenticated = await portalOktaAuth.isAuthenticated();
    if (isAuthenticated) {
      const claims = await TalentHubAuth.getUserClaims();
      if (claims) {
        await completePortalLogin(claims);
        prefetchGenesysAuthCode();
      } else {
        TalentHubAuth.renderUnauthedState();
      }
    } else {
      TalentHubAuth.renderUnauthedState();
    }
  }
};

window.TalentHubAuth = TalentHubAuth;
