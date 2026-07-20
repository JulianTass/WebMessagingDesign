# SEEK Meeting Scheduler

A local proof-of-concept web application that creates Zoom meetings, generates Outlook-compatible `.ics` calendar invitations, and sends them from a personal Hotmail/Outlook.com account using Microsoft Graph.

## Features

- Connect personal Microsoft account (Hotmail/Outlook.com) via OAuth + MSAL
- Connect Zoom account via OAuth
- Schedule meetings with timezone-aware date/time handling
- Create Zoom meetings through the Zoom API
- Generate standards-compliant `.ics` invitations
- Send invitations via Microsoft Graph with ICS attachment
- Download `.ics` manually
- Retry email sending without creating a duplicate Zoom meeting

## Prerequisites

- Node.js 18 or later
- Personal Hotmail or Outlook.com account
- Zoom account
- Microsoft Entra app registration
- Zoom OAuth app

## Project structure

```text
Video/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── app.js
│   ├── config.js
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   └── utils/
├── tests/
├── .env.example
├── package.json
└── README.md
```

## Microsoft setup

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com/) and register a new application.
2. Supported account types: choose an option that includes **personal Microsoft accounts** (Outlook.com / Hotmail).
3. Add this redirect URI:

   `http://localhost:3000/auth/microsoft/callback`

4. Add delegated Microsoft Graph permissions:

   - `User.Read`
   - `Mail.Send`

5. Create a client secret.
6. Copy the Application (client) ID and secret into `.env`.
7. Start the app and click **Connect Microsoft**, then sign in and grant consent.

Authority used by the app:

`https://login.microsoftonline.com/consumers`

## Zoom setup

1. Sign in to the [Zoom App Marketplace](https://marketplace.zoom.us/).
2. Create a **General App** using OAuth (not JWT).
3. Add this redirect URI:

   `http://localhost:3000/auth/zoom/callback`

4. Add the minimum meeting scopes needed to create meetings for the authenticated user, for example:

   - `meeting:write:meeting`
   - `user:read`

5. Activate the app for local/private use if Zoom requires it.
6. Copy the Client ID and Client Secret into `.env`.
7. In the app, click **Connect Zoom** and approve access.

## Environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Required values:

```env
PORT=3000
BASE_URL=http://localhost:3000
SESSION_SECRET=replace-with-a-long-random-value

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/microsoft/callback

ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_REDIRECT_URI=http://localhost:3000/auth/zoom/callback
```

Never commit `.env`.

## Running the project

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

`http://localhost:3000`

Production start:

```bash
npm start
```

## Testing

Automated tests mock external APIs and do not call live Microsoft Graph or Zoom endpoints.

```bash
npm test
```

## Security notes

- OAuth tokens and client secrets stay on the server in the session.
- The default `express-session` memory store is suitable for **local development only**.
- For production you would need a shared session store, HTTPS, and secure cookies.
- Helmet and a restrictive Content Security Policy are enabled.
- `/api/schedule` is rate limited.
- Zoom host `start_url` is never returned to the browser.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| Microsoft redirect URI mismatch | Redirect URI in Entra must exactly match `MICROSOFT_REDIRECT_URI` |
| Personal account not supported | App registration must allow personal Microsoft accounts |
| Missing Mail.Send consent | Reconnect Microsoft and grant mail permission |
| Zoom redirect URI mismatch | Zoom app redirect URI must exactly match `ZOOM_REDIRECT_URI` |
| Missing Zoom scopes | Ensure meeting creation scopes are granted |
| Zoom Basic duration limits | Very long meetings may fail on free plans |
| Token refresh failure | Disconnect and reconnect the affected account |
| Session lost after restart | Expected with the in-memory session store |
| Timezone differences | Use explicit timezone selection; ICS uses UTC internally |
| Email in junk folder | Check recipient spam/junk and sender reputation |
| Graph attachment errors | Verify ICS is base64-encoded and MIME type is `text/calendar` |

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/auth/microsoft` | Start Microsoft OAuth |
| GET | `/auth/microsoft/callback` | Microsoft OAuth callback |
| GET | `/auth/microsoft/status` | Microsoft connection status |
| POST | `/auth/microsoft/logout` | Disconnect Microsoft |
| GET | `/auth/zoom` | Start Zoom OAuth |
| GET | `/auth/zoom/callback` | Zoom OAuth callback |
| GET | `/auth/zoom/status` | Zoom connection status |
| POST | `/auth/zoom/logout` | Disconnect Zoom |
| POST | `/api/schedule` | Create meeting and send invitation |
| POST | `/api/schedule/retry-email` | Retry email for last created meeting |
| GET | `/api/invitations/:id/download` | Download generated `.ics` |

## What requires your credentials

These cannot be fully tested without your OAuth app credentials and live consent flows:

- Microsoft sign-in and Graph `sendMail`
- Zoom sign-in and meeting creation
- End-to-end scheduling from the browser

Automated tests cover validation, timezone conversion, ICS generation, invitation download, and safe API response shaping.
