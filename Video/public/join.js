(function () {
  var MEETING_ID = '5730504836';
  var MEETING_PASSWORD = '0x39uWU7imanPc5YigqzSal2LbDLjn.1';
  var WEB_CLIENT_URL = 'https://genesys.zoom.us/wc/join/' + MEETING_ID
    + '?pwd=' + encodeURIComponent(MEETING_PASSWORD)
    + '&prefer=1';

  var joinBtn = document.getElementById('join-btn');
  var leaveBtn = document.getElementById('leave-btn');
  var meetingView = document.getElementById('meeting-view');
  var zoomFrame = document.getElementById('zoom-frame');
  var meetingLoading = document.getElementById('meeting-loading');

  function showMeeting() {
    document.body.classList.add('in-meeting');
    meetingView.hidden = false;
    requestAnimationFrame(function () {
      meetingView.classList.add('is-active');
    });
    meetingLoading.classList.remove('hidden');
    zoomFrame.src = WEB_CLIENT_URL;
  }

  function hideMeeting() {
    document.body.classList.remove('in-meeting');
    meetingView.classList.remove('is-active');
    zoomFrame.src = 'about:blank';
    meetingLoading.classList.remove('hidden');

    window.setTimeout(function () {
      meetingView.hidden = true;
    }, 350);
  }

  joinBtn.addEventListener('click', showMeeting);

  leaveBtn.addEventListener('click', hideMeeting);

  zoomFrame.addEventListener('load', function () {
    if (zoomFrame.src && zoomFrame.src !== 'about:blank') {
      meetingLoading.classList.add('hidden');
    }
  });
})();
