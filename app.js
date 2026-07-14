'use strict';

(function () {
  const {
    STORAGE_KEYS,
    DEFAULT_REQUISITIONS,
    DEFAULT_CANDIDATES,
    PIPELINE_COUNTS,
    KANBAN_STAGES,
    REQUISITION_STATUSES,
    CANDIDATE_STAGES,
    LOCATIONS,
    HIRING_MANAGERS,
    SKILLS_FILTER,
    loadFromStorage,
    saveToStorage
  } = window.TalentHubData;

  let requisitions = [];
  let candidates = [];
  let currentView = 'overview';
  let selectedRequisitionId = null;
  let selectedCandidateIds = new Set();
  let createStep = 1;
  let draftRequisition = {};
  let userClaims = null;

  const els = {};

  function $(id) { return document.getElementById(id); }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function getInitials(name) {
    return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  function statusClass(status) {
    return 'status-chip status-' + status.toLowerCase().replace(/\s+/g, '-');
  }

  function loadData() {
    const storedReqs = loadFromStorage(STORAGE_KEYS.REQUISITIONS, null);
    requisitions = storedReqs || DEFAULT_REQUISITIONS.map((r) => ({ ...r }));

    const stageOverrides = loadFromStorage(STORAGE_KEYS.CANDIDATE_STAGES, {});
    candidates = DEFAULT_CANDIDATES.map((c) => ({
      ...c,
      stage: stageOverrides[c.id] || c.stage
    }));

    const savedSection = loadFromStorage(STORAGE_KEYS.ACTIVE_SECTION, 'overview');
    currentView = savedSection;
  }

  function persistRequisitions() {
    saveToStorage(STORAGE_KEYS.REQUISITIONS, requisitions);
  }

  function persistCandidateStage(candidateId, stage) {
    const overrides = loadFromStorage(STORAGE_KEYS.CANDIDATE_STAGES, {});
    overrides[candidateId] = stage;
    saveToStorage(STORAGE_KEYS.CANDIDATE_STAGES, overrides);
    const cand = candidates.find((c) => c.id === candidateId);
    if (cand) cand.stage = stage;
  }

  function showLoginView(state) {
    const loginView = $('login-view');
    const portal = $('portal');
    const readyPanel = $('login-ready');
    const redirectingPanel = $('login-redirecting');
    const callbackPanel = $('login-callback');
    const errorPanel = $('login-error');

    loginView.hidden = false;
    portal.hidden = true;
    errorPanel.hidden = true;
    readyPanel.hidden = true;
    redirectingPanel.hidden = true;
    callbackPanel.hidden = true;

    if (state === 'redirecting') {
      redirectingPanel.hidden = false;
    } else if (state === 'callback') {
      callbackPanel.hidden = false;
    } else if (state === 'error') {
      errorPanel.hidden = false;
    } else {
      readyPanel.hidden = false;
    }
  }

  function showPortalView(claims) {
    userClaims = claims;
    $('login-view').hidden = true;
    $('portal').hidden = false;

    const displayName = claims.name || claims.email || claims.sub || 'User';
    const firstName = claims.given_name || displayName.split(' ')[0] || 'there';

    $('user-display-name').textContent = displayName;
    $('user-avatar').textContent = getInitials(displayName);
    $('dashboard-greeting').textContent = 'Good morning, ' + firstName;

    navigateTo(currentView, false);
    bindPortalEvents();
  }

  function navigateTo(view, persist) {
    currentView = view;
    if (persist !== false) {
      saveToStorage(STORAGE_KEYS.ACTIVE_SECTION, view);
    }

    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    document.querySelectorAll('.view-panel').forEach((panel) => {
      panel.hidden = panel.id !== 'view-' + view;
    });

    if (view === 'overview') renderDashboard();
    if (view === 'requisitions') renderRequisitionsList();
    if (view === 'candidates') renderCandidatesList();
    if (view === 'requisition-detail') renderRequisitionDetail();
    if (view === 'talent-pools') renderPlaceholder('talent-pools', 'Talent pools', 'Organise passive candidates into searchable pools.');

    closeCandidateProfile();
    closeMobileSidebar();
  }

  function renderPlaceholder(viewId, title, desc) {
    const panel = $('view-' + viewId);
    if (!panel) return;
    panel.innerHTML = '<div class="placeholder-view"><h2>' + title + '</h2><p>' + desc + '</p></div>';
  }

  function renderDashboard() {
    const tbody = $('dashboard-req-tbody');
    if (!tbody) return;

    const rows = requisitions.slice(0, 5).map((r) => `
      <tr>
        <td data-label="Job title"><strong>${r.jobTitle}</strong></td>
        <td data-label="Location">${r.location}</td>
        <td data-label="Hiring manager">${r.hiringManager}</td>
        <td data-label="Candidates">${r.applicants}</td>
        <td data-label="Status"><span class="${statusClass(r.status)}">${r.status}</span></td>
        <td data-label="Closing">${formatDate(r.closingDate)}</td>
        <td data-label="Actions">
          <button class="btn btn-ghost btn-sm" data-action="view-req" data-id="${r.id}">View</button>
        </td>
      </tr>
    `).join('');

    tbody.innerHTML = rows;

    const maxPipeline = Math.max(...Object.values(PIPELINE_COUNTS));
    const pipelineEl = $('pipeline-bars');
    if (pipelineEl) {
      pipelineEl.innerHTML = Object.entries(PIPELINE_COUNTS).map(([stage, count]) => {
        const pct = Math.round((count / maxPipeline) * 100);
        return `<div class="pipeline-row">
          <span class="pipeline-label">${stage}</span>
          <div class="pipeline-bar-track"><div class="pipeline-bar-fill" style="width:${pct}%"></div></div>
          <span class="pipeline-count">${count}</span>
        </div>`;
      }).join('');
    }
  }

  function getActiveRequisitionSearch() {
    return ($('global-search')?.value || $('req-search')?.value || '').trim().toLowerCase();
  }

  function syncRequisitionSearchInputs(value) {
    const v = value ?? getActiveRequisitionSearch();
    if ($('global-search')) $('global-search').value = v;
    if ($('req-search')) $('req-search').value = v;
  }

  function runGlobalSearch() {
    const query = ($('global-search')?.value || '').trim();
    syncRequisitionSearchInputs(query);

    const matches = requisitions.filter((r) => {
      const hay = [r.id, r.jobTitle, r.location, r.hiringManager, r.department || ''].join(' ').toLowerCase();
      return !query || hay.includes(query.toLowerCase());
    });

    if (matches.length === 1) {
      selectedRequisitionId = matches[0].id;
      document.querySelectorAll('.req-tab').forEach((t, i) => {
        t.classList.toggle('active', i === 0);
      });
      document.querySelectorAll('.req-tab-panel').forEach((p, i) => {
        p.hidden = i !== 0;
      });
      navigateTo('requisition-detail');
      return;
    }

    navigateTo('requisitions');
    renderRequisitionsList();
  }

  function getFilteredRequisitions() {
    const search = getActiveRequisitionSearch();
    const status = $('req-status-filter')?.value || '';
    const location = $('req-location-filter')?.value || '';
    const manager = $('req-manager-filter')?.value || '';
    const sort = $('req-sort')?.value || 'posted-desc';

    let list = requisitions.filter((r) => {
      const hay = [r.id, r.jobTitle, r.location, r.hiringManager].join(' ').toLowerCase();
      if (search && !hay.includes(search)) return false;
      if (status && r.status !== status) return false;
      if (location && r.location !== location) return false;
      if (manager && r.hiringManager !== manager) return false;
      return true;
    });

    list.sort((a, b) => {
      if (sort === 'title-asc') return a.jobTitle.localeCompare(b.jobTitle);
      if (sort === 'closing-asc') return (a.closingDate || '').localeCompare(b.closingDate || '');
      if (sort === 'applicants-desc') return b.applicants - a.applicants;
      return (b.postedDate || '').localeCompare(a.postedDate || '');
    });

    return list;
  }

  function renderRequisitionsList() {
    const tbody = $('requisitions-tbody');
    const empty = $('requisitions-empty');
    if (!tbody) return;

    const list = getFilteredRequisitions();

    if (list.length === 0) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    tbody.innerHTML = list.map((r) => `
      <tr>
        <td data-label="ID"><button class="link-btn" data-action="view-req" data-id="${r.id}">${r.id}</button></td>
        <td data-label="Job title"><strong>${r.jobTitle}</strong></td>
        <td data-label="Location">${r.location}</td>
        <td data-label="Hiring manager">${r.hiringManager}</td>
        <td data-label="Applicants">${r.applicants}</td>
        <td data-label="Shortlisted">${r.shortlisted}</td>
        <td data-label="Status"><span class="${statusClass(r.status)}">${r.status}</span></td>
        <td data-label="Posted">${formatDate(r.postedDate)}</td>
        <td data-label="Closing">${formatDate(r.closingDate)}</td>
        <td data-label="Actions">
          <button class="btn btn-ghost btn-sm" data-action="view-req" data-id="${r.id}">Open</button>
        </td>
      </tr>
    `).join('');
  }

  function renderRequisitionDetail() {
    const req = requisitions.find((r) => r.id === selectedRequisitionId);
    const panel = $('view-requisition-detail');
    if (!req || !panel) return;

    $('req-detail-title').textContent = req.jobTitle;
    $('req-detail-meta').textContent = `${req.id} · ${req.location}${req.state ? ', ' + req.state : ''} · ${req.workplaceType}`;

    const summaryCards = [
      { label: 'Total applicants', value: req.applicants },
      { label: 'New applicants', value: Math.max(2, Math.floor(req.applicants * 0.15)) },
      { label: 'Shortlisted', value: req.shortlisted },
      { label: 'Interviews', value: Math.floor(req.shortlisted * 0.4) },
      { label: 'Offers', value: Math.max(0, Math.floor(req.shortlisted * 0.15)) }
    ];

    $('req-summary-cards').innerHTML = summaryCards.map((c) => `
      <div class="metric-card small"><span class="metric-value">${c.value}</span><span class="metric-label">${c.label}</span></div>
    `).join('');

    const reqCandidates = candidates.filter((c) => c.requisitionId === req.id);
    const kanban = $('req-kanban');
    kanban.innerHTML = KANBAN_STAGES.map((stage) => {
      const stageCandidates = reqCandidates.filter((c) => {
        if (stage === 'New') return c.stage === 'New' || c.stage === 'Applied';
        return c.stage === stage;
      });
      const cards = stageCandidates.map((c) => renderKanbanCard(c)).join('');
      return `<div class="kanban-column" data-stage="${stage}">
        <div class="kanban-header"><h4>${stage}</h4><span class="kanban-count">${stageCandidates.length}</span></div>
        <div class="kanban-cards">${cards || '<p class="kanban-empty">No candidates</p>'}</div>
      </div>`;
    }).join('');
  }

  function renderKanbanCard(c) {
    const stageOptions = KANBAN_STAGES.map((s) =>
      `<option value="${s}" ${c.stage === s ? 'selected' : ''}>${s}</option>`
    ).join('');
    return `<div class="candidate-card" data-candidate-id="${c.id}">
      <div class="candidate-card-header">
        <div class="avatar sm">${getInitials(c.name)}</div>
        <div>
          <button class="link-btn" data-action="view-candidate" data-id="${c.id}">${c.name}</button>
          <p class="text-muted">${c.currentTitle}</p>
        </div>
        <span class="match-badge">${c.match}%</span>
      </div>
      <p class="card-meta">${c.location} · ${c.experience}</p>
      <p class="card-meta">Applied ${formatDate(c.appliedDate)}</p>
      <div class="skill-tags">${c.skills.slice(0, 3).map((s) => `<span class="tag">${s}</span>`).join('')}</div>
      <div class="card-actions">
        <select class="select-sm" data-action="move-stage" data-id="${c.id}" aria-label="Move ${c.name} to stage">${stageOptions}</select>
      </div>
    </div>`;
  }

  function getFilteredCandidates() {
    const search = ($('cand-search')?.value || '').toLowerCase();
    const req = $('cand-req-filter')?.value || '';
    const stage = $('cand-stage-filter')?.value || '';
    const location = $('cand-location-filter')?.value || '';
    const skill = $('cand-skills-filter')?.value || '';
    const sort = $('cand-sort')?.value || 'match-desc';

    let list = candidates.filter((c) => {
      const hay = [c.name, c.appliedFor, c.location, c.skills.join(' ')].join(' ').toLowerCase();
      if (search && !hay.includes(search)) return false;
      if (req && c.requisitionId !== req) return false;
      if (stage && c.stage !== stage) return false;
      if (location && c.location !== location) return false;
      if (skill && !c.skills.some((s) => s.toLowerCase().includes(skill.toLowerCase()))) return false;
      return true;
    });

    list.sort((a, b) => {
      if (sort === 'name-asc') return a.name.localeCompare(b.name);
      if (sort === 'applied-desc') return b.appliedDate.localeCompare(a.appliedDate);
      if (sort === 'activity-desc') return b.lastActivity.localeCompare(a.lastActivity);
      return b.match - a.match;
    });

    return list;
  }

  function renderCandidatesList() {
    const tbody = $('candidates-tbody');
    const empty = $('candidates-empty');
    if (!tbody) return;

    const list = getFilteredCandidates();

    if (list.length === 0) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    tbody.innerHTML = list.map((c) => `
      <tr>
        <td data-label="Select"><input type="checkbox" class="cand-checkbox" data-id="${c.id}" ${selectedCandidateIds.has(c.id) ? 'checked' : ''} aria-label="Select ${c.name}"></td>
        <td data-label="Candidate">
          <div class="candidate-cell">
            <div class="avatar sm">${getInitials(c.name)}</div>
            <button class="link-btn" data-action="view-candidate" data-id="${c.id}">${c.name}</button>
          </div>
        </td>
        <td data-label="Applied for">${c.appliedFor}</td>
        <td data-label="Location">${c.location}</td>
        <td data-label="Match"><span class="match-badge">${c.match}%</span></td>
        <td data-label="Stage"><span class="${statusClass(c.stage)}">${c.stage}</span></td>
        <td data-label="Applied">${formatDate(c.appliedDate)}</td>
        <td data-label="Last activity">${formatDate(c.lastActivity)}</td>
        <td data-label="Actions">
          <button class="btn btn-ghost btn-sm" data-action="view-candidate" data-id="${c.id}">Profile</button>
        </td>
      </tr>
    `).join('');

    $('bulk-actions-bar').hidden = selectedCandidateIds.size === 0;
    $('bulk-count').textContent = selectedCandidateIds.size + ' selected';
  }

  function openCandidateProfile(candidateId) {
    const c = candidates.find((x) => x.id === candidateId);
    if (!c) return;

    const drawer = $('candidate-profile');
    const backdrop = $('profile-backdrop');
    drawer.hidden = false;
    backdrop.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.setAttribute('aria-hidden', 'false');

    $('profile-name').textContent = c.name;
    $('profile-title').textContent = c.currentTitle;
    $('profile-location').textContent = c.location;
    $('profile-email').textContent = c.email;
    $('profile-phone').textContent = c.phone;
    $('profile-match').textContent = c.match + '% match';
    $('profile-stage').textContent = c.stage;
    $('profile-avatar').textContent = getInitials(c.name);

    $('profile-summary').textContent = c.summary;
    $('profile-work').innerHTML = c.workHistory.map((w) =>
      `<div class="timeline-item"><strong>${w.role}</strong><span>${w.company} · ${w.years}</span></div>`
    ).join('');
    $('profile-education').innerHTML = c.education.map((e) =>
      `<div class="timeline-item"><strong>${e.degree}</strong><span>${e.school} · ${e.years}</span></div>`
    ).join('');
    $('profile-skills').innerHTML = c.skills.map((s) => `<span class="tag">${s}</span>`).join('');
    $('profile-answers').innerHTML = c.applicationAnswers.map((a) =>
      `<div class="answer-block"><strong>${a.question}</strong><p>${a.answer}</p></div>`
    ).join('');

    $('ai-strengths').innerHTML = c.aiSummary.strengths.map((s) => `<li>${s}</li>`).join('');
    $('ai-gaps').innerHTML = c.aiSummary.gaps.map((s) => `<li>${s}</li>`).join('');
    $('ai-questions').innerHTML = c.aiSummary.questions.map((s) => `<li>${s}</li>`).join('');

    $('profile-stage-select').innerHTML = CANDIDATE_STAGES.filter((s) => s !== 'Archived').map((s) =>
      `<option value="${s}" ${c.stage === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    drawer.dataset.candidateId = c.id;
    document.body.classList.add('profile-open');
  }

  function closeCandidateProfile() {
    const drawer = $('candidate-profile');
    const backdrop = $('profile-backdrop');
    if (!drawer) return;
    drawer.hidden = true;
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute('aria-hidden', 'true');
    }
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('profile-open');
  }

  function openCreateModal() {
    createStep = 1;
    draftRequisition = {};
    $('create-requisition-modal').hidden = false;
    $('create-requisition-modal').setAttribute('aria-hidden', 'false');
    renderCreateStep();
  }

  function closeCreateModal() {
    $('create-requisition-modal').hidden = true;
    $('create-requisition-modal').setAttribute('aria-hidden', 'true');
  }

  function renderCreateStep() {
    document.querySelectorAll('.create-step').forEach((el) => {
      el.hidden = parseInt(el.dataset.step, 10) !== createStep;
    });

    document.querySelectorAll('.step-indicator').forEach((el) => {
      const step = parseInt(el.dataset.step, 10);
      el.classList.toggle('active', step === createStep);
      el.classList.toggle('completed', step < createStep);
    });

    $('create-back-btn').hidden = createStep === 1;
    $('create-continue-btn').hidden = createStep === 4;
    $('create-publish-btn').hidden = createStep !== 4;

    if (createStep === 4) {
      const f = getCreateFormValues();
      $('create-review').innerHTML = `
        <dl class="review-list">
          <dt>Job title</dt><dd>${f.jobTitle || '—'}</dd>
          <dt>Location</dt><dd>${f.location || '—'} (${f.workplaceType || '—'})</dd>
          <dt>Employment type</dt><dd>${f.employmentType || '—'}</dd>
          <dt>Department</dt><dd>${f.department || '—'}</dd>
          <dt>Hiring manager</dt><dd>${f.hiringManager || '—'}</dd>
          <dt>Recruiter</dt><dd>${f.recruiter || '—'}</dd>
          <dt>Salary range</dt><dd>${f.salaryRange || '—'}</dd>
          <dt>Closing date</dt><dd>${formatDate(f.closingDate)}</dd>
          <dt>Summary</dt><dd>${f.jobSummary || '—'}</dd>
        </dl>`;
    }
  }

  function getCreateFormValues() {
    const form = $('create-requisition-form');
    const data = new FormData(form);
    const obj = {};
    data.forEach((v, k) => { obj[k] = v; });
    return { ...draftRequisition, ...obj };
  }

  function saveDraftRequisition() {
    const f = getCreateFormValues();
    draftRequisition = f;
    const newId = 'REQ-' + (1040 + requisitions.length + 1);
    const newReq = {
      id: newId,
      jobTitle: f.jobTitle || 'Untitled role',
      location: f.location || 'Sydney',
      state: 'NSW',
      workplaceType: f.workplaceType || 'Hybrid',
      hiringManager: f.hiringManager || 'Olivia Chen',
      recruiter: f.recruiter || 'James Porter',
      department: f.department || 'General',
      employmentType: f.employmentType || 'Full-time',
      applicants: 0,
      shortlisted: 0,
      status: 'Draft',
      postedDate: null,
      closingDate: f.closingDate || null,
      jobSummary: f.jobSummary || '',
      responsibilities: f.responsibilities || '',
      requirements: f.requirements || '',
      salaryRange: f.salaryRange || ''
    };
    requisitions.unshift(newReq);
    persistRequisitions();
    closeCreateModal();
    navigateTo('requisitions');
  }

  function publishRequisition() {
    const f = getCreateFormValues();
    const newId = 'REQ-' + (1040 + requisitions.length + 1);
    const newReq = {
      id: newId,
      jobTitle: f.jobTitle || 'Untitled role',
      location: f.location || 'Sydney',
      state: f.location === 'Remote' ? '' : 'NSW',
      workplaceType: f.workplaceType || 'Hybrid',
      hiringManager: f.hiringManager || 'Olivia Chen',
      recruiter: f.recruiter || 'James Porter',
      department: f.department || 'General',
      employmentType: f.employmentType || 'Full-time',
      applicants: 0,
      shortlisted: 0,
      status: 'Active',
      postedDate: new Date().toISOString().slice(0, 10),
      closingDate: f.closingDate || null,
      jobSummary: f.jobSummary || '',
      responsibilities: f.responsibilities || '',
      requirements: f.requirements || '',
      salaryRange: f.salaryRange || ''
    };
    requisitions.unshift(newReq);
    persistRequisitions();
    closeCreateModal();
    navigateTo('requisitions');
  }

  function populateFilters() {
    const statusFilter = $('req-status-filter');
    if (statusFilter) {
      REQUISITION_STATUSES.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        statusFilter.appendChild(opt);
      });
    }

    ['req-location-filter', 'cand-location-filter'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      LOCATIONS.forEach((loc) => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc;
        el.appendChild(opt);
      });
    });

    const managerFilter = $('req-manager-filter');
    if (managerFilter) {
      HIRING_MANAGERS.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        managerFilter.appendChild(opt);
      });
    }

    const reqFilter = $('cand-req-filter');
    if (reqFilter) {
      requisitions.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.jobTitle;
        reqFilter.appendChild(opt);
      });
    }

    const stageFilter = $('cand-stage-filter');
    if (stageFilter) {
      CANDIDATE_STAGES.filter((s) => s !== 'Archived').forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        stageFilter.appendChild(opt);
      });
    }

    const skillsFilter = $('cand-skills-filter');
    if (skillsFilter) {
      SKILLS_FILTER.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        skillsFilter.appendChild(opt);
      });
    }
  }

  function closeMobileSidebar() {
    document.body.classList.remove('sidebar-open');
    $('sidebar-overlay')?.setAttribute('aria-hidden', 'true');
  }

  function toggleMobileSidebar() {
    document.body.classList.toggle('sidebar-open');
    const open = document.body.classList.contains('sidebar-open');
    $('sidebar-overlay')?.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function toggleUserMenu() {
    const menu = $('user-menu');
    const open = menu.hidden;
    menu.hidden = !open;
    $('user-menu-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function bindPortalEvents() {
    if (els.portalBound) return;
    els.portalBound = true;

    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.view));
    });

    $('sidebar-create-btn')?.addEventListener('click', openCreateModal);
    $('req-create-btn')?.addEventListener('click', openCreateModal);
    $('dashboard-create-btn')?.addEventListener('click', openCreateModal);

    $('global-search')?.addEventListener('search', runGlobalSearch);
    $('global-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runGlobalSearch();
      }
    });

    $('req-search')?.addEventListener('input', () => {
      syncRequisitionSearchInputs($('req-search').value);
      renderRequisitionsList();
    });
    $('req-search')?.addEventListener('search', () => {
      syncRequisitionSearchInputs($('req-search').value);
      renderRequisitionsList();
    });

    ['req-status-filter', 'req-location-filter', 'req-manager-filter', 'req-sort'].forEach((id) => {
      $(id)?.addEventListener('input', renderRequisitionsList);
      $(id)?.addEventListener('change', renderRequisitionsList);
    });

    ['cand-search', 'cand-req-filter', 'cand-stage-filter', 'cand-location-filter', 'cand-skills-filter', 'cand-sort'].forEach((id) => {
      $(id)?.addEventListener('input', renderCandidatesList);
      $(id)?.addEventListener('change', renderCandidatesList);
    });

    document.body.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;

      const act = action.dataset.action;
      const id = action.dataset.id;

      if (act === 'view-req') {
        selectedRequisitionId = id;
        document.querySelectorAll('.req-tab').forEach((t, i) => {
          t.classList.toggle('active', i === 0);
        });
        document.querySelectorAll('.req-tab-panel').forEach((p, i) => {
          p.hidden = i !== 0;
        });
        navigateTo('requisition-detail');
      }
      if (act === 'view-candidate') {
        openCandidateProfile(id);
      }
      if (act === 'back-to-requisitions') {
        navigateTo('requisitions');
      }
    });

    document.body.addEventListener('change', (e) => {
      if (e.target.matches('[data-action="move-stage"]')) {
        persistCandidateStage(e.target.dataset.id, e.target.value);
        if (currentView === 'requisition-detail') renderRequisitionDetail();
        if (currentView === 'candidates') renderCandidatesList();
      }
      if (e.target.matches('.cand-checkbox')) {
        const cid = e.target.dataset.id;
        if (e.target.checked) selectedCandidateIds.add(cid);
        else selectedCandidateIds.delete(cid);
        $('bulk-actions-bar').hidden = selectedCandidateIds.size === 0;
        $('bulk-count').textContent = selectedCandidateIds.size + ' selected';
      }
    });

    $('profile-close-btn')?.addEventListener('click', closeCandidateProfile);
    $('profile-backdrop')?.addEventListener('click', closeCandidateProfile);

    $('profile-stage-select')?.addEventListener('change', (e) => {
      const cid = $('candidate-profile').dataset.candidateId;
      if (cid) {
        persistCandidateStage(cid, e.target.value);
        $('profile-stage').textContent = e.target.value;
        if (currentView === 'candidates') renderCandidatesList();
        if (currentView === 'requisition-detail') renderRequisitionDetail();
      }
    });

    $('modal-close-btn')?.addEventListener('click', closeCreateModal);
    $('modal-backdrop')?.addEventListener('click', closeCreateModal);
    $('create-back-btn')?.addEventListener('click', () => { createStep--; renderCreateStep(); });
    $('create-continue-btn')?.addEventListener('click', () => {
      draftRequisition = getCreateFormValues();
      createStep++;
      renderCreateStep();
    });
    $('create-draft-btn')?.addEventListener('click', saveDraftRequisition);
    $('create-publish-btn')?.addEventListener('click', publishRequisition);

    $('logout-btn')?.addEventListener('click', () => TalentHubAuth.signOut());
    $('user-menu-btn')?.addEventListener('click', toggleUserMenu);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#user-menu') && !e.target.closest('#user-menu-btn')) {
        $('user-menu').hidden = true;
        $('user-menu-btn')?.setAttribute('aria-expanded', 'false');
      }
    });


    $('sidebar-toggle')?.addEventListener('click', toggleMobileSidebar);
    $('sidebar-overlay')?.addEventListener('click', closeMobileSidebar);

    $('req-detail-back')?.addEventListener('click', () => navigateTo('requisitions'));

    document.querySelectorAll('.req-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.req-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.req-tab-panel').forEach((p) => {
          p.hidden = p.id !== 'tab-' + tab.dataset.tab;
        });
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCandidateProfile();
        closeCreateModal();
        closeMobileSidebar();
      }
    });
  }

  function bindLoginEvents() {
    $('login-btn')?.addEventListener('click', () => TalentHubAuth.signIn());
    $('login-retry-btn')?.addEventListener('click', () => {
      try { sessionStorage.removeItem('okta-redirect-attempted'); } catch (err) { /* ignore */ }
      TalentHubAuth.signIn();
    });
    $('login-error-details-toggle')?.addEventListener('click', () => {
      $('login-error-details').hidden = !$('login-error-details').hidden;
    });
  }

  function showAuthError(err) {
    showLoginView('error');
    const detail = err?.data?.message || err?.message || err?.errorSummary || String(err);
    $('login-error-message').textContent = 'Something went wrong while signing you in. Please try again.';
    $('login-error-details').textContent = detail;
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadData();
    populateFilters();
    bindLoginEvents();

    TalentHubAuth.callbacks.onRedirecting = () => showLoginView('redirecting');
    TalentHubAuth.callbacks.onHandlingCallback = () => showLoginView('callback');
    TalentHubAuth.callbacks.onAuthenticated = (claims) => showPortalView(claims);
    TalentHubAuth.callbacks.onUnauthenticated = () => showLoginView('ready');
    TalentHubAuth.callbacks.onAuthError = showAuthError;

    showLoginView('ready');
    TalentHubAuth.init();
  });
})();
