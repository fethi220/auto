// State
let allStudents = [];
let officialRoster = [];
let adminToken = sessionStorage.getItem('pfe_admin_token') || null;
let pollTimer = null;
let lastHighlightId = null;

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
const btnAdminLogout = document.getElementById('btnAdminLogout');

// Edit Modal Elements
const adminEditModal = document.getElementById('adminEditModal');
const adminEditForm = document.getElementById('adminEditForm');
const btnCloseEditModal = document.getElementById('btnCloseEditModal');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const editStudentId = document.getElementById('editStudentId');
const editNom = document.getElementById('editNom');
const editPrenom = document.getElementById('editPrenom');
const editMoyenne = document.getElementById('editMoyenne');

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
  // Form submission
  studentForm.addEventListener('submit', handleStudentSubmit);

  // Roster select quick fill
  rosterSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      const [nom, prenom] = val.split('|');
      nomInput.value = nom || '';
      prenomInput.value = prenom || '';
      moyenneInput.focus();
    }
  });

  // Search
  searchInput.addEventListener('input', handleSearch);
  btnClearSearch.addEventListener('click', clearSearch);

  // Manual refresh
  btnRefresh.addEventListener('click', () => {
    btnRefresh.textContent = '⏳ ...';
    Promise.all([fetchRanking(), fetchRoster()]).finally(() => {
      setTimeout(() => { btnRefresh.textContent = '🔄 تحديث'; }, 600);
    });
  });

  // Admin Login Triggers
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
  
  const btnClearAll = document.getElementById('btnClearAll');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', handleClearAll);
  }

  // Edit Modal Actions
  btnCloseEditModal.addEventListener('click', () => adminEditModal.style.display = 'none');
  btnCancelEdit.addEventListener('click', () => adminEditModal.style.display = 'none');
  adminEditForm.addEventListener('submit', handleEditSubmit);

  // Backdrop click close
  [adminLoginModal, adminDashboardModal, adminEditModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });
}

// ===================================================
// ROSTER FETCHING
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
  let html = `<option value="">-- اضغط لاختيار اسمك مباشرة من قائمة الدفعة --</option>`;

  officialRoster.forEach(s => {
    const statusText = s.isRegistered ? ' (✅ تم التسجيل)' : '';
    const key = `${s.nom}|${s.prenom}`;
    html += `<option value="${escapeHtml(key)}" ${s.isRegistered ? 'style="color:#64748b;"' : ''}>${escapeHtml(s.nom.toUpperCase())} ${escapeHtml(s.prenom)}${statusText}</option>`;
  });

  rosterSelect.innerHTML = html;
  if (currentVal) rosterSelect.value = currentVal;
}

// ===================================================
// PUBLIC RANKING & DISPLAY
// ===================================================
async function fetchRanking(isBackground = false) {
  try {
    const res = await fetch('/api/students');
    if (!res.ok) throw new Error('فشل في تحميل الترتيب');
    const data = await res.json();
    
    allStudents = data.students || [];
    const totalRegistered = data.total || 0;
    const totalOfficial = data.totalOfficial || 30;

    studentCountBadge.textContent = `${totalRegistered} / ${totalOfficial} طالباً مسجلاً`;
    
    renderRankingTable(filterStudents(searchInput.value));
  } catch (error) {
    if (!isBackground) {
      rankingTableBody.innerHTML = `
        <tr>
          <td colspan="2" class="empty-state" style="color: var(--danger);">
            ⚠️ تعذر الاتصال بالخادم لتحميل الترتيب. يرجى إعادة المحاولة.
          </td>
        </tr>`;
    }
  }
}

function filterStudents(query) {
  if (!query || !query.trim()) return allStudents;
  const q = normalizeString(query);
  return allStudents.filter(s => {
    const fullName = normalizeString(`${s.prenom} ${s.nom} ${s.nom} ${s.prenom}`);
    return fullName.includes(q);
  });
}

