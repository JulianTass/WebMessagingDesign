'use strict';

/**
 * Genesys Web Messaging — CSS visibility only.
 * Hidden while #login-view is visible; shown automatically on the portal.
 *
 * Deployment ID: 80372e7d-209b-4b93-ae33-e3078f7f8df2
 * Environment:    prod-apse2
 */

const DEPLOYMENT_ID = '80372e7d-209b-4b93-ae33-e3078f7f8df2';
const ENVIRONMENT = 'prod-apse2';

const readyState = {
  messengerReady: false,
  messengerQueue: []
};

/** Top-level containers Genesys injects (see genesys-messenger, genesys-thirdparty). */
const GENESYS_ROOT_IDS = ['genesys-messenger', 'genesys-thirdparty', 'messenger'];
const GENESYS_ROOT_SELECTOR = GENESYS_ROOT_IDS.map((id) => '#' + id).join(', ');
const GENESYS_FALLBACK_SELECTOR = [
  'iframe[src*="genesys"]',
  'iframe[src*="purecloud"]',
  'iframe[src*="mypurecloud"]',
  '[id*="mxg" i]',
  '[class*="mxg" i]'
].join(', ');
const GENESYS_HIDE_SELECTOR = [GENESYS_ROOT_SELECTOR, GENESYS_FALLBACK_SELECTOR].join(', ');

function isLoginViewVisible() {
  const loginView = document.getElementById('login-view');
  return loginView && !loginView.hidden;
}

function runGenesysCommand(command, args) {
  if (!window.Genesys) return;
  try {
    const result = args !== undefined ? Genesys('command', command, args) : Genesys('command', command);
    if (result && typeof result.then === 'function') {
      result.catch((err) => console.warn('🔍 [DEBUG] Genesys command failed:', command, err?.message || err));
    }
    return result;
  } catch (err) {
    console.warn('🔍 [DEBUG] Genesys command threw:', command, err?.message || err);
  }
}

function whenMessengerReady(fn) {
  if (readyState.messengerReady) fn();
  else readyState.messengerQueue.push(fn);
}

function flushQueue(queue) {
  while (queue.length) {
    try { queue.shift()(); } catch (e) { console.error('Genesys queue error:', e); }
  }
}

function openMessenger() {
  whenMessengerReady(() => runGenesysCommand('Messenger.open'));
}

function getGenesysDomSnapshot() {
  const roots = GENESYS_ROOT_IDS.map((id) => {
    const el = document.getElementById(id);
    return {
      id,
      present: !!el,
      hidden: el ? getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).opacity === '0' : null,
      display: el ? getComputedStyle(el).display : null
    };
  });
  const iframes = [...document.querySelectorAll('iframe')].filter((f) =>
    /genesys|purecloud|mypurecloud/i.test(f.src || '')
  ).length;
  return {
    loginViewVisible: isLoginViewVisible(),
    portalVisible: document.getElementById('portal') && !document.getElementById('portal').hidden,
    messengerReady: readyState.messengerReady,
    genesysRoots: roots,
    genesysIframes: iframes,
    deploymentId: DEPLOYMENT_ID
  };
}

function debugMessengerState() {
  const snap = getGenesysDomSnapshot();
  console.group('🔍 Genesys messenger debug');
  console.table(snap.genesysRoots);
  console.log('State:', {
    loginViewVisible: snap.loginViewVisible,
    portalVisible: snap.portalVisible,
    messengerReady: snap.messengerReady,
    genesysIframes: snap.genesysIframes,
    deploymentId: snap.deploymentId
  });
  if (snap.portalVisible && snap.genesysIframes === 0) {
    console.warn('Portal is visible but no Genesys iframes found — bootstrap may still be loading or launcher is disabled in Genesys Admin.');
  }
  if (snap.portalVisible && snap.genesysIframes > 0 && snap.genesysRoots.every((r) => !r.present)) {
    console.warn('Genesys iframes exist but root containers missing — check CSS selectors.');
  }
  console.groupEnd();
  return snap;
}

(function injectMessengerStyles() {
  const style = document.createElement('style');
  style.id = 'genesys-messenger-styles';
  /* visibility/opacity (not display:none) so Genesys can still initialize while hidden on login */
  style.textContent = `
    body:has(#login-view:not([hidden])) ${GENESYS_HIDE_SELECTOR} {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    body:has(#portal:not([hidden])) ${GENESYS_HIDE_SELECTOR} {
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      z-index: 99999 !important;
    }
  `;
  document.head.appendChild(style);
})();

if (window.Genesys) {
  Genesys('subscribe', 'Messenger.ready', () => {
    if (readyState.messengerReady) return;
    readyState.messengerReady = true;
    console.log('🔍 [DEBUG] Messenger.ready', getGenesysDomSnapshot());
    flushQueue(readyState.messengerQueue);
    if (!isLoginViewVisible()) debugMessengerState();
  });

  Genesys('subscribe', 'Messenger.opened', () => {
    window.CareerMarketplaceTrace?.log('5-Messenger.opened', {
      hint: 'messaging session starting — Auth.signIn will fire after MessagingService.started'
    });
  });

  Genesys('subscribe', 'Messenger.closed', () => {
    window.CareerMarketplaceTrace?.log('Messenger.closed', {
      hint: 'Messenger closed — auth trace logs remain in console'
    });
    window.CareerMarketplaceTrace?.showPanel?.();
  });
}

/* Log when Genesys injects its root containers (often after Messenger.ready). */
if (typeof MutationObserver !== 'undefined' && document.body) {
  const observer = new MutationObserver(() => {
    const hasGenesysRoot = GENESYS_ROOT_IDS.some((id) => document.getElementById(id));
    if (hasGenesysRoot && !isLoginViewVisible()) {
      debugMessengerState();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/** Kept for auth.js compatibility — visibility is CSS-driven by login vs portal view. */
function showLauncherAfterLogin() {
  debugMessengerState();
}

function hideLauncher() {
  debugMessengerState();
}

window.CareerMarketplaceGenesys = {
  DEPLOYMENT_ID,
  ENVIRONMENT,
  whenMessengerReady,
  showLauncherAfterLogin,
  hideLauncher,
  openMessenger,
  debugMessengerState,
  getReadyState: () => ({
    messengerReady: readyState.messengerReady,
    portalAuthed: !isLoginViewVisible(),
    deploymentId: DEPLOYMENT_ID,
    ...getGenesysDomSnapshot()
  })
};
