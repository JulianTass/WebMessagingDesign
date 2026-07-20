'use strict';

/**
 * Persistent auth trace — survives console clears and page redirects.
 * Console auth trace on localhost. Full JWT/authCode logging in debug mode.
 */

(function () {
  const DEBUG_KEY = 'career-marketplace-debug';
  const TRACE_KEY = 'career-marketplace-auth-trace';
  const MAX_ENTRIES = 200;

  const trace = [];

  function isEnabled() {
    try {
      if (window.location.search.includes('debug=true')) return true;
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return true;
      return sessionStorage.getItem(DEBUG_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function loadPersisted() {
    try {
      const raw = sessionStorage.getItem(TRACE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return [];
  }

  function persist() {
    try {
      sessionStorage.setItem(TRACE_KEY, JSON.stringify(trace.slice(-MAX_ENTRIES)));
    } catch (e) { /* ignore */ }
    window.__genesysInjectionLog = trace;
  }

  function safeStringify(obj) {
    try { return JSON.stringify(obj, null, 2); } catch (e) {
      return String(obj);
    }
  }

  function redact(value) {
    if (!value || typeof value !== 'string') return value;
    if (value.length <= 20) return '***';
    return value.slice(0, 8) + '…' + value.slice(-8);
  }

  function parseJwt(token) {
    if (!token || typeof token !== 'string') return null;
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { header, payload, signature: parts[2] };
    } catch (e) {
      return { error: String(e) };
    }
  }

  let isLogging = false;

  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  function addEntry(level, stage, detail) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      stage,
      detail: typeof detail === 'object' && detail !== null ? detail : { message: String(detail) }
    };
    trace.push(entry);
    if (trace.length > MAX_ENTRIES) trace.shift();
    persist();

    if (isLogging) return;
    isLogging = true;
    try {
      const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : '📡';
      if (level === 'error') origError(`${prefix} [AUTH TRACE] ${stage}`, detail);
      else if (level === 'warn') origWarn(`${prefix} [AUTH TRACE] ${stage}`, detail);
      else origLog(`${prefix} [AUTH TRACE] ${stage}`, detail);
    } finally {
      isLogging = false;
    }
  }

  /* ---- capture external console errors only (never our own trace output) ---- */
  function shouldCaptureConsole(msg) {
    if (!msg || msg.includes('[AUTH TRACE]')) return false;
    return /genesys|messenger|cxbus|unable to fetch authentication/i.test(msg);
  }

  console.error = function (...args) {
    const msg = args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
    if (!isLogging && shouldCaptureConsole(msg)) {
      addEntry('error', 'external-console.error', { message: msg.slice(0, 500) });
    }
    origError.apply(console, args);
  };
  console.warn = function (...args) {
    const msg = args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
    if (!isLogging && shouldCaptureConsole(msg)) {
      addEntry('warn', 'external-console.warn', { message: msg.slice(0, 500) });
    }
    origWarn.apply(console, args);
  };

  /* ---- public trace API (used by auth-provider, auth.js, genesys.js) ---- */
  window.CareerMarketplaceTrace = {
    log(stage, detail) { addEntry('info', stage, detail || {}); },
    warn(stage, detail) { addEntry('warn', stage, detail || {}); },
    error(stage, detail) { addEntry('error', stage, detail || {}); },
    success(stage, detail) { addEntry('success', stage, detail || {}); },
    getLog() { return filterUsefulLog(); },
    clear() {
      trace.length = 0;
      try { sessionStorage.removeItem(TRACE_KEY); } catch (e) { /* ignore */ }
      persist();
    },
    showPanel() {},
    redact,
    parseJwt
  };

  /* restore persisted trace, drop corrupted recursion entries */
  const rawPersisted = loadPersisted();
  const garbageCount = rawPersisted.filter((e) => e.stage === 'console.warn' || e.stage === 'console.error').length;
  const restored = garbageCount > rawPersisted.length * 0.5
    ? rawPersisted.filter((e) => e.stage !== 'console.warn' && e.stage !== 'console.error')
    : rawPersisted.filter((e) => e.stage !== 'console.warn' && e.stage !== 'console.error');
  if (restored.length) trace.push(...restored);
  if (garbageCount > 10) {
    try { sessionStorage.setItem(TRACE_KEY, JSON.stringify(restored)); } catch (e) { /* ignore */ }
  }

  function filterUsefulLog() {
    return trace.filter((e) =>
      !e.stage.startsWith('external-console') &&
      e.stage !== 'console.warn' &&
      e.stage !== 'trace-copied'
    );
  }

  /* ---- CareerMarketplaceDebug helpers ---- */
  const PENDING_CODE_KEY = 'genesys-pending-auth-code';
  const OKTA_TEST_PAYLOAD_KEY = 'career-marketplace-okta-test-payload';

  function getOktaTestPayload() {
    if (window.CareerMarketplaceGenesysAuth?.getOktaTestPayload) {
      return window.CareerMarketplaceGenesysAuth.getOktaTestPayload();
    }
    try {
      const raw = sessionStorage.getItem(OKTA_TEST_PAYLOAD_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async function logOktaTokens() {
    if (!window.CareerMarketplaceAuth) return null;
    const { oktaAuth, REDIRECT_URI } = window.CareerMarketplaceAuth;
    const isAuthed = await oktaAuth.isAuthenticated();
    const idToken = await oktaAuth.tokenManager.get('idToken');
    const accessToken = await oktaAuth.tokenManager.get('accessToken');
    const pendingCode = sessionStorage.getItem(PENDING_CODE_KEY);
    const verifier = sessionStorage.getItem('genesys-pending-code-verifier');
    const nonce = sessionStorage.getItem('genesys-pending-nonce');

    const result = {
      step: '1-OKTA-JWT',
      isAuthenticated: isAuthed,
      redirectUri: REDIRECT_URI,
      pendingAuthCode: pendingCode ? redact(pendingCode) : null,
      hasCodeVerifier: !!verifier,
      hasNonce: !!nonce,
      idTokenClaims: idToken?.claims || null,
      idTokenExpires: idToken?.expiresAt || null,
      accessTokenScopes: accessToken?.scopes || null
    };

    addEntry('info', '1-OKTA-JWT-TOKENS', result);
    if (isEnabled() && idToken?.idToken) {
      addEntry('info', '1-OKTA-FULL-ID-TOKEN', { token: idToken.idToken, parsed: parseJwt(idToken.idToken) });
    }
    if (isEnabled() && pendingCode) {
      addEntry('info', '2-GENESYS-PENDING-AUTHCODE', { authCode: pendingCode, verifier: !!verifier, nonce: nonce });
    }
    return result;
  }

  function resolveExchangePayload() {
    const stored = getOktaTestPayload();
    if (stored?.authCode && stored?.codeVerifier) {
      return { payload: stored, source: 'sessionStorage (career-marketplace-okta-test-payload)' };
    }
    const fromTrace = trace.filter((e) => e.stage === '6-FULL-PAYLOAD-DEBUG').pop()?.detail;
    if (fromTrace?.authCode && fromTrace?.codeVerifier) {
      return { payload: { ...fromTrace, redirectUri: window.CareerMarketplaceAuth?.REDIRECT_URI }, source: 'trace 6-FULL-PAYLOAD-DEBUG' };
    }
    const authCode = sessionStorage.getItem(PENDING_CODE_KEY);
    const codeVerifier = sessionStorage.getItem('genesys-pending-code-verifier');
    if (authCode && codeVerifier) {
      return {
        payload: {
          authCode,
          codeVerifier,
          nonce: sessionStorage.getItem('genesys-pending-nonce'),
          redirectUri: window.CareerMarketplaceAuth?.REDIRECT_URI || 'http://localhost:5173/'
        },
        source: 'sessionStorage pending handoff'
      };
    }
    return null;
  }

  async function tracePostJwt() {
    addEntry('info', 'TRACE-POST-JWT-START', {
      hint: 'Flow: Okta JWT → prefetch authCode → MessagingService.started → Auth.signIn → Genesys exchange → Auth.authenticated'
    });

    await logOktaTokens();

    addEntry('info', '3-PREFETCH-STATE', {
      prefetchFlag: sessionStorage.getItem('genesys-prefetch-code'),
      authCodeDelivered: 'check signIn/getAuthCode entries below',
      genesysChatAuthenticated: window.CareerMarketplaceAuth?.genesysChatAuthenticated
    });

    addEntry('info', '4-GENESYS-CONFIG', {
      deploymentId: window.CareerMarketplaceGenesys?.DEPLOYMENT_ID,
      messengerReady: window.CareerMarketplaceGenesys?.getReadyState?.()?.messengerReady,
      portalAuthed: window.CareerMarketplaceGenesys?.getReadyState?.()?.portalAuthed
    });

    console.group('🧪 POST-JWT TRACE — useful events only');
    filterUsefulLog().forEach((e) => origLog(e.ts.slice(11, 19), e.level, e.stage, e.detail));
    console.groupEnd();

    return trace.slice();
  }

  function getInjectionLog() {
    return filterUsefulLog();
  }

  function exportLog() {
    const blob = new Blob([safeStringify(filterUsefulLog())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'career-marketplace-auth-trace.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function testMessagingAuth() {
    await tracePostJwt();
    addEntry('info', '5-OPENING-MESSENGER', { via: 'Messenger.open' });
    if (window.CareerMarketplaceGenesys?.openMessenger) {
      window.CareerMarketplaceGenesys.openMessenger();
    } else if (window.Genesys) {
      Genesys('command', 'Messenger.open');
    }
    setTimeout(() => tracePostJwt(), 4000);
  }

  async function logOktaTokens() {
    const stored = getOktaTestPayload();
    if (stored?.authCode && stored?.codeVerifier) {
      return { payload: stored, source: 'sessionStorage (career-marketplace-okta-test-payload)' };
    }
    const fromTrace = trace.filter((e) => e.stage === '6-FULL-PAYLOAD-DEBUG').pop()?.detail;
    if (fromTrace?.authCode && fromTrace?.codeVerifier) {
      return { payload: { ...fromTrace, redirectUri: window.CareerMarketplaceAuth?.REDIRECT_URI }, source: 'trace 6-FULL-PAYLOAD-DEBUG' };
    }
    const authCode = sessionStorage.getItem(PENDING_CODE_KEY);
    const codeVerifier = sessionStorage.getItem('genesys-pending-code-verifier');
    if (authCode && codeVerifier) {
      return {
        payload: {
          authCode,
          codeVerifier,
          nonce: sessionStorage.getItem('genesys-pending-nonce'),
          redirectUri: window.CareerMarketplaceAuth?.REDIRECT_URI || 'http://localhost:5173/'
        },
        source: 'sessionStorage pending handoff'
      };
    }
    return null;
  }

  function validateClientSecret(clientSecret) {
    if (!clientSecret || typeof clientSecret !== 'string') {
      return 'Pass your real Okta Web app client secret as a string.';
    }
    if (/paste-your|your-okta|secret-here|example/i.test(clientSecret)) {
      return 'Replace the placeholder with your real secret from Okta → Applications → Acme Web App → Client Credentials.';
    }
    if (clientSecret.length < 16) {
      return 'Secret looks too short — copy the full client secret from Okta Admin.';
    }
    return null;
  }

  function printOktaExchangeCurl(clientSecret) {
    const secretErr = validateClientSecret(clientSecret);
    if (secretErr) {
      console.error('❌ ' + secretErr);
      console.log('Example: CareerMarketplaceDebug.printOktaExchangeCurl("1a2b3c4d5e6f...")');
      return null;
    }

    const resolved = resolveExchangePayload();
    if (!resolved) {
      console.error('❌ No authCode payload found.');
      console.log('Steps: 1) Hard refresh  2) Wait for 2-PREFETCH-COMPLETE  3) Run this BEFORE opening messenger');
      console.log('Or: CareerMarketplaceDebug.refreshOktaTestCode() then run again after page reloads');
      return null;
    }

    const { payload, source } = resolved;
    const redirectUri = payload.redirectUri || window.CareerMarketplaceAuth?.REDIRECT_URI || 'http://localhost:5173/';
    const redirectNoSlash = redirectUri.replace(/\/$/, '');

    if (payload.used) {
      console.warn('⚠️ This authCode was already sent to Genesys (single-use). Okta test will likely return invalid_grant.');
      console.warn('Hard refresh → wait for 2-PREFETCH-COMPLETE → run BEFORE opening messenger.');
    }

    const buildCurl = (uri, label) => [
      '# ' + label,
      "curl -s -w '\\nHTTP %{http_code}\\n' -X POST 'https://integrator-3289699.okta.com/oauth2/default/v1/token' \\",
      "  -H 'Content-Type: application/x-www-form-urlencoded' \\",
      "  -d 'grant_type=authorization_code' \\",
      "  -d 'client_id=0oa14bp5cafStwgaY698' \\",
      "  -d 'client_secret=" + clientSecret + "' \\",
      "  -d 'redirect_uri=" + uri + "' \\",
      "  -d 'code=" + payload.authCode + "' \\",
      "  -d 'code_verifier=" + payload.codeVerifier + "'",
      ''
    ].join('\n');

    console.group('🧪 Okta token exchange test (run in Terminal, not browser — CORS blocks browser)');
    console.log('Payload source:', source);
    console.log('Code used by Genesys:', !!payload.used);
    console.log('Code age (sec):', payload.capturedAt ? Math.round((Date.now() - payload.capturedAt) / 1000) : 'unknown');
    console.log('\n' + buildCurl(redirectUri, 'Try 1: redirect_uri WITH trailing slash (our app uses this)'));
    console.log(buildCurl(redirectNoSlash, 'Try 2: redirect_uri WITHOUT trailing slash (if Try 1 fails)'));
    console.log('200 + access_token → Okta credentials OK; Genesys integration may use wrong secret or wrong client');
    console.log('invalid_client → secret wrong (use same secret in Genesys Admin integration)');
    console.log('invalid_grant → code already used OR code_verifier mismatch OR redirect_uri mismatch');
    console.groupEnd();

    addEntry('info', 'OKTA-EXCHANGE-CURL', {
      source,
      codeUsed: !!payload.used,
      redirectUri,
      codeFingerprint: redact(payload.authCode)
    });
    return buildCurl(redirectUri, 'primary');
  }

  function refreshOktaTestCode() {
    if (!window.CareerMarketplaceAuth?.signInForGenesysPrefetch) {
      console.error('CareerMarketplaceAuth not loaded');
      return;
    }
    console.log('Prefetching fresh Okta authCode — page will reload. After reload, run printOktaExchangeCurl BEFORE opening messenger.');
    window.CareerMarketplaceAuth.signInForGenesysPrefetch();
  }

  async function testOktaExchange(clientSecret) {
    const secretErr = validateClientSecret(clientSecret);
    if (secretErr) {
      console.error('❌ ' + secretErr);
      return null;
    }
    console.warn('Browser fetch to Okta /token usually fails (CORS). Use printOktaExchangeCurl() and run in Terminal instead.');
    const resolved = resolveExchangePayload();
    if (!resolved) {
      console.error('No payload — see printOktaExchangeCurl() instructions');
      return null;
    }
    const { payload } = resolved;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: '0oa14bp5cafStwgaY698',
      client_secret: clientSecret,
      redirect_uri: payload.redirectUri || 'http://localhost:5173/',
      code: payload.authCode,
      code_verifier: payload.codeVerifier
    });
    try {
      const res = await fetch('https://integrator-3289699.okta.com/oauth2/default/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const text = await res.text();
      console.log('HTTP', res.status, text);
      return { status: res.status, body: text };
    } catch (err) {
      console.error('Fetch failed (expected CORS):', err.message);
      console.log('Use: CareerMarketplaceDebug.printOktaExchangeCurl("your-secret") → copy curl → run in Terminal');
      return null;
    }
  }

  function printGenesysAdminChecklist() {
    const cfg = trace.filter((e) => e.stage === '3-genesys-config-received').pop();
    const detail = cfg?.detail || {};
    const checklist = {
      clientSideStatus: 'OK — signIn + getAuthCode both resolve same PKCE payload (look for 6-redeliver-to-genesys-getAuthCode)',
      serverSideStatus: 'FAIL — Genesys cloud cannot exchange authCode with Okta (8-EXCHANGE-FAILED-SERVER)',
      verifyOkta: [
        '1. Hard refresh, wait for 2-PREFETCH-COMPLETE',
        '2. BEFORE opening messenger: CareerMarketplaceDebug.printOktaExchangeCurl("your-real-secret")',
        '3. Copy curl output → run in Terminal (browser fetch blocked by CORS)',
        '4. If Okta returns 200 but Genesys fails → Genesys integration secret ≠ Okta secret'
      ],
      liveConfig: {
        integrationId: detail.integrationId || null,
        authEnabled: detail.authEnabled,
        configVersion: detail.configVersion,
        deploymentId: detail.deploymentId,
        authKeys: detail.authKeys || detail.authConfigFull ? Object.keys(detail.authConfigFull || {}) : []
      },
      insideIntegration: {
        type: 'OpenID Connect Messenger Configuration (e.g. IT_Authentication or webdeploymentsOAuthClient)',
        properties: {
          discoveryUri: 'https://integrator-3289699.okta.com/oauth2/default/.well-known/openid-configuration',
          implicitFlowSupport: 'False'
        },
        credentials: {
          clientId: '0oa14bp5cafStwgaY698 (Okta Acme Web App)',
          clientSecret: 'Active secret from same Okta app'
        },
        status: 'Active',
        note: 'You do NOT type integrationId here — Genesys assigns the integration its own UUID'
      },
      outsideIntegration: {
        step1: 'Admin → Digital → Messenger → Configurations (or Web Deployments)',
        step2: 'Authentication ON → Select Integration dropdown → pick THE SAME integration that has Okta credentials',
        step3: 'Save configuration',
        step4: 'Deployments → ' + (window.CareerMarketplaceGenesys?.DEPLOYMENT_ID || '80372e7d-209b-4b93-ae33-e3078f7f8df2') + ' → assign that config → Save + Publish',
        step5: 'Hard refresh — authEnabled:true in 3-genesys-config-received (integrationId is server-side only, null in browser is normal)'
      },
      commonMistakes: [
        'Credentials on IT_Authentication but dropdown selects JT_Authentication',
        'Credentials on webdeploymentsOAuthClient but dropdown selects different integration',
        'Saved config but did not Publish deployment',
        'Auth toggled on deployment but no integration selected in Configuration'
      ]
    };
    console.group('📋 Genesys Admin checklist (client OK — fix server exchange)');
    console.log(checklist);
    console.groupEnd();
    addEntry('info', 'GENESYS-ADMIN-CHECKLIST', checklist);
    return checklist;
  }

  async function dumpAuthState() {
    await tracePostJwt();
    return trace.slice();
  }

  window.CareerMarketplaceDebug = {
    isEnabled,
    enable() { sessionStorage.setItem(DEBUG_KEY, 'true'); },
    disable() { sessionStorage.removeItem(DEBUG_KEY); },
    logOktaTokens,
    tracePostJwt,
    testMessagingAuth,
    dumpAuthState,
    printGenesysAdminChecklist,
    printOktaExchangeCurl,
    testOktaExchange,
    refreshOktaTestCode,
    getOktaTestPayload,
    getInjectionLog,
    exportLog,
    parseJwt,
    getAuthStatus() {
      const authed = !!(window.CareerMarketplaceAuth?.genesysChatAuthenticated);
      const pendingCode = sessionStorage.getItem(
        window.CareerMarketplaceAuth?.PENDING_AUTH_CODE_KEY || 'ca-genesys-pending-auth-code'
      );
      const hasVerifier = !!sessionStorage.getItem(
        window.CareerMarketplaceAuth?.PENDING_VERIFIER_KEY || 'ca-genesys-pending-code-verifier'
      );
      return {
        genesysChatAuthenticated: authed,
        authenticated: authed,
        status: authed ? 'AUTHENTICATED' : 'NOT_AUTHENTICATED',
        hasPendingAuthCode: !!pendingCode,
        hasCodeVerifier: hasVerifier,
        deploymentId: window.CareerMarketplaceGenesys?.DEPLOYMENT_ID || null,
        redirectUri: window.CareerMarketplaceAuth?.REDIRECT_URI || null
      };
    },
    dumpLastGenesysMessage() {
      return window.__caDumpLastGenesysMessage?.();
    },
    dumpInboundMessages(limit) {
      return window.__caDumpInboundLog?.(limit || 10);
    },
    showPanel() {}
  };
})();
