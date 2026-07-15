# Career Marketplace

A static employer recruitment portal prototype with Okta PKCE authentication and Genesys Authenticated Web Messaging. Inspired by modern employment marketplace employer portals — original branding and design, not a copy of SEEK.

## Quick start

Serve the files from a local web server (required for Okta redirects):

```bash
# Python 3
python3 -m http.server 8080

# or Node (if installed) — no project dependencies required
npx serve -p 8080
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

## Why `file://` does not work

Okta PKCE sign-in relies on redirect URIs. When you open `index.html` directly via `file://`:

- `window.location.origin` is `null` or `file://`, which will not match your Okta app redirect URI.
- Browsers block or restrict storage and redirects differently on local files.
- Genesys Web Messaging also expects a proper HTTPS or HTTP origin.

Always use a local web server with an `http://localhost` origin.

## File structure

```text
index.html                  — Markup, Genesys bootstrap (must load first)
auth.js                     — Okta PKCE, captures auth code before exchange
genesys-auth-provider.js    — AuthProvider plugin (must register before SDK loads)
genesys.js                  — Launcher guard, Messenger commands
styles.css                  — Login and portal styling
mock-data.js                — Requisitions, candidates, pipeline data
app.js                      — Portal UI, navigation, filters, modals
README.md                   — This file
```

## Configuration

### Okta (SPA public application)

Edit `auth.js`:

```javascript
const OKTA_DOMAIN    = 'https://your-org.okta.com';
const OKTA_CLIENT_ID = 'your-client-id';
const OKTA_ISSUER    = OKTA_DOMAIN + '/oauth2/default';
```

The redirect URI is computed automatically:

```javascript
const REDIRECT_URI = window.location.origin + window.location.pathname;
```

### Required Okta redirect URIs

Add these **exact** URIs in your Okta SPA application (Sign-in redirect URIs and Sign-out redirect URIs):

| Environment | Sign-in redirect URI | Sign-out redirect URI |
|-------------|----------------------|------------------------|
| Local dev   | `http://localhost:8080/` or `http://localhost:8080/index.html` | Same as sign-in |
| Production  | `https://your-domain.com/` or full path to `index.html` | Same as sign-in |

The path must match how you serve the app. If you use `http://localhost:8080/`, Okta must list that exact value — not `http://localhost:8080/index.html` unless that is the URL you open.

### Genesys deployment

Edit the bootstrap block in `index.html`:

```javascript
{
  environment: 'prod-apse2',
  deploymentId: 'your-deployment-id'
}
```

Genesys must be configured for **Authenticated Web Messaging** with an OpenID Connect integration that matches your Okta issuer, audience, signing keys, and redirect URI.

## Authentication flow

1. Unauthenticated users see the Career Marketplace login page with a **Continue to secure sign-in** button.
2. User clicks the button to start Okta sign-in (no automatic redirect).
3. While redirecting, the page shows "Redirecting you to secure sign-in…"
4. Okta hosts the real username/password screen (no credentials on this page).
5. On return, `handleLoginRedirect()` completes the Okta session and the employer portal is shown.
6. The Genesys **launcher bubble** appears after portal login — Messenger does **not** open automatically.
7. When the user opens chat, Messenger calls `getAuthCode` and receives the Okta ID token (JWT).

### How the Okta token reaches Genesys

Per the [Genesys Authenticated Messenger SDK docs](https://developer.genesys.cloud/commdigital/digital/webmessaging/messengersdk/authenticatedMessenger), Messenger calls `getAuthCode` when the user opens chat — not on page load. The handler resolves:

```javascript
e.resolve({
  idToken: idToken.idToken,
  nonce: nonce,
  redirectUri: REDIRECT_URI
});
```

Genesys validates the JWT and authenticates the messaging session. The `reAuthenticate` command redirects to Okta when a fresh session is needed.

## Logout

Logout (user menu → **Log out**):

1. Hides the Genesys Messenger launcher.
2. Clears the authenticated UI and returns to the login view.
3. Calls `oktaAuth.signOut({ closeSession: false })`.

## Troubleshooting

### Redirect URI mismatch

**Symptom:** Okta error page: "The redirect URI is missing or do not match."

**Fix:**

- Confirm `REDIRECT_URI` in `auth.js` matches the URL in your browser bar exactly (scheme, host, port, path, trailing slash).
- Update the Okta SPA app Sign-in redirect URI to match.
- Ensure Genesys OIDC integration uses the same redirect URI.

### Missing nonce

**Symptom:** Genesys `Auth.error` related to nonce validation.

**Fix:**

- Nonce is read from the ID token claims or Okta transaction storage (`okta-transaction-storage` / `okta-pkce-storage`).
- Complete the full Okta redirect flow — do not skip `handleLoginRedirect()`.
- Avoid clearing `sessionStorage` mid-login.
- Ensure PKCE remains enabled (`pkce: true` in `auth.js`).

### Expired tokens

**Symptom:** Portal loads but chat fails; `getAuthCode` redirects to Okta again.

**Fix:**

- Sign out and sign in again.
- Okta token manager handles refresh for access tokens; ID tokens may need re-authentication when expired.
- Genesys `forceUpdate` in `getAuthCode` intentionally triggers re-login when requested.

### Genesys authentication errors

**Symptom:** Console shows `Auth.error` or `Auth.authError`.

**Fix:**

- Verify Genesys deployment ID and environment in `index.html`.
- Confirm Authenticated Web Messaging is enabled for the deployment.
- Align Okta issuer, client ID, audience, and JWKS with the Genesys OIDC provider settings.
- Check that the ID token `aud` claim matches Genesys expectations.
- Open browser devtools and review redacted debug logs in `genesys.js` (not full JWTs).

### Redirect loop

**Fix:**

- The app checks `oktaAuth.isLoginRedirect()` and `oktaAuth.isAuthenticated()` before auto-redirecting.
- `sessionStorage` key `okta-redirect-attempted` limits automatic redirects to one per attempt.
- Use **Retry sign-in** or clear session storage if stuck.

## Local data persistence

| Data | Storage |
|------|---------|
| New requisitions | `localStorage` (`career-marketplace-requisitions`) |
| Candidate stage changes | `localStorage` (`career-marketplace-candidate-stages`) |
| Last active section | `localStorage` (`career-marketplace-active-section`) |
| Okta tokens | Okta token manager (not `localStorage` manually) |

The raw JWT is never stored in `localStorage`.

## Security notes

- This is an Okta **public SPA** — no client secret in frontend code.
- PKCE is enabled for authorization code flow.
- The ID token is a JWT passed to Genesys for Authenticated Web Messaging.
- Production deployments should disable or remove verbose token debug logging.
- Redirect URI must exactly match Okta and Genesys OIDC configuration.

## Browser support

Modern evergreen browsers (Chrome, Firefox, Safari, Edge). Responsive layout supports desktop, tablet, and mobile viewports.
