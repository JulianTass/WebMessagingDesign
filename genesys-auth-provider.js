'use strict';

/**
 * AuthProvider — Genesys OIDC authCode handoff (Implicit Flow = False).
 * All stages logged to CareerMarketplaceTrace (persistent console trace).
 */

(function registerEarlyAuthProvider() {
  if (!window.Genesys) {
    console.error('Genesys bootstrap missing — AuthProvider cannot register.');
    return;
  }

  const REDIRECT_URI = window.location.origin + window.location.pathname;
  const PENDING_CODE_KEY = 'genesys-pending-auth-code';
  const PENDING_VERIFIER_KEY = 'genesys-pending-code-verifier';
  const PENDING_NONCE_KEY = 'genesys-pending-nonce';
  const PENDING_CAPTURED_AT_KEY = 'genesys-pending-captured-at';
  const OKTA_TEST_PAYLOAD_KEY = 'career-marketplace-okta-test-payload';
  let authProviderRef = null;
  let authCodeDelivered = false;
  let lastDeliveredCodePrefix = null;
  let lastDeliveredPayload = null;
  let autoAuthInFlight = false;
  let lastAutoAuthAt = 0;
  const AUTO_AUTH_COOLDOWN_MS = 3000;
  const genesysAuthState = {
    authPluginReady: false,
    allowSessionUpgrade: null,
    messagingStarted: false,
    messagingAuthenticated: false,
    pendingSource: null
  };

  function debugIngest(hypothesisId, location, message, data) {
    const entry = {
      sessionId: 'c75c01',
      runId: 'pre-fix',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    };
    try {
      const key = 'debug-c75c01-logs';
      const logs = JSON.parse(sessionStorage.getItem(key) || '[]');
      logs.push(entry);
      sessionStorage.setItem(key, JSON.stringify(logs.slice(-50)));
    } catch (e) { /* ignore */ }
    // #region agent log
    fetch('http://127.0.0.1:7627/ingest/63da4487-a4a4-40e8-94a8-611f0aeafd46', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'c75c01' },
      body: JSON.stringify(entry)
    }).catch(() => {});
    // #endregion
  }

  function codeFingerprint(code) {
    if (!code || typeof code !== 'string') return null;
    return code.slice(0, 6) + '…' + code.slice(-6);
  }

  function trace(level, stage, detail) {
    if (window.CareerMarketplaceTrace) {
      window.CareerMarketplaceTrace[level](stage, detail || {});
    } else {
      console.log('[GENESYS]', stage, detail);
    }
  }

  function dumpError(label, error) {
    const data = error?.data || error;
    trace('error', label, {
      message: data?.message,
      code: data?.code,
      status: data?.status,
      contextId: data?.contextId,
      full: data
    });
    console.group('❌ ' + label);
    console.error(error);
    try { console.error(JSON.stringify(error, null, 2)); } catch (e) { /* ignore */ }
    console.groupEnd();
  }

  function readOktaTransactionMeta() {
    try {
      const genesysKey = window.CareerMarketplaceAuth?.GENESYS_TRANSACTION_STORAGE_KEY || 'okta-genesys-transaction';
      const raw = window.sessionStorage.getItem(genesysKey) ||
                  window.sessionStorage.getItem('okta-genesys-transaction') ||
                  window.sessionStorage.getItem('okta-transaction-storage') ||
                  window.sessionStorage.getItem('okta-pkce-storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        return { nonce: parsed.nonce, codeVerifier: parsed.codeVerifier };
      }
    } catch (e) { /* ignore */ }
    return { nonce: undefined, codeVerifier: undefined };
  }

  function getPendingAuthCode() {
    try { return sessionStorage.getItem(PENDING_CODE_KEY); } catch (e) { return null; }
  }

  function clearAuthHandoff() {
    authCodeDelivered = false;
    lastDeliveredPayload = null;
    try {
      sessionStorage.removeItem(PENDING_CODE_KEY);
      sessionStorage.removeItem(PENDING_VERIFIER_KEY);
      sessionStorage.removeItem(PENDING_NONCE_KEY);
    } catch (e) { /* ignore */ }
    trace('log', 'auth-handoff-cleared', {});
  }

  function saveOktaTestPayload(authCode, meta) {
    try {
      sessionStorage.setItem(OKTA_TEST_PAYLOAD_KEY, JSON.stringify({
        authCode,
        codeVerifier: meta.codeVerifier || null,
        nonce: meta.nonce || null,
        redirectUri: REDIRECT_URI,
        clientId: window.CareerMarketplaceAuth?.OKTA_GENESYS_CLIENT_ID || '0oa14bp5cafStwgaY698',
        capturedAt: Date.now(),
        used: false
      }));
    } catch (e) { /* ignore */ }
  }

  function markOktaTestPayloadUsed() {
    try {
      const raw = sessionStorage.getItem(OKTA_TEST_PAYLOAD_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      parsed.used = true;
      parsed.usedAt = Date.now();
      sessionStorage.setItem(OKTA_TEST_PAYLOAD_KEY, JSON.stringify(parsed));
    } catch (e) { /* ignore */ }
  }

  function persistAuthHandoff(authCode) {
    const meta = readOktaTransactionMeta();
    try {
      sessionStorage.setItem(PENDING_CODE_KEY, authCode);
      if (meta.codeVerifier) sessionStorage.setItem(PENDING_VERIFIER_KEY, meta.codeVerifier);
      if (meta.nonce) sessionStorage.setItem(PENDING_NONCE_KEY, meta.nonce);
      sessionStorage.setItem(PENDING_CAPTURED_AT_KEY, String(Date.now()));
      saveOktaTestPayload(authCode, meta);
    } catch (e) { /* ignore */ }
    debugIngest('H-C', 'genesys-auth-provider.js:persistAuthHandoff', 'authCode captured', {
      codeFingerprint: codeFingerprint(authCode),
      hasCodeVerifier: !!meta.codeVerifier,
      verifierLen: meta.codeVerifier ? meta.codeVerifier.length : 0,
      hasNonce: !!meta.nonce,
      nonceLen: meta.nonce ? meta.nonce.length : 0,
      storageKey: window.CareerMarketplaceAuth?.GENESYS_TRANSACTION_STORAGE_KEY || 'okta-genesys-transaction'
    });
    trace('log', '2-authCode-captured-for-genesys', {
      authCode: window.CareerMarketplaceTrace?.redact(authCode) || '***',
      hasCodeVerifier: !!meta.codeVerifier,
      hasNonce: !!meta.nonce,
      redirectUri: REDIRECT_URI
    });
  }

  function buildAuthPayload() {
    const authCode = getPendingAuthCode();
    if (!authCode) {
      trace('warn', '6-buildAuthPayload-NO-CODE', {
        hint: 'No pending authCode — signIn click will trigger silent Okta redirect'
      });
      return null;
    }

    let nonce;
    let codeVerifier;
    try {
      nonce = sessionStorage.getItem(PENDING_NONCE_KEY) || undefined;
      codeVerifier = sessionStorage.getItem(PENDING_VERIFIER_KEY) || undefined;
    } catch (e) { /* ignore */ }

    if (!nonce || !codeVerifier) {
      const meta = readOktaTransactionMeta();
      nonce = nonce || meta.nonce;
      codeVerifier = codeVerifier || meta.codeVerifier;
    }

    return {
      authCode,
      redirectUri: REDIRECT_URI,
      nonce,
      codeVerifier: codeVerifier || undefined
    };
  }

  function resolveAuthPayloadForGenesys(source) {
    if (lastDeliveredPayload) {
      trace('log', '6-redeliver-to-genesys-' + source, {
        reason: 'Reusing PKCE payload — Genesys server exchange uses getAuthCode response (codeVerifier required)',
        hasCodeVerifier: !!lastDeliveredPayload.codeVerifier,
        hasNonce: !!lastDeliveredPayload.nonce
      });
      if (window.CareerMarketplaceDebug?.isEnabled?.()) {
        trace('log', '6-FULL-PAYLOAD-DEBUG', {
          authCode: lastDeliveredPayload.authCode,
          codeVerifier: lastDeliveredPayload.codeVerifier,
          nonce: lastDeliveredPayload.nonce,
          redirectUri: lastDeliveredPayload.redirectUri,
          redelivery: source
        });
      }
      return {
        authCode: lastDeliveredPayload.authCode,
        redirectUri: lastDeliveredPayload.redirectUri,
        nonce: lastDeliveredPayload.nonce,
        codeVerifier: lastDeliveredPayload.codeVerifier
      };
    }

    const payload = buildAuthPayload();
    if (!payload) return null;

    authCodeDelivered = true;
    lastDeliveredCodePrefix = codeFingerprint(payload.authCode);
    lastDeliveredPayload = {
      authCode: payload.authCode,
      redirectUri: payload.redirectUri,
      nonce: payload.nonce,
      codeVerifier: payload.codeVerifier
    };
    markOktaTestPayloadUsed();
    debugIngest('H-B,H-E', 'genesys-auth-provider.js:resolveAuthPayloadForGenesys', 'delivering auth payload', {
      source,
      codeFingerprint: lastDeliveredCodePrefix,
      hasCodeVerifier: !!payload.codeVerifier,
      verifierLen: payload.codeVerifier ? payload.codeVerifier.length : 0,
      hasNonce: !!payload.nonce,
      capturedAt: sessionStorage.getItem(PENDING_CAPTURED_AT_KEY) || null,
      ageMs: sessionStorage.getItem(PENDING_CAPTURED_AT_KEY)
        ? Date.now() - Number(sessionStorage.getItem(PENDING_CAPTURED_AT_KEY))
        : null
    });
    trace('log', '6-deliver-to-genesys-' + source, {
      authCode: window.CareerMarketplaceTrace?.redact(payload.authCode),
      redirectUri: payload.redirectUri,
      nonce: payload.nonce ? (payload.nonce.slice(0, 12) + '…') : null,
      hasCodeVerifier: !!payload.codeVerifier,
      nextStep: 'Genesys exchanges authCode with Okta OIDC → returns Genesys JWT'
    });

    if (window.CareerMarketplaceDebug?.isEnabled?.()) {
      trace('log', '6-FULL-PAYLOAD-DEBUG', {
        authCode: payload.authCode,
        codeVerifier: payload.codeVerifier,
        nonce: payload.nonce,
        redirectUri: payload.redirectUri
      });
    }

    return { ...lastDeliveredPayload };
  }

  function requestFreshAuthCode() {
    authCodeDelivered = false;
    lastDeliveredPayload = null;
    trace('warn', '6-request-fresh-authCode', {
      action: 'silent Okta redirect (prompt=none)',
      reason: 'no valid authCode available for Genesys'
    });
    if (window.CareerMarketplaceAuth?.signInForGenesysPrefetch) {
      window.CareerMarketplaceAuth.signInForGenesysPrefetch();
    } else if (window.CareerMarketplaceAuth?.genesysOktaAuth) {
      sessionStorage.setItem('genesys-prefetch-code', 'true');
      window.CareerMarketplaceAuth.genesysOktaAuth.signInWithRedirect({ prompt: 'none' });
    }
  }

  function isGenesysAlreadyAuthenticated() {
    if (window.CareerMarketplaceAuth?.genesysChatAuthenticated) return true;
    if (authProviderRef) {
      try {
        return !!authProviderRef.data('Auth.authenticated');
      } catch (e) { /* ignore */ }
    }
    return false;
  }

  function resolveAuthCommand() {
    if (!genesysAuthState.messagingStarted || genesysAuthState.messagingAuthenticated) {
      return null;
    }
    if (genesysAuthState.allowSessionUpgrade) {
      return 'Auth.signIn';
    }
    return null;
  }

  function queueAutoAuth(source) {
    genesysAuthState.pendingSource = source;
    flushPendingAutoAuth();
  }

  function flushPendingAutoAuth() {
    if (!genesysAuthState.pendingSource) return;
    if (!authProviderRef || !genesysAuthState.authPluginReady) {
      trace('log', '4-autoAuth-DEFER', {
        source: genesysAuthState.pendingSource,
        reason: 'waiting for AuthProvider + Auth.ready'
      });
      return;
    }
    if (!genesysAuthState.messagingStarted || genesysAuthState.messagingAuthenticated) {
      trace('log', '4-autoAuth-DEFER', {
        source: genesysAuthState.pendingSource,
        reason: 'waiting for MessagingService.started (anonymous session)',
        allowSessionUpgrade: genesysAuthState.allowSessionUpgrade
      });
      return;
    }
    const source = genesysAuthState.pendingSource;
    genesysAuthState.pendingSource = null;
    attemptMessengerAuthentication(source);
  }

  async function attemptMessengerAuthentication(source) {
    if (autoAuthInFlight) return;
    if (isGenesysAlreadyAuthenticated()) return;

    if (!authProviderRef || !genesysAuthState.authPluginReady) {
      queueAutoAuth(source);
      return;
    }

    const now = Date.now();
    if (now - lastAutoAuthAt < AUTO_AUTH_COOLDOWN_MS) return;

    const oktaAuth = window.CareerMarketplaceAuth?.portalOktaAuth || window.CareerMarketplaceAuth?.oktaAuth;
    const portalAuthed = oktaAuth ? await oktaAuth.isAuthenticated() : false;
    if (!portalAuthed) {
      trace('log', '4-autoAuth-SKIP', { source, reason: 'portal not authenticated' });
      return;
    }

    const hasPendingCode = !!getPendingAuthCode();
    if (!hasPendingCode && !authCodeDelivered) {
      trace('log', '4-autoAuth-WAIT-CODE', {
        source,
        action: 'prefetching authCode before Genesys Auth.signIn'
      });
      requestFreshAuthCode();
      genesysAuthState.pendingSource = source;
      return;
    }

    if (authCodeDelivered) {
      trace('log', '4-autoAuth-SKIP', {
        source,
        reason: 'authCode already delivered — waiting for Genesys exchange'
      });
      return;
    }

    if (!genesysAuthState.messagingStarted || genesysAuthState.messagingAuthenticated) {
      queueAutoAuth(source);
      return;
    }

    const authCommand = resolveAuthCommand();
    if (!authCommand) {
      trace('warn', '4-autoAuth-SKIP', {
        source,
        reason: 'allowSessionUpgrade is false — Genesys will call getAuthCode handler when messenger opens',
        allowSessionUpgrade: genesysAuthState.allowSessionUpgrade
      });
      return;
    }

    autoAuthInFlight = true;
    lastAutoAuthAt = now;
    trace('log', '4-autoAuth-TRIGGER', {
      source,
      command: authCommand,
      hasPendingCode,
      allowSessionUpgrade: genesysAuthState.allowSessionUpgrade,
      messagingStarted: genesysAuthState.messagingStarted,
      hint: 'Auth.signIn after MessagingService.started — same path as clicking Sign in'
    });

    try {
      const result = authProviderRef.command(authCommand);
      if (result && typeof result.then === 'function') {
        await result.catch((err) => {
          const msg = err?.message || err?.data?.message || String(err);
          if (/unable to fetch authentication token/i.test(msg) && authCodeDelivered) {
            trace('error', '8-EXCHANGE-FAILED-SERVER', {
              source,
              message: msg,
              hint: 'Client handoff OK — Genesys server could not exchange authCode with Okta',
              checkGenesysAdmin: {
                integrationId: '38579f70-393b-4011-b703-0a3d644740c9',
                implicitFlowSupport: 'must be False',
                clientId: '0oa14bp5cafStwgaY698',
                clientSecret: 'active secret from same Okta Web app',
                redirectUri: REDIRECT_URI
              }
            });
            return;
          }
          trace('warn', '4-autoAuth-COMMAND-FAILED', { source, command: authCommand, message: msg });
        });
      }
    } catch (err) {
      trace('warn', '4-autoAuth-COMMAND-THREW', {
        source,
        command: authCommand,
        message: err?.message || String(err)
      });
    } finally {
      autoAuthInFlight = false;
    }
  }

  trace('log', '0-authProvider-init', {
    redirectUri: REDIRECT_URI,
    flow: 'authCode',
    genesysClientId: window.CareerMarketplaceAuth?.OKTA_GENESYS_CLIENT_ID
  });

  try {
    Genesys('registerPlugin', 'AuthProvider', (AuthProvider) => {
      authProviderRef = AuthProvider;
      trace('log', '0-authProvider-registered', {});

      AuthProvider.registerCommand('signIn', async (e) => {
        const isProactive = autoAuthInFlight || /autoAuth|MessagingService|prefetch/i.test(String(e?.data?.source || ''));
        trace('log', '5-signIn-CALLED', {
          from: isProactive ? 'proactive Auth.signIn command' : 'user clicked Sign in in Genesys messenger',
          requestData: e.data || {}
        });

        const pendingBeforeDeliver = getPendingAuthCode();
        if (pendingBeforeDeliver && lastDeliveredCodePrefix &&
            codeFingerprint(pendingBeforeDeliver) === lastDeliveredCodePrefix) {
          debugIngest('H-B,H-E', 'genesys-auth-provider.js:signIn', 'burned code detected — requesting fresh', {
            codeFingerprint: lastDeliveredCodePrefix
          });
          trace('warn', '5-signIn-BURNED-CODE', {
            hint: 'Previous exchange failed — clearing stale code and prefetching fresh authCode'
          });
          clearAuthHandoff();
          lastDeliveredCodePrefix = null;
          requestFreshAuthCode();
          e.resolve();
          return;
        }

        const payload = resolveAuthPayloadForGenesys('signIn');
        if (payload) {
          trace('log', '5-signIn-RESOLVE-authCode', { resolved: true });
          e.resolve(payload);
          return;
        }

        const oktaAuth = window.CareerMarketplaceAuth?.portalOktaAuth || window.CareerMarketplaceAuth?.oktaAuth;
        const isAuthed = oktaAuth && await oktaAuth.isAuthenticated();
        trace('warn', '5-signIn-NO-CODE', {
          oktaAuthenticated: isAuthed,
          action: isAuthed ? 'silent prefetch redirect' : 'full Okta login redirect'
        });

        if (isAuthed) requestFreshAuthCode();
        else if (window.CareerMarketplaceAuth?.signIn) CareerMarketplaceAuth.signIn();
        else if (oktaAuth) oktaAuth.signInWithRedirect();
        else AuthProvider.publish('signInFailed', { message: 'No login handler' });

        e.resolve();
      });

      AuthProvider.registerCommand('getAuthCode', async (e) => {
        trace('log', '5-getAuthCode-CALLED', { requestData: e.data || {} });

        const { forceUpdate } = e.data || {};
        if (forceUpdate) {
          clearAuthHandoff();
          requestFreshAuthCode();
          e.resolve();
          return;
        }

        const wasRedelivery = !!lastDeliveredPayload;
        const payload = resolveAuthPayloadForGenesys('getAuthCode');
        if (payload) {
          trace('log', '5-getAuthCode-RESOLVE-authCode', {
            resolved: true,
            redelivery: wasRedelivery
          });
          e.resolve(payload);
          return;
        }

        trace('error', '5-getAuthCode-NO-CODE', { action: 'requesting fresh authCode' });
        requestFreshAuthCode();
        e.resolve();
      });

      AuthProvider.registerCommand('reAuthenticate', (e) => {
        trace('warn', '5-reAuthenticate-CALLED', {});
        clearAuthHandoff();
        requestFreshAuthCode();
        e.resolve();
      });

      AuthProvider.subscribe('Auth.ready', () => {
        const authed = AuthProvider.data('Auth.authenticated');
        genesysAuthState.authPluginReady = true;
        trace('log', '4-Auth.ready', {
          authenticated: authed,
          next: authed ? undefined : 'waiting for MessagingService.started then Auth.signIn'
        });
        flushPendingAutoAuth();
      });

      AuthProvider.subscribe('Auth.signInAvailable', () => {
        trace('log', '4-Auth.signInAvailable', {
          hint: 'Queued — will Auth.signIn after MessagingService.started'
        });
        queueAutoAuth('Auth.signInAvailable');
      });

      AuthProvider.subscribe('Auth.signedIn', (data) => {
        trace('log', '7-Auth.signedIn', { data: data || {} });
      });

      AuthProvider.subscribe('Auth.signInFailed', (data) => {
        trace('error', '7-Auth.signInFailed', data || {});
      });

      AuthProvider.subscribe('Auth.signingIn', () => {
        trace('log', '7-Auth.signingIn', {});
      });

      AuthProvider.subscribe('Auth.authenticating', () => {
        trace('log', '7-Auth.authenticating', {
          hint: 'Genesys is exchanging authCode with Okta server-side — wait for authenticated or error'
        });
      });

      AuthProvider.subscribe('Auth.authenticated', (data) => {
        const parsed = data?.jwt ? window.CareerMarketplaceTrace?.parseJwt(data.jwt) : null;
        trace('success', '8-Auth.authenticated-SUCCESS', {
          hasJwt: !!(data?.jwt || data?.token),
          jwtClaims: parsed?.payload || data?.claims || null,
          raw: window.CareerMarketplaceDebug?.isEnabled?.() ? data : undefined
        });
        clearAuthHandoff();
        if (window.CareerMarketplaceAuth?.onGenesysChatAuthenticated) {
          window.CareerMarketplaceAuth.onGenesysChatAuthenticated(data);
        }
      });

      AuthProvider.subscribe('Auth.error', (error) => {
        const pendingCode = getPendingAuthCode();
        const pendingFp = codeFingerprint(pendingCode);
        const lastFp = lastDeliveredCodePrefix;
        clearAuthHandoff();
        lastDeliveredCodePrefix = null;
        debugIngest('H-B,H-D,H-E', 'genesys-auth-provider.js:Auth.error', 'genesys auth error', {
          errorKeys: error ? Object.keys(error) : [],
          dataKeys: error?.data ? Object.keys(error.data) : [],
          message: error?.data?.message || error?.message || null,
          code: error?.data?.code || error?.code || null,
          status: error?.data?.status || error?.status || null,
          pendingCodeFingerprint: pendingFp,
          lastDeliveredCodeFingerprint: lastFp,
          handoffCleared: true
        });
        dumpError('8-Auth.error-FAILED', error);
        if (window.CareerMarketplaceAuth?.onGenesysInjectionError) {
          window.CareerMarketplaceAuth.onGenesysInjectionError(error);
        }
      });

      AuthProvider.subscribe('Auth.authError', (error) => {
        const pendingCode = getPendingAuthCode();
        const pendingFp = codeFingerprint(pendingCode);
        const lastFp = lastDeliveredCodePrefix;
        clearAuthHandoff();
        lastDeliveredCodePrefix = null;
        lastAutoAuthAt = 0;
        autoAuthInFlight = false;
        debugIngest('H-B,H-D,H-E', 'genesys-auth-provider.js:Auth.authError', 'genesys authError', {
          errorKeys: error ? Object.keys(error) : [],
          dataKeys: error?.data ? Object.keys(error.data) : [],
          rawDataType: error?.data === undefined ? 'undefined' : typeof error?.data,
          pendingCodeFingerprint: pendingFp,
          lastDeliveredCodeFingerprint: lastFp,
          handoffCleared: true
        });
        dumpError('8-Auth.authError-FAILED', error);
        trace('error', '8-EXCHANGE-FAILED-SERVER', {
          hint: 'Client delivered authCode correctly — Genesys cloud failed Okta exchange',
          genesysAdmin: {
            integration: '38579f70-393b-4011-b703-0a3d644740c9',
            implicitFlowSupport: 'False (required for auth code flow)',
            oktaClientId: '0oa14bp5cafStwgaY698',
            oktaClientSecret: 'must match active secret in Okta Acme Web app',
            redirectUri: REDIRECT_URI
          },
          run: 'CareerMarketplaceDebug.printGenesysAdminChecklist()',
          note: 'Logs saved in console — no auto-redirect so console stays'
        });
        try {
          sessionStorage.setItem('career-marketplace-last-auth-error', JSON.stringify({
            at: Date.now(),
            stage: '8-Auth.authError',
            message: 'Unable to fetch authentication token (Genesys→Okta exchange)'
          }));
        } catch (e) { /* ignore */ }
        window.CareerMarketplaceTrace?.showPanel?.();
        if (window.CareerMarketplaceAuth?.onGenesysInjectionError) {
          window.CareerMarketplaceAuth.onGenesysInjectionError(error);
        }
      });

      AuthProvider.subscribe('Auth.loggedOut', () => trace('log', 'Auth.loggedOut', {}));
      AuthProvider.subscribe('Auth.tokenError', () => trace('error', 'Auth.tokenError', {}));
      AuthProvider.subscribe('Auth.logoutError', () => trace('error', 'Auth.logoutError', {}));

      AuthProvider.ready();
    });

    Genesys('subscribe', 'GenesysJS.configurationReceived', (config) => {
      const dep = config?.data?.deploymentConfig;
      const auth = dep?.auth || dep?.authenticationSettings;
      const clientAuth = dep?.auth;
      const serverAuthSettings = dep?.authenticationSettings;
      const integrationId = auth?.integrationId || serverAuthSettings?.integrationId || clientAuth?.integrationId;
      const authEnabled = auth?.enabled ?? clientAuth?.enabled ?? serverAuthSettings?.enabled;
      const allowSessionUpgrade = clientAuth?.allowSessionUpgrade ?? auth?.allowSessionUpgrade;
      genesysAuthState.allowSessionUpgrade = allowSessionUpgrade;

      debugIngest('H-A', 'genesys-auth-provider.js:configurationReceived', 'deployment auth config', {
        authEnabled,
        integrationId: integrationId || null,
        integrationIdInClientAuth: clientAuth?.integrationId || null,
        integrationIdInAuthSettings: serverAuthSettings?.integrationId || null,
        deploymentConfigKeys: dep ? Object.keys(dep) : [],
        authKeys: clientAuth ? Object.keys(clientAuth) : [],
        authSettingsKeys: serverAuthSettings ? Object.keys(serverAuthSettings) : [],
        deploymentId: window.CareerMarketplaceGenesys?.DEPLOYMENT_ID,
        configDeploymentId: dep?.id || null,
        configVersion: dep?.version || null,
        allowSessionUpgrade: auth?.allowSessionUpgrade
      });

      const integrationHiddenFromBrowser = authEnabled && !clientAuth?.integrationId;
      const integrationMissing = !authEnabled;

      trace('log', '3-genesys-config-received', {
        authEnabled,
        allowSessionUpgrade,
        integrationId: clientAuth?.integrationId,
        integrationIdNote: integrationHiddenFromBrowser
          ? 'integrationId not sent to browser (normal) — verify authenticationSettings.integrationId via Genesys API'
          : undefined,
        knownServerIntegrationId: serverAuthSettings?.integrationId || '(check Genesys API — not sent to browser)',
        deploymentId: window.CareerMarketplaceGenesys?.DEPLOYMENT_ID,
        configVersion: dep?.version,
        authConfigFull: clientAuth || null,
        deploymentConfigKeys: dep ? Object.keys(dep) : [],
        warning: integrationMissing
          ? 'BLOCKER: auth not enabled on deployment'
          : undefined
      });

      if (integrationMissing) {
        trace('error', '3-GENESYS-INTEGRATION-NOT-BOUND', {
          hint: 'Enable authentication on JT_Medibank config and publish deployment',
          authKeys: clientAuth ? Object.keys(clientAuth) : []
        });
      } else if (integrationHiddenFromBrowser) {
        trace('log', '3-GENESYS-AUTH-ENABLED', {
          hint: 'Auth enabled in browser config. integrationId is server-side only. If Sign in fails, check OIDC integration credentials and Implicit Flow = False',
          authKeys: clientAuth ? Object.keys(clientAuth) : []
        });
      }
    });

    Genesys('subscribe', 'MessagingService.started', (event) => {
      const authenticated = event?.data?.authenticated;
      genesysAuthState.messagingStarted = true;
      genesysAuthState.messagingAuthenticated = !!authenticated;
      trace(authenticated ? 'success' : 'warn', '9-MessagingService.started', {
        authenticated,
        newSession: event?.data?.newSession,
        allowSessionUpgrade: genesysAuthState.allowSessionUpgrade,
        next: authenticated ? undefined : 'triggering Auth.signIn with prefetched authCode'
      });
      if (!authenticated) {
        queueAutoAuth('MessagingService.started');
      }
    });

    Genesys('subscribe', 'Messenger.opened', () => {
      queueAutoAuth('Messenger.opened');
    });

    Genesys('subscribe', 'MessagingService.error', (event) => {
      dumpError('9-MessagingService.error', event);
    });
  } catch (err) {
    trace('error', 'authProvider-registration-failed', { message: err?.message });
  }

  // #region agent log
  (function patchFetchForAuthDebug() {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      return origFetch.apply(this, args).then((res) => {
        if (/oauth|jwt|token|auth|webmessaging|purecloud|genesys/i.test(url)) {
          const clone = res.clone();
          clone.text().then((body) => {
            debugIngest('H-D', 'genesys-auth-provider.js:fetch-intercept', 'auth-related fetch', {
              url: url.slice(0, 200),
              status: res.status,
              ok: res.ok,
              bodyPreview: body ? body.slice(0, 300) : null
            });
          }).catch(() => {});
        }
        return res;
      });
    };
  })();
  // #endregion

  window.CareerMarketplaceGenesysAuth = {
    logout() {
      if (authProviderRef) return authProviderRef.command('Auth.logout');
    },
    persistAuthHandoff,
    attemptMessengerAuthentication,
    queueAutoAuth,
    clearHandoff() {
      authCodeDelivered = false;
      clearAuthHandoff();
    },
    getInjectionLog() { return window.CareerMarketplaceTrace?.getLog() || []; },
    getAgentDebugLogs() {
      try { return JSON.parse(sessionStorage.getItem('debug-c75c01-logs') || '[]'); }
      catch (e) { return []; }
    },
    getOktaTestPayload() {
      try {
        const raw = sessionStorage.getItem(OKTA_TEST_PAYLOAD_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
  };
})();
