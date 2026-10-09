// State
let allGroups = [];
let officialRoster = [];
let adminToken = sessionStorage.getItem('pfe_admin_token') || null;
let pollTimer = null;
let lastHighlightId = null;

// Partner invitation state
let currentInvitedGroupId = null;
let pendingStudentData = null; // Stored when opening modal

// DOM Elements
const rankingTableBody = document.getElementById('rankingTableBody');
const studentCountBadge = document.getElementById('studentCountBadge');
const studentForm = document.getElementById('studentForm');
const btnSubmit = document.getElementById('btnSubmit');
const formAlert = document.getElementById('formAlert');
const searchInput = document.getElementById('searchInput');
const btnClearSearch = document.getElementById('btnClearSearch');
const searchResultsInfo = document.getElementById('searchResultsInfo');
const btnRefresh = document.getElementById('btnRefresh');

const rosterSelect = document.getElementById('rosterSelect');
const nomInput = document.getElementById('nom');
const prenomInput = document.getElementById('prenom');
const moyenneInput = document.getElementById('moyenne');

// Invited Partner Banner
const invitedPartnerBanner = document.getElementById('invitedPartnerBanner');
const invitedStudentName = document.getElementById('invitedStudentName');
const invitingPartnerName = document.getElementById('invitingPartnerName');

// Partner Selection Modal
const partnerChoiceModal = document.getElementById('partnerChoiceModal');
const btnClosePartnerModal = document.getElementById('btnClosePartnerModal');
const modalStudentName = document.getElementById('modalStudentName');
const decisionStepBox = document.getElementById('decisionStepBox');
const btnChooseMonome = document.getElementById('btnChooseMonome');
const btnChooseBinome = document.getElementById('btnChooseBinome');

const binomeSelectionBox = document.getElementById('binomeSelectionBox');
const partnerSelect = document.getElementById('partnerSelect');
const partnerSelectError = document.getElementById('partnerSelectError');
const btnBackToDecision = document.getElementById('btnBackToDecision');
const btnConfirmBinome = document.getElementById('btnConfirmBinome');

// Admin Elements
const btnOpenAdmin = document.getElementById('btnOpenAdmin');
const adminLoginModal = document.getElementById('adminLoginModal');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminPasswordInput = document.getElementById('adminPassword');
const adminLoginError = document.getElementById('adminLoginError');
const btnCloseLoginModal = document.getElementById('btnCloseLoginModal');
const btnCancelLogin = document.getElementById('btnCancelLogin');

const adminDashboardModal = document.getElementById('adminDashboardModal');
const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
const adminTableBody = document.getElementById('adminTableBody');
const adminAlert = document.getElementById('adminAlert');
const btnExportCSV = document.getElementById('btnExportCSV');
const btnClearAll = document.getElementById('btnClearAll');
const btnAdminLogout = document.getElementById('btnAdminLogout');

// Edit Modal Elements
const adminEditModal = document.getElementById('adminEditModal');
const adminEditForm = document.getElementById('adminEditForm');
const btnCloseEditModal = document.getElementById('btnCloseEditModal');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const editGroupId = document.getElementById('editGroupId');
const editType = document.getElementById('editType');
const editBinomeFields = document.getElementById('editBinomeFields');
const editNom1 = document.getElementById('editNom1');
const editPrenom1 = document.getElementById('editPrenom1');
const editMoyenne1 = document.getElementById('editMoyenne1');
const editNom2 = document.getElementById('editNom2');
const editPrenom2 = document.getElementById('editPrenom2');
const editMoyenne2 = document.getElementById('editMoyenne2');

// Toast
const toast = document.getElementById('toast');

// ===================================================
// INITIALIZATION
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
  fetchRoster();
  fetchRanking();
  setupEventListeners();

  // Background refresh every 6 seconds
  pollTimer = setInterval(() => {
    fetchRanking(true);
    fetchRoster(true);
  }, 6000);
});

