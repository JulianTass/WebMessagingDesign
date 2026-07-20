const express = require('express');
const msal = require('@azure/msal-node');
const { getConfig } = require('../config');
const { createOAuthState, createPkcePair } = require('../utils/crypto');

function createMsalClient(config) {
  return new msal.ConfidentialClientApplication({
    auth: {
      clientId: config.microsoft.clientId,
      authority: config.microsoft.authority,
      clientSecret: config.microsoft.clientSecret
    }
  });
}

function createMicrosoftAuthRouter(options = {}) {
  const router = express.Router();
  const config = options.config || getConfig();

  router.get('/microsoft', (req, res, next) => {
    try {
      const msalClient = createMsalClient(config);
      const state = createOAuthState();
      const { verifier, challenge } = createPkcePair();
      req.session.microsoftOAuth = { state, pkceVerifier: verifier };

      const authUrl = msalClient.getAuthCodeUrl({
        scopes: config.microsoft.scopes,
        redirectUri: config.microsoft.redirectUri,
        state,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        prompt: 'select_account'
      });

      Promise.resolve(authUrl)
        .then((url) => res.redirect(url))
        .catch(next);
    } catch (error) {
      next(error);
    }
  });

  router.get('/microsoft/callback', async (req, res, next) => {
    try {
      const { code, state, error, error_description: errorDescription } = req.query;
      const oauth = req.session.microsoftOAuth;

      if (error) {
        const err = new Error(errorDescription || 'Microsoft consent was denied.');
        err.code = 'MICROSOFT_CONSENT_DENIED';
        err.status = 400;
        throw err;
      }

      if (!oauth || state !== oauth.state) {
        const err = new Error('Invalid OAuth state.');
        err.code = 'MICROSOFT_CONSENT_DENIED';
        err.status = 400;
        throw err;
      }

      const msalClient = createMsalClient(config);
      const tokenResponse = await msalClient.acquireTokenByCode({
        code,
        scopes: config.microsoft.scopes,
        redirectUri: config.microsoft.redirectUri,
        codeVerifier: oauth.pkceVerifier
      });

      req.session.microsoft = {
        accessToken: tokenResponse.accessToken,
        expiresAt: tokenResponse.expiresOn ? tokenResponse.expiresOn.getTime() : Date.now() + 3600000,
        account: tokenResponse.account,
        tokenCache: msalClient.getTokenCache().serialize(),
        email: tokenResponse.account?.username || null
      };
      delete req.session.microsoftOAuth;

      res.redirect('/?connected=microsoft');
    } catch (error) {
      next(error);
    }
  });

  router.get('/microsoft/status', (req, res) => {
    const connected = Boolean(req.session.microsoft?.accessToken);
    res.json({
      connected,
      email: connected ? req.session.microsoft.email || null : null
    });
  });

  router.post('/microsoft/logout', (req, res) => {
    delete req.session.microsoft;
    delete req.session.microsoftOAuth;
    res.json({ success: true });
  });

  return router;
}

module.exports = { createMicrosoftAuthRouter, createMsalClient };
