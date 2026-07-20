const { getConfig } = require('../config');
const { redactObject } = require('../utils/redact');
const { getValidMicrosoftAccessToken } = require('./tokenService');

function buildEmailBodies({ customerName, title, formattedDate, formattedTime, timezone, durationMinutes, joinUrl }) {
  const subject = `Meeting invitation: ${title}`;

  const text = [
    `Hello ${customerName},`,
    '',
    'Your video consultation has been scheduled.',
    '',
    `Meeting: ${title}`,
    `Date: ${formattedDate}`,
    `Time: ${formattedTime} (${timezone})`,
    `Duration: ${durationMinutes} minutes`,
    '',
    `Join Zoom Meeting: ${joinUrl}`,
    '',
    'A calendar invitation is attached to this email.',
    '',
    'Regards,',
    'SEEK Support'
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family:Segoe UI,Arial,sans-serif;color:#1a1a2e;line-height:1.6;max-width:560px;">
  <p>Hello ${escapeHtml(customerName)},</p>
  <p>Your video consultation has been scheduled.</p>
  <table style="border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Meeting</td><td>${escapeHtml(title)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Date</td><td>${escapeHtml(formattedDate)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Time</td><td>${escapeHtml(formattedTime)} (${escapeHtml(timezone)})</td></tr>
    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Duration</td><td>${durationMinutes} minutes</td></tr>
  </table>
  <p>
    <a href="${escapeHtml(joinUrl)}" style="display:inline-block;background:#6b21a8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">
      Join Zoom Meeting
    </a>
  </p>
  <p style="color:#555;font-size:14px;">A calendar invitation is attached to this email.</p>
  <p>Regards,<br>SEEK Support</p>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function findSentInvitationMessage(accessToken, { subject, customerEmail }) {
  const params = new URLSearchParams({
    $top: '15',
    $orderby: 'sentDateTime desc',
    $select: 'id,subject,sentDateTime,toRecipients'
  });

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/sentItems/messages?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data.error?.message || '';
      console.error('Microsoft Graph list sent items failed:', redactObject(data));
    } catch {
      detail = await response.text();
    }
    const err = new Error(detail || 'Failed to locate the sent invitation email.');
    err.code = 'GRAPH_LIST_FAILED';
    err.status = 502;
    throw err;
  }

  const data = await response.json();
  const normalizedEmail = customerEmail.toLowerCase();
  const match = (data.value || []).find((message) => {
    if (message.subject !== subject) return false;
    return (message.toRecipients || []).some((recipient) =>
      (recipient.emailAddress?.address || '').toLowerCase() === normalizedEmail
    );
  });

  return match?.id || null;
}

async function findSentInvitationMessageWithRetry(accessToken, criteria, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const messageId = await findSentInvitationMessage(accessToken, criteria);
    if (messageId) return messageId;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  return null;
}

async function deleteSentMessage(accessToken, messageId) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 404) {
    const err = new Error('The sent invitation email was not found.');
    err.code = 'MAIL_MESSAGE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (!response.ok && response.status !== 204) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data.error?.message || '';
      console.error('Microsoft Graph delete message failed:', redactObject(data));
    } catch {
      detail = await response.text();
    }
    const err = new Error(detail || 'Failed to delete the sent invitation email.');
    err.code = 'MAIL_DELETE_FAILED';
    err.status = 502;
    throw err;
  }
}

async function sendMeetingInvitation(msalClient, session, {
  customerName,
  customerEmail,
  title,
  formattedDate,
  formattedTime,
  timezone,
  durationMinutes,
  joinUrl,
  icsContent
}) {
  const accessToken = await getValidMicrosoftAccessToken(msalClient, session);
  const { subject, text, html } = buildEmailBodies({
    customerName,
    title,
    formattedDate,
    formattedTime,
    timezone,
    durationMinutes,
    joinUrl
  });

  const icsBase64 = Buffer.from(icsContent, 'utf8').toString('base64');

  const message = {
    message: {
      subject,
      body: {
        contentType: 'HTML',
        content: html
      },
      toRecipients: [
        {
          emailAddress: {
            address: customerEmail,
            name: customerName
          }
        }
      ],
      attachments: [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: 'seek-meeting.ics',
          contentType: 'text/calendar',
          contentBytes: icsBase64
        }
      ]
    },
    saveToSentItems: true
  };

  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data.error?.message || '';
      console.error('Microsoft Graph sendMail failed:', redactObject(data));
    } catch {
      detail = await response.text();
    }
    const err = new Error(detail || 'Failed to send email via Microsoft Graph.');
    err.code = 'GRAPH_SEND_FAILED';
    err.status = 502;
    throw err;
  }

  const sentMessageId = await findSentInvitationMessageWithRetry(accessToken, {
    subject,
    customerEmail
  });

  return { subject, text, html, sentMessageId };
}

module.exports = {
  sendMeetingInvitation,
  findSentInvitationMessageWithRetry,
  deleteSentMessage,
  buildEmailBodies,
  escapeHtml
};