function setupEventListeners() {
  // Main form submission
  studentForm.addEventListener('submit', handleFormSubmit);

  // Roster quick selection
  rosterSelect.addEventListener('change', async (e) => {
    const val = e.target.value;
    if (val) {
      const [nom, prenom] = val.split('|');
      nomInput.value = nom || '';
      prenomInput.value = prenom || '';
      await checkPartnerInvitation(nom, prenom);
      moyenneInput.focus();
    } else {
      resetInvitedPartnerState();
    }
  });

  // Manual input blur check
  nomInput.addEventListener('blur', checkInputPartnerStatus);
  prenomInput.addEventListener('blur', checkInputPartnerStatus);

  // Partner Modal Controls
  btnClosePartnerModal.addEventListener('click', closePartnerModal);
  btnChooseMonome.addEventListener('click', handleChooseMonome);
  btnChooseBinome.addEventListener('click', handleShowBinomeSelect);
  btnBackToDecision.addEventListener('click', handleBackToDecision);
  btnConfirmBinome.addEventListener('click', handleConfirmBinome);

  // Search
  searchInput.addEventListener('input', handleSearch);
  btnClearSearch.addEventListener('click', clearSearch);

  // Refresh
  btnRefresh.addEventListener('click', () => {
    btnRefresh.textContent = '⏳ ...';
    Promise.all([fetchRanking(), fetchRoster()]).finally(() => {
      setTimeout(() => { btnRefresh.textContent = '🔄 تحديث'; }, 600);
    });
  });

  // Admin Login
  btnOpenAdmin.addEventListener('click', () => {
    if (adminToken) {
      openAdminDashboard();
    } else {
      adminLoginModal.style.display = 'flex';
      adminPasswordInput.value = '';
      adminLoginError.textContent = '';
      adminPasswordInput.focus();
    }
  });

  btnCloseLoginModal.addEventListener('click', () => adminLoginModal.style.display = 'none');
  btnCancelLogin.addEventListener('click', () => adminLoginModal.style.display = 'none');
  adminLoginForm.addEventListener('submit', handleAdminLogin);

  // Admin Dashboard Actions
  btnCloseAdminModal.addEventListener('click', () => adminDashboardModal.style.display = 'none');
  btnAdminLogout.addEventListener('click', handleAdminLogout);
  btnExportCSV.addEventListener('click', handleExportCSV);
  if (btnClearAll) {
    btnClearAll.addEventListener('click', handleClearAll);
  }

  // Edit Modal Actions
  btnCloseEditModal.addEventListener('click', () => adminEditModal.style.display = 'none');
  btnCancelEdit.addEventListener('click', () => adminEditModal.style.display = 'none');
  adminEditForm.addEventListener('submit', handleEditSubmit);

  editType.addEventListener('change', (e) => {
    editBinomeFields.style.display = e.target.value === 'binome' ? 'block' : 'none';
  });

  // Backdrop clicks
  [adminLoginModal, adminDashboardModal, adminEditModal, partnerChoiceModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        if (modal === partnerChoiceModal) closePartnerModal();
        else modal.style.display = 'none';
      }
    });
  });
}

// ===================================================
// PARTNER INVITATION DETECTION
// ===================================================
async function checkInputPartnerStatus() {
  const nom = nomInput.value.trim();
  const prenom = prenomInput.value.trim();
  if (nom.length >= 2 && prenom.length >= 2) {
    await checkPartnerInvitation(nom, prenom);
  }
}

async function checkPartnerInvitation(nom, prenom) {
  try {
    const res = await fetch(`/api/check-partner?nom=${encodeURIComponent(nom)}&prenom=${encodeURIComponent(prenom)}`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.isInvited && !data.hasSubmitted) {
      currentInvitedGroupId = data.groupId;
      invitedStudentName.textContent = prenom;
      invitingPartnerName.textContent = data.partnerName;
      invitedPartnerBanner.style.display = 'flex';
      btnSubmit.querySelector('.btn-text').textContent = 'تأكيد معدلي وإكمال الشراكة 🚀';
    } else {
      resetInvitedPartnerState();
    }
  } catch (err) {
    resetInvitedPartnerState();
  }
}

function resetInvitedPartnerState() {
  currentInvitedGroupId = null;
  invitedPartnerBanner.style.display = 'none';
  btnSubmit.querySelector('.btn-text').textContent = 'تسجيل واحتساب الترتيب 🚀';
}

// ===================================================
// ROSTER FETCHING & POPULATING
// ===================================================
async function fetchRoster(isBackground = false) {
  try {
    const res = await fetch('/api/roster');
    if (!res.ok) return;
    const data = await res.json();
    officialRoster = data.roster || [];
    renderRosterOptions();
  } catch (e) {
    if (!isBackground) console.error('Roster error:', e);
  }
}

