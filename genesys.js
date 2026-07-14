'use strict';

/**
 * Genesys Web Messaging — Messenger only (no Launcher commands).
 *
 * This deployment returns "Invalid configuration of Launcher button" when
 * Launcher.show/hide is called — the native launcher is disabled or not
 * configured in Genesys Admin. Use Messenger.open/close only.
 *
 * Deployment ID: 80372e7d-209b-4b93-ae33-e3078f7f8df2
 * Environment:    prod-apse2
 *
 * To enable the native launcher bubble (and remove minimize from messenger):
 * Genesys Admin → Messenger → Deployments → this deployment → Launcher → ON
 */

const DEPLOYMENT_ID = '80372e7d-209b-4b93-ae33-e3078f7f8df2';
const ENVIRONMENT = 'prod-apse2';

const readyState = {
  messengerReady: false,
  messengerQueue: []
};

let portalAuthed = false;

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

(function injectMessengerStyles() {
  const style = document.createElement('style');
  style.id = 'genesys-messenger-styles';
  style.textContent = `
    iframe[src*="genesys"], iframe[src*="purecloud"],
    [id*="genesys" i], [class*="genesys" i],
    [id*="mxg" i], [class*="mxg" i] {
      z-index: 99999 !important;
    }
  `;
  document.head.appendChild(style);
})();

if (window.Genesys) {
  Genesys('subscribe', 'Messenger.ready', () => {
    if (readyState.messengerReady) return;
    readyState.messengerReady = true;
    console.log('🔍 [DEBUG] Messenger.ready');
    flushQueue(readyState.messengerQueue);
  });

  Genesys('subscribe', 'Messenger.opened', () => {
    window.TalentHubTrace?.log('5-Messenger.opened', {
      hint: 'messaging session starting — Auth.signIn will fire after MessagingService.started'
    });
  });

  Genesys('subscribe', 'Messenger.closed', () => {
    window.TalentHubTrace?.log('Messenger.closed', {
      hint: 'Messenger closed — auth trace panel at bottom of page keeps your logs'
    });
    window.TalentHubTrace?.showPanel?.();
  });
}

/** Portal authenticated — do not auto-open Messenger; user opens via Genesys launcher. */
function showLauncherAfterLogin() {
  portalAuthed = true;
  console.log('🔍 [DEBUG] Portal authenticated. Web Messenger ready when user opens it (deployment:', DEPLOYMENT_ID + ')');
}

function hideLauncher() {
  portalAuthed = false;
  if (readyState.messengerReady) runGenesysCommand('Messenger.close');
}

window.TalentHubGenesys = {
  DEPLOYMENT_ID,
  ENVIRONMENT,
  whenMessengerReady,
  showLauncherAfterLogin,
  hideLauncher,
  openMessenger,
  getReadyState: () => ({
    messengerReady: readyState.messengerReady,
    portalAuthed,
    deploymentId: DEPLOYMENT_ID
  })
};
