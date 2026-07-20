(function () {
  'use strict';

  var platformClient = null;
  var client = null;
  var usersApi = null;
  var conversationsApi = null;
  var genesysConfig = null;
  var connected = false;
  var connectedUser = null;
  var statusCallback = null;

  function getUrlParams() {
    return new URL(document.location.href).searchParams;
  }

  function loadGenesysSettings() {
    var params = getUrlParams();
    var gc_region = params.get('gc_region');
    var gc_clientId = params.get('gc_clientId');
    var gc_redirectUrl = params.get('gc_redirectUrl');

    console.log(document.location.href);
    console.log(gc_region);
    console.log(gc_clientId);
    console.log(gc_redirectUrl);

    if (gc_region) localStorage.setItem('gc_region', gc_region);
    else gc_region = localStorage.getItem('gc_region');

    if (gc_clientId) localStorage.setItem('gc_clientId', gc_clientId);
    else gc_clientId = localStorage.getItem('gc_clientId');

    if (gc_redirectUrl) localStorage.setItem('gc_redirectUrl', gc_redirectUrl);
    else gc_redirectUrl = localStorage.getItem('gc_redirectUrl');

    return {
      region: gc_region,
      clientId: gc_clientId,
      redirectUrl: gc_redirectUrl,
      ready: Boolean(gc_region && gc_clientId && gc_redirectUrl)
    };
  }

  function settingsErrorMessage() {
    return 'Genesys settings are missing. Open this page with gc_region, gc_clientId, and gc_redirectUrl in the URL.';
  }

  function requireSettings() {
    var settings = loadGenesysSettings();
    if (!settings.ready) {
      throw new Error(settingsErrorMessage());
    }
    return settings;
  }

  function notifyStatus() {
    if (typeof statusCallback === 'function') {
      statusCallback({
        connected: connected,
        user: connectedUser,
        settings: loadGenesysSettings()
      });
    }
  }

  function cleanOAuthParams() {
    var url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    var search = url.searchParams.toString();
    window.history.replaceState({}, '', url.pathname + (search ? '?' + search : ''));
  }

  function ensureSdk() {
    if (typeof require !== 'function') {
      throw new Error('Genesys SDK is not loaded.');
    }
    platformClient = require('platformClient');
    client = platformClient.ApiClient.instance;
    usersApi = new platformClient.UsersApi();
    conversationsApi = new platformClient.ConversationsApi();
    console.log(platformClient.VERSION);
    console.log(typeof platformClient.ApiClient);
    console.log(typeof client.loginPKCEGrant);
  }

  async function fetchGenesysConfig() {
    var response = await fetch('/api/genesys/config');
    if (!response.ok) {
      throw new Error('Could not load Genesys configuration.');
    }
    genesysConfig = await response.json();
    return genesysConfig;
  }

  async function start() {
    console.log('START');
    var settings = requireSettings();
    ensureSdk();

    client.setEnvironment(settings.region);
    client.setPersistSettings(true, '_mm_');

    console.log('SDK:', platformClient);
    console.log('%cLogging in to Genesys Cloud', 'color: green');
    await client.loginPKCEGrant(settings.clientId, settings.redirectUrl, {});

    var user = await usersApi.getUsersMe({});
    console.log(user);

    connected = true;
    connectedUser = user;
    notifyStatus();
    return user;
  }

  async function formatCallbackTime(formData) {
    var response = await fetch('/api/genesys/format-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: formData.date,
        time: formData.time,
        timezone: formData.timezone
      })
    });
    var data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Could not format callback time.');
    }
    return data.callbackScheduledTime;
  }

  function getConversationId() {
    var params = getUrlParams();
    return params.get('conversationId') || null;
  }

  async function createCallback(formData, meetingDetails) {
    await start();

    if (!genesysConfig) {
      await fetchGenesysConfig();
    }

    var phone = (formData.customerPhone || '').trim();
    if (!phone) {
      throw new Error('Customer phone is required for a Genesys callback.');
    }

    var callbackScheduledTime = await formatCallbackTime(formData);
    var zoomJoinUrl = (meetingDetails && meetingDetails.joinUrl) || genesysConfig.zoomJoinUrl;
    var zoomMeetingId = (meetingDetails && meetingDetails.meetingId) || genesysConfig.zoomMeetingId;

    var body = {
      queueId: genesysConfig.queueId,
      agentId: genesysConfig.agentId,
      scriptId: genesysConfig.scriptId,
      callbackScheduledTime: callbackScheduledTime,
      callerId: phone,
      callbackUserName: formData.customerName,
      callbackNumbers: [phone],
      data: {
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        meetingTitle: formData.title,
        zoomJoinUrl: zoomJoinUrl,
        zoomMeetingId: zoomMeetingId,
        conversationId: getConversationId(),
        agentName: genesysConfig.agentName,
        bookingSource: genesysConfig.bookingSource
      }
    };

    var result = await conversationsApi.postConversationsCallbacks(body);
    return { body: body, result: result };
  }

  function isConnected() {
    return connected;
  }

  function hasSettings() {
    return loadGenesysSettings().ready;
  }

  function onStatusChange(callback) {
    statusCallback = callback;
  }

  async function init() {
    await fetchGenesysConfig();

    if (!loadGenesysSettings().ready) {
      notifyStatus();
      return;
    }

    if (getUrlParams().get('code')) {
      try {
        await start();
        cleanOAuthParams();
      } catch (err) {
        console.log('Error:', err);
      }
    }
  }

  window.SeekGenesys = {
    init: init,
    start: start,
    createCallback: createCallback,
    isConnected: isConnected,
    hasSettings: hasSettings,
    onStatusChange: onStatusChange,
    settingsErrorMessage: settingsErrorMessage
  };
})();