function renderRosterOptions() {
  const currentVal = rosterSelect.value;
  let html = `<option value="">-- اضغط لاختيار اسمك مباشرة --</option>`;

  officialRoster.forEach(s => {
    let statusText = '';
    if (s.isRegistered) {
      statusText = ' (✅ مسجل)';
    } else if (s.isInvitedPartner) {
      statusText = ' (🤝 شريك مطلوب)';
    }
    const key = `${s.nom}|${s.prenom}`;
    const disabledAttr = s.isRegistered ? 'style="color:#64748b;"' : '';
    html += `<option value="${escapeHtml(key)}" ${disabledAttr}>${escapeHtml(s.nom.toUpperCase())} ${escapeHtml(s.prenom)}${statusText}</option>`;
  });

  rosterSelect.innerHTML = html;
  if (currentVal) rosterSelect.value = currentVal;
}

function populatePartnerSelect(excludeNom, excludePrenom) {
  const exN = (excludeNom || '').toLowerCase().trim();
  const exP = (excludePrenom || '').toLowerCase().trim();

  let html = `<option value="">-- اضغط لاختيار الشريك من القائمة --</option>`;

  officialRoster.forEach(s => {
    const sN = s.nom.toLowerCase().trim();
    const sP = s.prenom.toLowerCase().trim();

    // Do not show oneself
    if (sN === exN && sP === exP) return;

    // Do not show students who have already submitted their grade or are in another team
    if (s.isRegistered) return;

    const key = `${s.nom}|${s.prenom}`;
    html += `<option value="${escapeHtml(key)}">${escapeHtml(s.nom.toUpperCase())} ${escapeHtml(s.prenom)}</option>`;
  });

  partnerSelect.innerHTML = html;
}

