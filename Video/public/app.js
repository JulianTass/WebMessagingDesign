(function () {
  const microsoftStatus = document.getElementById('microsoft-status');
  const zoomStatus = document.getElementById('zoom-status');
  const microsoftConnect = document.getElementById('microsoft-connect');
  const microsoftDisconnect = document.getElementById('microsoft-disconnect');
  const zoomConnect = document.getElementById('zoom-connect');
  const zoomDisconnect = document.getElementById('zoom-disconnect');
  const scheduleFieldset = document.getElementById('schedule-fieldset');
  const scheduleForm = document.getElementById('schedule-form');
  const submitBtn = document.getElementById('submit-btn');
  const genesysCallbackBtn = document.getElementById('genesys-callback-btn');
  const retryEmailBtn = document.getElementById('retry-email-btn');
  const deleteEmailBtn = document.getElementById('delete-email-btn');
  const resultAlert = document.getElementById('result-alert');
  const resultPanel = document.getElementById('result-panel');
  const resultDetails = document.getElementById('result-details');
  const downloadWrap = document.getElementById('download-wrap');
  const deleteEmailWrap = document.getElementById('delete-email-wrap');
  const downloadLink = document.getElementById('download-link');

  let microsoftConnected = false;
  let zoomConnected = false;
  let submitting = false;
  let genesysSubmitting = false;
  let canDeleteEmail = false;
  let lastMeetingDetails = null;

  function setHidden(el, hidden) {
    el.classList.toggle('hidden', hidden);
  }

  function setLoading(loading) {
    submitting = loading;
    submitBtn.disabled = loading || genesysSubmitting || !(microsoftConnected && zoomConnected);
    genesysCallbackBtn.disabled = loading || genesysSubmitting;
    retryEmailBtn.disabled = loading || genesysSubmitting;
    deleteEmailBtn.disabled = loading || genesysSubmitting;
    submitBtn.querySelector('.btn-label').textContent = loading
      ? 'Scheduling…'
      : 'Create meeting & send invitation';
    setHidden(submitBtn.querySelector('.spinner'), !loading);
  }

  function setGenesysLoading(loading) {
    genesysSubmitting = loading;
    genesysCallbackBtn.disabled = loading || submitting;
    submitBtn.disabled = loading || submitting || !(microsoftConnected && zoomConnected);
    genesysCallbackBtn.textContent = loading ? 'Creating callback…' : 'Genesys call back';
  }

  function showAlert(type, message) {
    resultAlert.className = 'alert ' + type;
    resultAlert.textContent = message;
    setHidden(resultAlert, false);
  }

  function clearAlert() {
    setHidden(resultAlert, true);
    resultAlert.textContent = '';
  }

  function escapeText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderResult(meeting, downloadUrl, partial, options) {
    options = options || {};
    canDeleteEmail = Boolean(options.emailSent);
    resultDetails.textContent = '';
    const rows = [
      ['Title', meeting.title],
      ['Start', meeting.startTime],
      ['Duration', meeting.durationMinutes + ' minutes'],
      ['Timezone', meeting.timezone],
      ['Meeting ID', meeting.meetingId],
      ['Join URL', meeting.joinUrl]
    ];

    rows.forEach(function (row) {
      const dt = document.createElement('dt');
      dt.textContent = row[0];
      const dd = document.createElement('dd');
      if (row[0] === 'Join URL') {
        const link = document.createElement('a');
        link.href = row[1];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = row[1];
        dd.appendChild(link);
      } else {
        dd.textContent = row[1];
      }
      resultDetails.appendChild(dt);
      resultDetails.appendChild(dd);
    });

    setHidden(resultPanel, false);
    if (downloadUrl) {
      downloadLink.href = downloadUrl;
      setHidden(downloadWrap, false);
    } else {
      setHidden(downloadWrap, true);
    }

    if (partial) {
      setHidden(retryEmailBtn, false);
      setHidden(deleteEmailWrap, true);
      showAlert('warning', 'The Zoom meeting was created, but the email could not be sent. Download the .ics file or retry email only.');
    } else {
      setHidden(retryEmailBtn, true);
      setHidden(deleteEmailWrap, !canDeleteEmail);
      showAlert('success', 'The meeting was created and the invitation was sent.');
    }
  }

  async function deleteSentEmail() {
    if (submitting || !canDeleteEmail) return;
    clearAlert();
    setLoading(true);

    try {
      const response = await fetch('/api/schedule/delete-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();

      if (!response.ok) {
        showAlert('error', data.message || 'Could not delete the sent email.');
        return;
      }

      canDeleteEmail = false;
      setHidden(deleteEmailWrap, true);
      setHidden(downloadWrap, true);
      showAlert('success', data.message || 'The sent invitation email was deleted.');
    } catch (error) {
      showAlert('error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function updateConnectionUi() {
    if (microsoftConnected) {
      microsoftStatus.textContent = microsoftStatus.dataset.email
        ? 'Connected as ' + microsoftStatus.dataset.email
        : 'Connected';
      setHidden(microsoftConnect, true);
      setHidden(microsoftDisconnect, false);
    } else {
      microsoftStatus.textContent = 'Not connected';
      setHidden(microsoftConnect, false);
      setHidden(microsoftDisconnect, true);
    }

    if (zoomConnected) {
      zoomStatus.textContent = zoomStatus.dataset.mock
        ? 'Demo meeting ready (hardcoded link)'
        : 'Connected';
      setHidden(zoomConnect, true);
      setHidden(zoomDisconnect, !zoomStatus.dataset.mock);
    } else {
      zoomStatus.textContent = 'Not connected';
      setHidden(zoomConnect, false);
      setHidden(zoomDisconnect, true);
    }

    submitBtn.disabled = submitting || genesysSubmitting || !(microsoftConnected && zoomConnected);
    genesysCallbackBtn.disabled = submitting || genesysSubmitting;
  }

  async function fetchStatus() {
    const [ms, zm] = await Promise.all([
      fetch('/auth/microsoft/status').then(function (r) { return r.json(); }),
      fetch('/auth/zoom/status').then(function (r) { return r.json(); })
    ]);

    microsoftConnected = Boolean(ms.connected);
    zoomConnected = Boolean(zm.connected);
    if (ms.email) microsoftStatus.dataset.email = ms.email;
    if (zm.mock) {
      zoomStatus.dataset.mock = 'true';
    } else {
      delete zoomStatus.dataset.mock;
    }
    updateConnectionUi();
  }

  async function disconnect(url) {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    await fetchStatus();
    clearAlert();
    setHidden(resultPanel, true);
    setHidden(retryEmailBtn, true);
    setHidden(deleteEmailWrap, true);
    canDeleteEmail = false;
  }

  function getFormPayload() {
    return {
      customerName: document.getElementById('customerName').value.trim(),
      customerEmail: document.getElementById('customerEmail').value.trim(),
      customerPhone: document.getElementById('customerPhone').value.trim(),
      title: document.getElementById('title').value.trim(),
      description: document.getElementById('description').value.trim(),
      date: document.getElementById('date').value,
      time: document.getElementById('time').value,
      durationMinutes: parseInt(document.getElementById('durationMinutes').value, 10),
      timezone: document.getElementById('timezone').value
    };
  }

  function validateFormForCallback() {
    if (!scheduleForm.reportValidity()) {
      return false;
    }
    return true;
  }

  async function submitGenesysCallback() {
    if (genesysSubmitting || submitting) return;
    if (!window.SeekGenesys.hasSettings()) {
      showAlert('error', window.SeekGenesys.settingsErrorMessage());
      return;
    }
    if (!validateFormForCallback()) return;

    clearAlert();
    setGenesysLoading(true);

    try {
      var payload = getFormPayload();
      var response = await window.SeekGenesys.createCallback(payload, lastMeetingDetails);
      setHidden(resultPanel, true);
      showAlert('success', 'Genesys callback created for ' + payload.customerName + '.');
      console.log('Genesys callback created:', response.result);
    } catch (error) {
      showAlert('error', error.message || 'Could not create Genesys callback.');
      console.error('Genesys callback failed:', error);
    } finally {
      setGenesysLoading(false);
      updateConnectionUi();
    }
  }

  async function submitSchedule(url) {
    if (submitting) return;
    clearAlert();
    setLoading(true);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getFormPayload())
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.partial && data.meeting) {
          renderResult(data.meeting, data.icsDownloadUrl, true);
          lastMeetingDetails = data.meeting;
          return;
        }
        showAlert('error', data.message || 'Scheduling failed.');
        return;
      }

      renderResult(data.meeting, data.icsDownloadUrl, false, {
        emailSent: data.emailSent
      });
      lastMeetingDetails = data.meeting;
    } catch (error) {
      showAlert('error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  scheduleForm.addEventListener('submit', function (event) {
    event.preventDefault();
    submitSchedule('/api/schedule');
  });

  genesysCallbackBtn.addEventListener('click', function () {
    submitGenesysCallback();
  });

  retryEmailBtn.addEventListener('click', function () {
    submitSchedule('/api/schedule/retry-email');
  });

  deleteEmailBtn.addEventListener('click', function () {
    deleteSentEmail();
  });

  microsoftDisconnect.addEventListener('click', function () {
    disconnect('/auth/microsoft/logout');
  });

  zoomDisconnect.addEventListener('click', function () {
    disconnect('/auth/zoom/logout');
  });

  window.SeekGenesys.init().catch(function (error) {
    console.error('Genesys init failed:', error);
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('connected') === 'microsoft') {
    showAlert('success', 'Microsoft account connected.');
    window.history.replaceState({}, '', '/');
  }
  if (params.get('connected') === 'zoom') {
    showAlert('success', 'Zoom account connected.');
    window.history.replaceState({}, '', '/');
  }

  fetchStatus();
})();