function normalizeString(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function renderRankingTable(students) {
  const query = searchInput.value.trim();

  // Search info indicator
  if (query) {
    searchResultsInfo.style.display = 'flex';
    searchResultsInfo.innerHTML = `
      <span>نتائج البحث عن "<strong>${escapeHtml(query)}</strong>" : <strong>${students.length}</strong> طالب</span>
      <button class="btn btn-sm btn-secondary" onclick="clearSearch()">إلغاء البحث</button>
    `;
    btnClearSearch.style.display = 'block';
  } else {
    searchResultsInfo.style.display = 'none';
    btnClearSearch.style.display = 'none';
  }

  if (students.length === 0) {
    if (query) {
      rankingTableBody.innerHTML = `
        <tr>
          <td colspan="2" class="empty-state">
            🔍 لم يتم العثور على أي طالب باسم "<strong>${escapeHtml(query)}</strong>".
          </td>
        </tr>`;
    } else {
      rankingTableBody.innerHTML = `
        <tr>
          <td colspan="2" class="empty-state">
            🌱 لم يتم تسجيل أي طالب حتى الآن. كن أول من يضيف معلوماته !
          </td>
        </tr>`;
    }
    return;
  }

  rankingTableBody.innerHTML = students.map(s => {
    const isHighlighted = lastHighlightId === s.id;
    const rankBadgeHtml = formatRankBadge(s.rank);
    const initials = `${s.prenom.charAt(0)}${s.nom.charAt(0)}`.toUpperCase();
    const exAequoBadge = s.isExAequo ? '<span class="badge-ex-aequo" title="تساوي في المعدل">Ex æquo</span>' : '';

    return `
      <tr class="${isHighlighted ? 'highlight-row' : ''}" data-student-id="${s.id}">
        <td class="col-rank">
          ${rankBadgeHtml}
        </td>
        <td class="col-student">
          <div class="student-cell">
            <div class="student-avatar">${initials}</div>
            <div>
              <span class="student-name">${escapeHtml(s.nom.toUpperCase())} ${escapeHtml(s.prenom)}</span>
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
// ADD STUDENT FORM
// ===================================================
async function handleStudentSubmit(e) {
  e.preventDefault();
  clearFormErrors();
  hideAlert(formAlert);

  const nom = nomInput.value.trim();
  const prenom = prenomInput.value.trim();
  const moyenneVal = moyenneInput.value.trim();

  // Validation
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
    showFieldError('moyenneError', 'المعدل يجب أن يكون رقماً صحيحاً أو عشرياً بين 0.00 و 20.00.');
    hasError = true;
  }

  if (hasError) return;

  setButtonLoading(btnSubmit, true);

  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, prenom, moyenne })
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(formAlert, 'alert-error', data.message || 'حدث خطأ أثناء التسجيل.');
      return;
    }

    // Success confirmation
    showAlert(formAlert, 'alert-success', `
      🎉 <strong>مرحباً بك ${escapeHtml(prenom)} !</strong><br>
      تم تسجيل معلوماتك بنجاح. رتبتك الحالية في المجموعة هي: <strong>المرتبة ${data.student.rank}</strong> من أصل ${data.student.total} طالباً مسجلاً.<br>
      <em>(ملاحظة: معدلك محفوظ بسرية تامة ولن يظهر لزملائك).</em>
    `);

    // Reset inputs
    studentForm.reset();
    rosterSelect.value = '';

    // Refresh ranking and roster
    await Promise.all([fetchRanking(), fetchRoster()]);

    // Auto-scroll to newly registered student
    const targetStudent = allStudents.find(s => 
      normalizeString(s.nom) === normalizeString(nom) && 
      normalizeString(s.prenom) === normalizeString(prenom)
    );

    if (targetStudent) {
      lastHighlightId = targetStudent.id;
      renderRankingTable(filterStudents(searchInput.value));
      const targetEl = document.querySelector(`[data-student-id="${targetStudent.id}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => {
        lastHighlightId = null;
        renderRankingTable(filterStudents(searchInput.value));
      }, 5000);
    }

  } catch (error) {
    showAlert(formAlert, 'alert-error', 'تعذر الاتصال بالخادم. يرجى التأكد من تشغيل الخادم والاتصال.');
  } finally {
    setButtonLoading(btnSubmit, false);
  }
}

// ===================================================
// SEARCH
// ===================================================
function handleSearch() {
  const query = searchInput.value;
  renderRankingTable(filterStudents(query));
}

function clearSearch() {
  searchInput.value = '';
  btnClearSearch.style.display = 'none';
  renderRankingTable(allStudents);
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
    const students = data.students || [];

    if (students.length === 0) {
      adminTableBody.innerHTML = `<tr><td colspan="5" class="empty-state">لا يوجد أي طالب مسجل حالياً.</td></tr>`;
      return;
    }

    adminTableBody.innerHTML = students.map(s => {
      const exAequo = s.isExAequo ? ' (Ex æquo)' : '';
      return `
        <tr>
          <td><strong>${s.rank}e</strong>${exAequo}</td>
          <td>${escapeHtml(s.nom.toUpperCase())}</td>
          <td>${escapeHtml(s.prenom)}</td>
          <td class="col-moyenne">${Number(s.moyenne).toFixed(2)} / 20</td>
          <td class="col-actions">
            <button class="btn-action-edit" onclick="openEditModal(${s.id}, '${escapeHtml(s.nom)}', '${escapeHtml(s.prenom)}', ${s.moyenne})">✏️ تعديل</button>
            <button class="btn-action-delete" onclick="handleDeleteStudent(${s.id}, '${escapeHtml(s.prenom)} ${escapeHtml(s.nom)}')">🗑️ حذف</button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    showAlert(adminAlert, 'alert-error', 'خطأ أثناء تحميل بيانات الإدارة.');
  }
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

function handleAdminLogout() {
  adminToken = null;
  sessionStorage.removeItem('pfe_admin_token');
  adminDashboardModal.style.display = 'none';
  showToast('تم تسجيل الخروج بنجاح');
}

async function handleDeleteStudent(id, name) {
  if (!confirm(`هل أنت متأكد من حذف الطالب "${name}" ؟`)) return;

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

    showToast(`تم حذف الطالب "${name}"`);
    await fetchAdminStudents();
    await Promise.all([fetchRanking(), fetchRoster()]);
  } catch (err) {
    showAlert(adminAlert, 'alert-error', 'خطأ في الاتصال أثناء الحذف.');
  }
}

function openEditModal(id, nom, prenom, moyenne) {
  editStudentId.value = id;
  editNom.value = nom;
  editPrenom.value = prenom;
  editMoyenne.value = moyenne;
  adminEditModal.style.display = 'flex';
}

async function handleEditSubmit(e) {
  e.preventDefault();
  const id = editStudentId.value;
  const nom = editNom.value.trim();
  const prenom = editPrenom.value.trim();
  const moyenne = parseFloat(editMoyenne.value);

  if (!nom || !prenom || isNaN(moyenne) || moyenne < 0 || moyenne > 20) {
    alert('يرجى التحقق من الحقول (اللقب، الاسم والمعدل بين 0 و 20).');
    return;
  }

  try {
    const res = await fetch(`/api/admin/students/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ nom, prenom, moyenne })
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
    if (text) text.textContent = 'تسجيل واحتساب ترتيبي 🚀';
    if (spinner) spinner.style.display = 'none';
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.clearSearch = clearSearch;
window.openEditModal = openEditModal;
window.handleDeleteStudent = handleDeleteStudent;