// ===================================================
// PUBLIC RANKING & DISPLAY
// ===================================================
async function fetchRanking(isBackground = false) {
  try {
    const res = await fetch('/api/students');
    if (!res.ok) throw new Error('فشل في تحميل الترتيب');
    const data = await res.json();
    
    allGroups = data.students || [];
    const totalRegistered = data.totalRegisteredStudents || 0;
    const totalOfficial = data.totalOfficial || 30;

    studentCountBadge.textContent = `${totalRegistered} / ${totalOfficial} طالباً مسجلاً`;
    
    renderRankingTable(filterGroups(searchInput.value));
  } catch (error) {
    if (!isBackground) {
      rankingTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="empty-state" style="color: var(--danger);">
            ⚠️ تعذر الاتصال بالخادم لتحميل الترتيب. يرجى إعادة المحاولة.
          </td>
        </tr>`;
    }
  }
}

function filterGroups(query) {
  if (!query || !query.trim()) return allGroups;
  const q = normalizeString(query);
  return allGroups.filter(g => {
    const str1 = `${g.prenom1} ${g.nom1} ${g.nom1} ${g.prenom1}`;
    const str2 = g.nom2 ? `${g.prenom2} ${g.nom2} ${g.nom2} ${g.prenom2}` : '';
    return normalizeString(str1).includes(q) || normalizeString(str2).includes(q);
  });
}

function normalizeString(str) {
  return (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function renderRankingTable(groups) {
  const query = searchInput.value.trim();

  // Search info indicator
  if (query) {
    searchResultsInfo.style.display = 'flex';
    searchResultsInfo.innerHTML = `
      <span>نتائج البحث عن "<strong>${escapeHtml(query)}</strong>" : <strong>${groups.length}</strong> نتيجة</span>
      <button class="btn btn-sm btn-secondary" onclick="clearSearch()">إلغاء البحث</button>
    `;
    btnClearSearch.style.display = 'block';
  } else {
    searchResultsInfo.style.display = 'none';
    btnClearSearch.style.display = 'none';
  }

  if (groups.length === 0) {
    if (query) {
      rankingTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="empty-state">
            🔍 لم يتم العثور على أي طالب أو فريق باسم "<strong>${escapeHtml(query)}</strong>".
          </td>
        </tr>`;
    } else {
      rankingTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="empty-state">
            🌱 لم يتم تسجيل أي طالب حتى الآن. كن أول من يضيف معلوماته !
          </td>
        </tr>`;
    }
    return;
  }

  rankingTableBody.innerHTML = groups.map(g => {
    const isHighlighted = lastHighlightId === g.id;
    const rankBadgeHtml = formatRankBadge(g.rank);
    const exAequoBadge = g.isExAequo ? '<span class="badge-ex-aequo" title="تساوي في المعدل">Ex æquo</span>' : '';
    const isBinome = g.type === 'binome';
    
    const typeBadge = isBinome 
      ? `<span class="badge-type badge-type-binome">👥 Binôme</span>`
      : `<span class="badge-type badge-type-monome">👤 Monôme</span>`;

    const initials1 = `${g.prenom1.charAt(0)}${g.nom1.charAt(0)}`.toUpperCase();
    let avatarsHtml = `<div class="student-avatar">${initials1}</div>`;
    let namesHtml = `<div class="team-primary-name">${escapeHtml(g.nom1.toUpperCase())} ${escapeHtml(g.prenom1)}</div>`;

    if (isBinome && g.nom2) {
      const initials2 = `${g.prenom2.charAt(0)}${g.nom2.charAt(0)}`.toUpperCase();
      avatarsHtml = `
        <div class="team-avatars">
          <div class="student-avatar" title="${escapeHtml(g.prenom1)}">${initials1}</div>
          <div class="student-avatar" title="${escapeHtml(g.prenom2)}">${initials2}</div>
        </div>
      `;

      const pendingBadge = !g.isComplete ? `<span class="badge-pending-partner">⏳ في انتظار تسجيل الزميل</span>` : '';

      namesHtml = `
        <div class="team-names">
          <span class="team-primary-name">${escapeHtml(g.nom1.toUpperCase())} ${escapeHtml(g.prenom1)}</span>
          <span class="team-secondary-name">&amp; ${escapeHtml(g.nom2.toUpperCase())} ${escapeHtml(g.prenom2)} ${pendingBadge}</span>
        </div>
      `;
    }

    return `
      <tr class="${isHighlighted ? 'highlight-row' : ''}" data-group-id="${g.id}">
        <td class="col-rank">
          ${rankBadgeHtml}
        </td>
        <td class="col-type">
          ${typeBadge}
        </td>
        <td class="col-student">
          <div class="student-team-cell">
            ${avatarsHtml}
            <div>
              ${namesHtml}
              ${exAequoBadge}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function formatRankBadge(rank) {
  if (rank === 1) {
    return `<span class="rank-badge rank-top1">🥇 1er</span>`;
  } else if (rank === 2) {
    return `<span class="rank-badge rank-top2">🥈 2e</span>`;
  } else if (rank === 3) {
    return `<span class="rank-badge rank-top3">🥉 3e</span>`;
  } else {
    return `<span class="rank-badge rank-other">${rank}e</span>`;
  }
}

// ===================================================
// FORM SUBMIT & MODAL WORKFLOW
// ===================================================
async function handleFormSubmit(e) {
  e.preventDefault();
  clearFormErrors();
  hideAlert(formAlert);

  const nom = nomInput.value.trim();
  const prenom = prenomInput.value.trim();
  const moyenneVal = moyenneInput.value.trim();

  let hasError = false;

  if (!nom || nom.length < 2) {
    showFieldError('nomError', 'يرجى إدخال اللقب بشكل صحيح.');
    hasError = true;
  }
  if (!prenom || prenom.length < 2) {
    showFieldError('prenomError', 'يرجى إدخال الاسم بشكل صحيح.');
    hasError = true;
  }
  const moyenne = parseFloat(moyenneVal);
  if (isNaN(moyenne) || moyenne < 0 || moyenne > 20) {
    showFieldError('moyenneError', 'المعدل يجب أن يكون رقماً بين 0.00 و 20.00.');
    hasError = true;
  }

  if (hasError) return;

  // CASE 1: Student is completing an existing Binôme invitation
  if (currentInvitedGroupId) {
    await completePartnerRegistration(currentInvitedGroupId, moyenne);
    return;
  }

  // CASE 2: New Student -> Open Partner Choice Modal!
  pendingStudentData = { nom, prenom, moyenne };
  modalStudentName.textContent = `${prenom} ${nom}`;
  
  // Reset modal state to step 1
  decisionStepBox.style.display = 'block';
  binomeSelectionBox.style.display = 'none';
  partnerSelectError.textContent = '';
  partnerChoiceModal.style.display = 'flex';
}

// Modal: User clicked Monôme
async function handleChooseMonome() {
  closePartnerModal();
  if (!pendingStudentData) return;

  setButtonLoading(btnSubmit, true);

  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'monome',
        nom: pendingStudentData.nom,
        prenom: pendingStudentData.prenom,
        moyenne: pendingStudentData.moyenne
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showAlert(formAlert, 'alert-error', data.message || 'حدث خطأ أثناء التسجيل.');
      return;
    }

    showAlert(formAlert, 'alert-success', `
      🎉 <strong>مرحباً ${escapeHtml(pendingStudentData.prenom)} !</strong><br>
      تم تسجيلك بنجاح كمشروع فردي (<strong>Monôme</strong>). رتبتك الحالية هي: <strong>المرتبة ${data.group.rank}</strong>.<br>
      <em>(ملاحظة: معدلك محفوظ بسرية تامة ولا يظهر للطلبة).</em>
    `);

    resetFormAfterSuccess();

  } catch (err) {
    showAlert(formAlert, 'alert-error', 'تعذر الاتصال بالخادم.');
  } finally {
    setButtonLoading(btnSubmit, false);
    pendingStudentData = null;
  }
}

// Modal: User clicked Binôme -> Show partner dropdown
function handleShowBinomeSelect() {
  if (!pendingStudentData) return;
  decisionStepBox.style.display = 'none';
  binomeSelectionBox.style.display = 'block';
  populatePartnerSelect(pendingStudentData.nom, pendingStudentData.prenom);
}

// Modal: Back to decision
function handleBackToDecision() {
  decisionStepBox.style.display = 'block';
  binomeSelectionBox.style.display = 'none';
  partnerSelectError.textContent = '';
}

// Modal: Confirm Binôme with chosen partner
async function handleConfirmBinome() {
  partnerSelectError.textContent = '';
  const selectedPartnerVal = partnerSelect.value;

  if (!selectedPartnerVal) {
    partnerSelectError.textContent = 'يرجى اختيار الشريك من القائمة أولاً.';
    return;
  }

  const [nom2, prenom2] = selectedPartnerVal.split('|');
  closePartnerModal();

  setButtonLoading(btnSubmit, true);

  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'binome',
        nom1: pendingStudentData.nom,
        prenom1: pendingStudentData.prenom,
        moyenne1: pendingStudentData.moyenne,
        nom2,
        prenom2
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showAlert(formAlert, 'alert-error', data.message || 'حدث خطأ أثناء التسجيل.');
      return;
    }

    showAlert(formAlert, 'alert-success', `
      🤝 <strong>تم اختيار الشريك بنجاح !</strong><br>
      تم ربطك مع زميلك: <strong>${escapeHtml(prenom2)} ${escapeHtml(nom2)}</strong>.<br>
      بمجرد أن يدخل زميلك للموقع ويسجل معدله، سيتم احتساب معدل الفريق وترتيبكما المشترك تلقائياً.<br>
      <em>(ملاحظة: معدلك محفوظ بسرية تامة).</em>
    `);

    resetFormAfterSuccess();

  } catch (err) {
    showAlert(formAlert, 'alert-error', 'تعذر الاتصال بالخادم.');
  } finally {
    setButtonLoading(btnSubmit, false);
    pendingStudentData = null;
  }
}

