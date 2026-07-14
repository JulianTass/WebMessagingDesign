'use strict';

/**
 * Persistent auth trace — survives console clears and page redirects.
 * On-page panel on localhost. Full JWT/authCode logging in debug mode.
 */

(function () {
  const DEBUG_KEY = 'talenthub-debug';
  const TRACE_KEY = 'talenthub-auth-trace';
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
    updatePanel();
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

  /* ---- on-page debug panel ---- */
  let panelEl = null;

  function ensurePanel() {
    if (panelEl || !isEnabled()) return;
    panelEl = document.createElement('div');
    panelEl.id = 'talenthub-trace-panel';
    panelEl.innerHTML = `
      <style>
        #talenthub-trace-panel {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 2147483646;
          font: 11px/1.4 ui-monospace, monospace;
          background: #1a1a2e; color: #e0e0e0;
          border-top: 2px solid #e94560; max-height: 220px;
          display: flex; flex-direction: column;
        }
        #talenthub-trace-panel.collapsed { max-height: 28px; overflow: hidden; }
        #talenthub-trace-panel .trace-header {
          display: flex; align-items: center; gap: 8px; padding: 4px 10px;
          background: #16213e; cursor: pointer; user-select: none; flex-shrink: 0;
        }
        #talenthub-trace-panel .trace-header strong { color: #e94560; }
        #talenthub-trace-panel .trace-body {
          overflow-y: auto; padding: 6px 10px; flex: 1;
        }
        #talenthub-trace-panel .trace-banner {
          background: #5c1a1a; color: #ffb4b4; padding: 6px 10px; font-size: 11px;
          border-bottom: 1px solid #e94560;
        }
        #talenthub-trace-panel .trace-line.error { color: #ff6b6b; }
        #talenthub-trace-panel .trace-line.warn { color: #ffd93d; }
        #talenthub-trace-panel .trace-line.success { color: #6bcb77; }
        #talenthub-trace-panel button {
          font: 10px sans-serif; padding: 2px 8px; cursor: pointer;
          background: #0f3460; color: #fff; border: 1px solid #533483; border-radius: 3px;
        }
      </style>
      <div class="trace-header">
        <strong>Auth Trace</strong>
        <span id="trace-count">0 events</span>
        <button type="button" id="trace-copy-btn">Copy log</button>
        <button type="button" id="trace-clear-btn">Clear</button>
        <button type="button" id="trace-persist-btn" title="Keep log across refreshes">Persist</button>
        <span style="margin-left:auto;font-size:10px;color:#888">click header to collapse</span>
      </div>
      <div id="trace-banner" class="trace-banner" hidden></div>
      <div class="trace-body" id="trace-body"></div>
    `;
    document.body.appendChild(panelEl);

    panelEl.querySelector('.trace-header').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      panelEl.classList.toggle('collapsed');
    });
    panelEl.querySelector('#trace-copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(safeStringify(filterUsefulLog()));
      addEntry('info', 'trace-copied', { count: trace.length });
    });
    panelEl.querySelector('#trace-clear-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      trace.length = 0;
      try { sessionStorage.removeItem('talenthub-last-auth-error'); } catch (err) { /* ignore */ }
      persist();
    });
    panelEl.querySelector('#trace-persist-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      try { sessionStorage.setItem(DEBUG_KEY, 'true'); } catch (err) { /* ignore */ }
      addEntry('info', 'trace-persist-on', { hint: 'Log survives page refresh — use Copy log before closing tab' });
    });
    showLastAuthErrorBanner();
  }

  function showLastAuthErrorBanner() {
    if (!panelEl) return;
    const banner = panelEl.querySelector('#trace-banner');
    if (!banner) return;
    try {
      const raw = sessionStorage.getItem('talenthub-last-auth-error');
      if (!raw) { banner.hidden = true; return; }
      const err = JSON.parse(raw);
      banner.hidden = false;
      banner.textContent = 'Last auth failed: ' + (err.message || err.stage) +
        ' — logs preserved below. Run TalentHubDebug.printGenesysAdminChecklist()';
    } catch (e) {
      banner.hidden = true;
    }
  }

  function updatePanel() {
    if (!panelEl) return;
    showLastAuthErrorBanner();
    const body = panelEl.querySelector('#trace-body');
    const count = panelEl.querySelector('#trace-count');
    if (count) count.textContent = trace.length + ' events';
    if (!body) return;
    body.innerHTML = trace.slice(-40).map((e) => {
      const cls = e.level === 'error' ? 'error' : e.level === 'warn' ? 'warn' : e.level === 'success' ? 'success' : '';
      const detail = e.detail?.message || e.detail?.code || safeStringify(e.detail).slice(0, 120);
      return `<div class="trace-line ${cls}">${e.ts.slice(11, 19)} ${e.stage} ${detail}</div>`;
    }).join('');
    body.scrollTop = body.scrollHeight;
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
  window.TalentHubTrace = {
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
    showPanel() { ensurePanel(); updatePanel(); },
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

  /* ---- TalentHubDebug helpers ---- */
  const PENDING_CODE_KEY = 'genesys-pending-auth-code';
  const OKTA_TEST_PAYLOAD_KEY = 'talenthub-okta-test-payload';

  function getOktaTestPayload() {
    if (window.TalentHubGenesysAuth?.getOktaTestPayload) {
      return window.TalentHubGenesysAuth.getOktaTestPayload();
    }
    try {
      const raw = sessionStorage.getItem(OKTA_TEST_PAYLOAD_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async function logOktaTokens() {
    if (!window.TalentHubAuth) return null;
    const { oktaAuth, REDIRECT_URI } = window.TalentHubAuth;
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
      return { payload: stored, source: 'sessionStorage (talenthub-okta-test-payload)' };
    }
    const fromTrace = trace.filter((e) => e.stage === '6-FULL-PAYLOAD-DEBUG').pop()?.detail;
    if (fromTrace?.authCode && fromTrace?.codeVerifier) {
      return { payload: { ...fromTrace, redirectUri: window.TalentHubAuth?.REDIRECT_URI }, source: 'trace 6-FULL-PAYLOAD-DEBUG' };
    }
    const authCode = sessionStorage.getItem(PENDING_CODE_KEY);
    const codeVerifier = sessionStorage.getItem('genesys-pending-code-verifier');
    if (authCode && codeVerifier) {
      return {
        payload: {
          authCode,
          codeVerifier,
          nonce: sessionStorage.getItem('genesys-pending-nonce'),
          redirectUri: window.TalentHubAuth?.REDIRECT_URI || 'http://localhost:5173/'
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
      genesysChatAuthenticated: window.TalentHubAuth?.genesysChatAuthenticated
    });

    addEntry('info', '4-GENESYS-CONFIG', {
      deploymentId: window.TalentHubGenesys?.DEPLOYMENT_ID,
      messengerReady: window.TalentHubGenesys?.getReadyState?.()?.messengerReady,
      portalAuthed: window.TalentHubGenesys?.getReadyState?.()?.portalAuthed
    });

    console.group('🧪 POST-JWT TRACE — useful events only');
    filterUsefulLog().forEach((e) => origLog(e.ts.slice(11, 19), e.level, e.stage, e.detail));
    console.groupEnd();

    ensurePanel();
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
    a.download = 'talenthub-auth-trace.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function testMessagingAuth() {
    await tracePostJwt();
    addEntry('info', '5-OPENING-MESSENGER', { via: 'Messenger.open' });
    if (window.TalentHubGenesys?.openMessenger) {
      window.TalentHubGenesys.openMessenger();
    } else if (window.Genesys) {
      Genesys('command', 'Messenger.open');
    }
    setTimeout(() => tracePostJwt(), 4000);
  }

  async function logOktaTokens() {
    const stored = getOktaTestPayload();
    if (stored?.authCode && stored?.codeVerifier) {
      return { payload: stored, source: 'sessionStorage (talenthub-okta-test-payload)' };
    }
    const fromTrace = trace.filter((e) => e.stage === '6-FULL-PAYLOAD-DEBUG').pop()?.detail;
    if (fromTrace?.authCode && fromTrace?.codeVerifier) {
      return { payload: { ...fromTrace, redirectUri: window.TalentHubAuth?.REDIRECT_URI }, source: 'trace 6-FULL-PAYLOAD-DEBUG' };
    }
    const authCode = sessionStorage.getItem(PENDING_CODE_KEY);
    const codeVerifier = sessionStorage.getItem('genesys-pending-code-verifier');
    if (authCode && codeVerifier) {
      return {
        payload: {
          authCode,
          codeVerifier,
          nonce: sessionStorage.getItem('genesys-pending-nonce'),
          redirectUri: window.TalentHubAuth?.REDIRECT_URI || 'http://localhost:5173/'
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
      console.log('Example: TalentHubDebug.printOktaExchangeCurl("1a2b3c4d5e6f...")');
      return null;
    }

    const resolved = resolveExchangePayload();
    if (!resolved) {
      console.error('❌ No authCode payload found.');
      console.log('Steps: 1) Hard refresh  2) Wait for 2-PREFETCH-COMPLETE  3) Run this BEFORE opening messenger');
      console.log('Or: TalentHubDebug.refreshOktaTestCode() then run again after page reloads');
      return null;
    }

    const { payload, source } = resolved;
    const redirectUri = payload.redirectUri || window.TalentHubAuth?.REDIRECT_URI || 'http://localhost:5173/';
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
    if (!window.TalentHubAuth?.signInForGenesysPrefetch) {
      console.error('TalentHubAuth not loaded');
      return;
    }
    console.log('Prefetching fresh Okta authCode — page will reload. After reload, run printOktaExchangeCurl BEFORE opening messenger.');
    window.TalentHubAuth.signInForGenesysPrefetch();
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
      console.log('Use: TalentHubDebug.printOktaExchangeCurl("your-secret") → copy curl → run in Terminal');
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
        '2. BEFORE opening messenger: TalentHubDebug.printOktaExchangeCurl("your-real-secret")',
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
        step4: 'Deployments → ' + (window.TalentHubGenesys?.DEPLOYMENT_ID || '80372e7d-209b-4b93-ae33-e3078f7f8df2') + ' → assign that config → Save + Publish',
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

  window.TalentHubDebug = {
    isEnabled,
    enable() { sessionStorage.setItem(DEBUG_KEY, 'true'); ensurePanel(); },
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
    showPanel() { ensurePanel(); }
  };

  if (isEnabled()) {
    const bootPanel = () => { ensurePanel(); updatePanel(); };
    if (document.body) bootPanel();
    else document.addEventListener('DOMContentLoaded', bootPanel);
    const restoredCount = trace.length;
    addEntry('info', 'trace-init', {
      message: 'Auth trace ON — logs persist in panel at bottom (survives messenger close)',
      restoredFromSession: restoredCount
    });
    if (restoredCount > 0) {
      addEntry('info', 'trace-restored', {
        count: restoredCount,
        hint: 'Previous session logs loaded — scroll panel or click Copy log'
      });
    }
  }
})();