// Complete Partner Registration (Student 2)
async function completePartnerRegistration(groupId, moyenne) {
  setButtonLoading(btnSubmit, true);

  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete_binome',
        groupId,
        moyenne
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showAlert(formAlert, 'alert-error', data.message || 'حدث خطأ أثناء تسجيل المعدل.');
      return;
    }

    showAlert(formAlert, 'alert-success', `
      🎉 <strong>مبروك ! تم إكمال الشراكة بنجاح !</strong><br>
      ${escapeHtml(data.message)}<br>
      رتبة الفريق المشتركة حالياً هي: <strong>المرتبة ${data.group.rank}</strong>.<br>
      <em>(ملاحظة: المعدلات الفردية ومعدل الفريق محفوظة بسرية تامة ولا تظهر للطلبة).</em>
    `);

    resetFormAfterSuccess();

  } catch (err) {
    showAlert(formAlert, 'alert-error', 'تعذر الاتصال بالخادم.');
  } finally {
    setButtonLoading(btnSubmit, false);
  }
}

function resetFormAfterSuccess() {
  studentForm.reset();
  rosterSelect.value = '';
  resetInvitedPartnerState();
  fetchRanking();
  fetchRoster();
}

function closePartnerModal() {
  partnerChoiceModal.style.display = 'none';
}

// ===================================================
// SEARCH
// ===================================================
function handleSearch() {
  const query = searchInput.value;
  renderRankingTable(filterGroups(query));
}

function clearSearch() {
  searchInput.value = '';
  btnClearSearch.style.display = 'none';
  renderRankingTable(allGroups);
}

// ===================================================
// ADMIN
// ===================================================
async function handleAdminLogin(e) {
  e.preventDefault();
  const password = adminPasswordInput.value.trim();
  adminLoginError.textContent = '';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();
    if (!res.ok) {
      adminLoginError.textContent = data.message || 'كلمة المرور غير صحيحة.';
      return;
    }

    adminToken = data.token;
    sessionStorage.setItem('pfe_admin_token', adminToken);
    adminLoginModal.style.display = 'none';

    showToast('تم تسجيل دخول المشرف بنجاح');
    openAdminDashboard();

  } catch (err) {
    adminLoginError.textContent = 'خطأ في الاتصال بالخادم.';
  }
}

async function openAdminDashboard() {
  adminDashboardModal.style.display = 'flex';
  hideAlert(adminAlert);
  await fetchAdminStudents();
}

async function fetchAdminStudents() {
  try {
    const res = await fetch('/api/admin/students', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    if (res.status === 403) {
      handleAdminLogout();
      return;
    }

    const data = await res.json();
    const groups = data.students || [];

    if (groups.length === 0) {
      adminTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">لا يوجد أي تسجيل حالياً.</td></tr>`;
      return;
    }

    adminTableBody.innerHTML = groups.map(g => {
      const exAequo = g.isExAequo ? ' (Ex æquo)' : '';
      const typeBadge = g.type === 'binome' ? '👥 Binôme' : '👤 Monôme';
      const st1 = `${escapeHtml(g.nom1.toUpperCase())} ${escapeHtml(g.prenom1)} (${Number(g.moyenne1).toFixed(2)})`;
      
      let st2 = '-';
      if (g.type === 'binome' && g.nom2) {
        if (g.moyenne2 !== null) {
          st2 = `${escapeHtml(g.nom2.toUpperCase())} ${escapeHtml(g.prenom2)} (${Number(g.moyenne2).toFixed(2)})`;
        } else {
          st2 = `${escapeHtml(g.nom2.toUpperCase())} ${escapeHtml(g.prenom2)} <span style="color:#d97706; font-size:0.75rem;">(⏳ لم يسجل بعد)</span>`;
        }
      }
      
      const moyenneFinaleText = g.isComplete 
        ? `${Number(g.moyenne_finale).toFixed(2)} / 20` 
        : `${Number(g.moyenne_finale).toFixed(2)} <small style="color:#d97706;">(مؤقت)</small>`;

      return `
        <tr>
          <td><strong>${g.rank}e</strong>${exAequo}</td>
          <td><span class="badge-type ${g.type === 'binome' ? 'badge-type-binome' : 'badge-type-monome'}">${typeBadge}</span></td>
          <td>${st1}</td>
          <td>${st2}</td>
          <td class="col-moyenne">${moyenneFinaleText}</td>
          <td class="col-actions">
            <button class="btn-action-edit" onclick="openEditModal(${g.id})">✏️ تعديل</button>
            <button class="btn-action-delete" onclick="handleDeleteGroup(${g.id})">🗑️ حذف</button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    showAlert(adminAlert, 'alert-error', 'خطأ أثناء تحميل بيانات الإدارة.');
  }
}

function handleAdminLogout() {
  adminToken = null;
  sessionStorage.removeItem('pfe_admin_token');
  adminDashboardModal.style.display = 'none';
  showToast('تم تسجيل الخروج بنجاح');
}

async function handleClearAll() {
  if (!confirm('⚠️ تحذير: هل أنت متأكد من رغبتك في تفريغ وحذف جميع بيانات الطلبة من القائمة؟ لا يمكن التراجع عن هذا الإجراء.')) return;

  try {
    const res = await fetch('/api/admin/clear', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (!res.ok) {
      showAlert(adminAlert, 'alert-error', data.message || 'حدث خطأ أثناء تفريغ القائمة.');
      return;
    }
    showToast('تم تفريغ القائمة بالكامل');
    await fetchAdminStudents();
    await Promise.all([fetchRanking(), fetchRoster()]);
  } catch (err) {
    showAlert(adminAlert, 'alert-error', 'خطأ في الاتصال أثناء تفريغ القائمة.');
  }
}

async function handleDeleteGroup(id) {
  if (!confirm(`هل أنت متأكد من حذف هذا التسجيل ؟`)) return;

  try {
    const res = await fetch(`/api/admin/students/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();

    if (!res.ok) {
      showAlert(adminAlert, 'alert-error', data.message || 'خطأ أثناء الحذف.');
      return;
    }

    showToast(`تم الحذف بنجاح`);
    await fetchAdminStudents();
    await Promise.all([fetchRanking(), fetchRoster()]);
  } catch (err) {
    showAlert(adminAlert, 'alert-error', 'خطأ في الاتصال أثناء الحذف.');
  }
}

async function openEditModal(id) {
  try {
    const res = await fetch('/api/admin/students', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const groupData = data.students.find(item => item.id === id);
    if (!groupData) return;

    editGroupId.value = groupData.id;
    editType.value = groupData.type;
    editBinomeFields.style.display = groupData.type === 'binome' ? 'block' : 'none';

    editNom1.value = groupData.nom1;
    editPrenom1.value = groupData.prenom1;
    editMoyenne1.value = groupData.moyenne1;

    editNom2.value = groupData.nom2 || '';
    editPrenom2.value = groupData.prenom2 || '';
    editMoyenne2.value = groupData.moyenne2 !== null ? groupData.moyenne2 : '';

    adminEditModal.style.display = 'flex';
  } catch (err) {
    alert('تعذر تحميل بيانات التعديل');
  }
}

async function handleEditSubmit(e) {
  e.preventDefault();
  const id = editGroupId.value;
  const type = editType.value;
  const nom1 = editNom1.value.trim();
  const prenom1 = editPrenom1.value.trim();
  const moyenne1 = parseFloat(editMoyenne1.value);

  const payload = { type, nom1, prenom1, moyenne1 };

  if (type === 'binome') {
    payload.nom2 = editNom2.value.trim();
    payload.prenom2 = editPrenom2.value.trim();
    payload.moyenne2 = editMoyenne2.value ? parseFloat(editMoyenne2.value) : null;
  }

  try {
    const res = await fetch(`/api/admin/students/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'خطأ أثناء التعديل.');
      return;
    }

    adminEditModal.style.display = 'none';
    showToast('تم حفظ التعديلات بنجاح');
    await fetchAdminStudents();
    await Promise.all([fetchRanking(), fetchRoster()]);
  } catch (err) {
    alert('خطأ في الاتصال أثناء التعديل.');
  }
}

function handleExportCSV() {
  if (!adminToken) return;
  fetch('/api/admin/export', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  })
  .then(res => res.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `classement_pfe_automatique_esg2e_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast('تم تحميل ملف الترتيب بصيغة Excel/CSV');
  })
  .catch(() => {
    showAlert(adminAlert, 'alert-error', 'خطأ أثناء تصدير الملف.');
  });
}

// ===================================================
// HELPERS
// ===================================================
function showFieldError(elId, msg) {
  const el = document.getElementById(elId);
  if (el) el.textContent = msg;
}

function clearFormErrors() {
  ['nomError', 'prenomError', 'moyenneError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function showAlert(el, className, html) {
  el.className = `alert ${className}`;
  el.innerHTML = html;
  el.style.display = 'block';
}

function hideAlert(el) {
  el.style.display = 'none';
  el.innerHTML = '';
}

function setButtonLoading(btn, isLoading) {
  const text = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = isLoading;
  if (isLoading) {
    if (text) text.textContent = 'جاري التسجيل...';
    if (spinner) spinner.style.display = 'inline';
  } else {
    if (text) text.textContent = currentInvitedGroupId ? 'تأكيد معدلي وإكمال الشراكة 🚀' : 'تسجيل واحتساب الترتيب 🚀';
    if (spinner) spinner.style.display = 'none';
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.clearSearch = clearSearch;
window.openEditModal = openEditModal;
window.handleDeleteGroup = handleDeleteGroup;
