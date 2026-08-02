'use strict';

/* ============ Storage Keys ============ */
const K_SETTINGS = 'mreg_settings_v1';
const K_STUDENTS = 'mreg_students_v1';
const K_ATTENDANCE = 'mreg_attendance_v1';

/* ============ State ============ */
let settings = loadJSON(K_SETTINGS, { madrissaName: 'Madrissa Attendance Register', incharge: '', address: '' });
let students = loadJSON(K_STUDENTS, []); // [{id, roll, name}]
let attendance = loadJSON(K_ATTENDANCE, {}); // { 'YYYY-MM-DD': { studentId: { Fajr:'P'|'A'|'L', Zuhr:..., Asr:..., Maghrib:..., Isha:... } } }

const PRAYERS = ['Fajr', 'Zuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_ICON = { Fajr: '\u{1F305}', Zuhr: '\u2600\uFE0F', Asr: '\u{1F324}\uFE0F', Maghrib: '\u{1F307}', Isha: '\u{1F319}' };

function defaultPrayerByTime() {
  const h = new Date().getHours();
  if (h < 7) return 'Fajr';
  if (h < 15) return 'Zuhr';
  if (h < 17) return 'Asr';
  if (h < 19) return 'Maghrib';
  return 'Isha';
}

/** One-time migration: old records stored a plain 'P'/'A'/'L' string per student per day.
 *  Convert those into the new per-prayer object shape so historical data isn't lost. */
function migrateAttendanceData() {
  let changed = false;
  Object.keys(attendance).forEach(date => {
    const dayRec = attendance[date];
    Object.keys(dayRec).forEach(studentId => {
      const val = dayRec[studentId];
      if (typeof val === 'string') {
        const obj = {};
        PRAYERS.forEach(p => { obj[p] = val; });
        dayRec[studentId] = obj;
        changed = true;
      }
    });
  });
  if (changed) saveAttendance();
}

let currentAttDate = todayStr();
let currentPrayer = defaultPrayerByTime();
let currentReportMonth = todayStr().slice(0, 7); // YYYY-MM
let editingStudentId = null;
let confirmCallback = null;

/* ============ Helpers ============ */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { showToast('Storage error: ' + e.message); }
}
function saveSettings() { saveJSON(K_SETTINGS, settings); }
function saveStudents() { saveJSON(K_STUDENTS, students); }
function saveAttendance() { saveJSON(K_ATTENDANCE, attendance); }

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function uid() { return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2400);
}
function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ============ Navigation ============ */
const views = ['dashboard', 'attendance', 'students', 'reports', 'settings'];
function goto(view) {
  views.forEach(v => {
    document.getElementById('view-' + v).classList.toggle('active', v === view);
  });
  document.querySelectorAll('.drawer-link[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.querySelectorAll('.bn-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  closeDrawer();
  if (view === 'dashboard') renderDashboard();
  if (view === 'attendance') renderAttendance();
  if (view === 'students') renderStudents();
  if (view === 'reports') renderReport();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => goto(el.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => goto(el.dataset.goto)));

function openDrawer() { document.getElementById('drawer').classList.add('open'); document.getElementById('drawerOverlay').classList.add('open'); }
function closeDrawer() { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawerOverlay').classList.remove('open'); }
document.getElementById('menuBtn').addEventListener('click', openDrawer);
document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

/* ============ Header / Branding ============ */
function renderBranding() {
  document.getElementById('madrissaNameDisplay').textContent = settings.madrissaName || 'Madrissa Attendance Register';
  document.getElementById('inchargeDisplay').textContent = 'Incharge: ' + (settings.incharge || '--');
}

/* ============ Dashboard ============ */
function renderDashboard() {
  document.getElementById('statTotalStudents').textContent = students.length;
  const todayRec = attendance[todayStr()] || {};

  // aggregate across all 5 prayers for today
  let marked = 0, present = 0, absent = 0;
  students.forEach(s => {
    const rec = todayRec[s.id] || {};
    PRAYERS.forEach(p => {
      if (rec[p]) marked++;
      if (rec[p] === 'P') present++;
      if (rec[p] === 'A') absent++;
    });
  });
  document.getElementById('statTodayMarked').textContent = marked;
  document.getElementById('statPresentToday').textContent = present;
  document.getElementById('statAbsentToday').textContent = absent;
  document.getElementById('todayDateLabel').textContent = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  const list = document.getElementById('dashTodayList');
  if (students.length === 0) {
    list.innerHTML = '<p class="hint-text">No students added yet.</p>';
    return;
  }
  list.innerHTML = students.slice(0, 8).map(s => {
    const rec = todayRec[s.id] || {};
    const dots = PRAYERS.map(p => {
      const st = rec[p];
      const cls = st ? 'dot-' + st : 'dot-none';
      return `<span class="prayer-dot ${cls}" title="${p}${st ? ': ' + (st === 'P' ? 'Present' : st === 'A' ? 'Absent' : 'Leave') : ': not marked'}">${p[0]}</span>`;
    }).join('');
    return `<div class="today-row"><span>${escapeHtml(s.roll)} &middot; ${escapeHtml(s.name)}</span><span class="prayer-dots">${dots}</span></div>`;
  }).join('') + (students.length > 8 ? `<p class="hint-text">+ ${students.length - 8} more students</p>` : '');
}

/* ============ Students CRUD ============ */
function renderStudents() {
  const q = document.getElementById('studentSearch').value.trim().toLowerCase();
  const list = document.getElementById('studentsList');
  const empty = document.getElementById('studentsEmpty');
  const filtered = students
    .filter(s => !q || s.name.toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q))
    .sort((a, b) => (a.roll + '').localeCompare(b.roll + '', undefined, { numeric: true }));

  if (students.length === 0) {
    list.innerHTML = ''; empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');
  if (filtered.length === 0) {
    list.innerHTML = '<p class="hint-text">No matching students.</p>';
    return;
  }
  list.innerHTML = filtered.map(s => `
    <div class="student-row">
      <div class="student-row-info">
        <div class="student-avatar">${escapeHtml(initials(s.name))}</div>
        <div>
          <div class="student-row-name">${escapeHtml(s.name)}</div>
          <div class="student-row-roll">Roll No: ${escapeHtml(s.roll)}</div>
        </div>
      </div>
      <div class="student-actions">
        <button data-edit="${s.id}" title="Edit">&#9998;</button>
        <button data-del="${s.id}" title="Delete">&#128465;</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openStudentModal(b.dataset.edit)));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const s = students.find(x => x.id === b.dataset.del);
    confirmAction(`Delete student "${s.name}"? Their attendance history will also be removed.`, () => {
      students = students.filter(x => x.id !== s.id);
      Object.keys(attendance).forEach(date => { delete attendance[date][s.id]; });
      saveStudents(); saveAttendance();
      renderStudents(); showToast('Student deleted');
    });
  }));
}
document.getElementById('studentSearch').addEventListener('input', renderStudents);
document.getElementById('addStudentBtn').addEventListener('click', () => openStudentModal(null));

function openStudentModal(id) {
  editingStudentId = id;
  const overlay = document.getElementById('studentModalOverlay');
  const title = document.getElementById('studentModalTitle');
  const rollEl = document.getElementById('modalRollNo');
  const nameEl = document.getElementById('modalStudentName');
  if (id) {
    const s = students.find(x => x.id === id);
    title.textContent = 'Edit Student';
    rollEl.value = s.roll; nameEl.value = s.name;
  } else {
    title.textContent = 'Add Student';
    rollEl.value = suggestNextRoll(); nameEl.value = '';
  }
  overlay.classList.add('open');
  setTimeout(() => nameEl.focus(), 100);
}
function suggestNextRoll() {
  const nums = students.map(s => parseInt(s.roll, 10)).filter(n => !isNaN(n));
  return nums.length ? String(Math.max(...nums) + 1) : '1';
}
function closeStudentModal() { document.getElementById('studentModalOverlay').classList.remove('open'); editingStudentId = null; }
document.getElementById('closeStudentModal').addEventListener('click', closeStudentModal);
document.getElementById('cancelStudentModal').addEventListener('click', closeStudentModal);
document.getElementById('studentModalOverlay').addEventListener('click', e => { if (e.target.id === 'studentModalOverlay') closeStudentModal(); });

document.getElementById('saveStudentModal').addEventListener('click', () => {
  const roll = document.getElementById('modalRollNo').value.trim();
  const name = document.getElementById('modalStudentName').value.trim();
  if (!name) { showToast('Please enter student name'); return; }
  if (!roll) { showToast('Please enter roll number'); return; }
  if (editingStudentId) {
    const s = students.find(x => x.id === editingStudentId);
    s.roll = roll; s.name = name;
    showToast('Student updated');
  } else {
    students.push({ id: uid(), roll, name });
    showToast('Student added');
  }
  saveStudents();
  closeStudentModal();
  renderStudents();
  renderDashboard();
});

/* ============ Confirm Dialog ============ */
function confirmAction(msg, cb) {
  document.getElementById('confirmMessage').textContent = msg;
  confirmCallback = cb;
  document.getElementById('confirmOverlay').classList.add('open');
}
document.getElementById('confirmCancel').addEventListener('click', () => { document.getElementById('confirmOverlay').classList.remove('open'); confirmCallback = null; });
document.getElementById('confirmOk').addEventListener('click', () => {
  document.getElementById('confirmOverlay').classList.remove('open');
  if (confirmCallback) confirmCallback();
  confirmCallback = null;
});

/* ============ Daily Attendance ============ */
function renderPrayerChips() {
  const wrap = document.getElementById('prayerChipsRow');
  wrap.innerHTML = PRAYERS.map(p => `
    <button class="prayer-chip prayer-${p} ${p === currentPrayer ? 'active' : ''}" data-prayer="${p}">
      <span>${PRAYER_ICON[p]}</span>${p}
    </button>`).join('');
  wrap.querySelectorAll('[data-prayer]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPrayer = btn.dataset.prayer;
      renderPrayerChips();
      renderAttendance();
    });
  });
}

function renderAttendance() {
  document.getElementById('attendanceDate').value = currentAttDate;
  const q = document.getElementById('attSearch').value.trim().toLowerCase();
  const list = document.getElementById('attendanceList');
  const empty = document.getElementById('attEmptyState');
  const dayRec = attendance[currentAttDate] || {};

  if (students.length === 0) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  const filtered = students
    .filter(s => !q || s.name.toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q))
    .sort((a, b) => (a.roll + '').localeCompare(b.roll + '', undefined, { numeric: true }));

  list.innerHTML = filtered.map(s => {
    const rec = dayRec[s.id] || {};
    const st = rec[currentPrayer];
    return `
    <div class="att-row" data-id="${s.id}">
      <div class="att-row-info">
        <div class="att-row-name">${escapeHtml(s.name)}</div>
        <div class="att-row-roll">Roll No: ${escapeHtml(s.roll)}</div>
      </div>
      <div class="att-buttons">
        <button class="att-btn p ${st === 'P' ? 'active' : ''}" data-status="P" title="Present">P</button>
        <button class="att-btn a ${st === 'A' ? 'active' : ''}" data-status="A" title="Absent">A</button>
        <button class="att-btn l ${st === 'L' ? 'active' : ''}" data-status="L" title="Leave">L</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.att-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelectorAll('.att-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const status = btn.dataset.status;
        if (!attendance[currentAttDate]) attendance[currentAttDate] = {};
        if (!attendance[currentAttDate][id]) attendance[currentAttDate][id] = {};
        const cur = attendance[currentAttDate][id][currentPrayer];
        if (cur === status) {
          delete attendance[currentAttDate][id][currentPrayer]; // toggle off
        } else {
          attendance[currentAttDate][id][currentPrayer] = status;
        }
        saveAttendance();
        renderAttendance();
      });
    });
  });
}
document.getElementById('attSearch').addEventListener('input', renderAttendance);
document.getElementById('attendanceDate').addEventListener('change', e => { currentAttDate = e.target.value || todayStr(); renderAttendance(); });
document.getElementById('dateBack').addEventListener('click', () => shiftDate(-1));
document.getElementById('dateFwd').addEventListener('click', () => shiftDate(1));
document.getElementById('dateToday').addEventListener('click', () => { currentAttDate = todayStr(); renderAttendance(); });
function shiftDate(delta) {
  const d = new Date(currentAttDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  currentAttDate = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  renderAttendance();
}
document.querySelectorAll('[data-markall]').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.markall;
    if (students.length === 0) return;
    if (!attendance[currentAttDate]) attendance[currentAttDate] = {};
    if (mode === 'clear') {
      students.forEach(s => {
        if (attendance[currentAttDate][s.id]) delete attendance[currentAttDate][s.id][currentPrayer];
      });
    } else {
      students.forEach(s => {
        if (!attendance[currentAttDate][s.id]) attendance[currentAttDate][s.id] = {};
        attendance[currentAttDate][s.id][currentPrayer] = mode;
      });
    }
    saveAttendance();
    renderAttendance();
    showToast(mode === 'clear' ? `Cleared ${currentPrayer} attendance for the day` : `Marked all students for ${currentPrayer}`);
  });
});

/* ============ Monthly Reports ============ */
function computeMonthlyStats(ym, prayerFilter) {
  const dim = daysInMonth(ym);
  const filterPrayers = prayerFilter && prayerFilter !== 'ALL' ? [prayerFilter] : PRAYERS;
  return students.map(s => {
    let P = 0, A = 0, L = 0;
    for (let d = 1; d <= dim; d++) {
      const date = ym + '-' + pad(d);
      const rec = attendance[date] && attendance[date][s.id];
      if (!rec) continue;
      filterPrayers.forEach(p => {
        const st = rec[p];
        if (st === 'P') P++; else if (st === 'A') A++; else if (st === 'L') L++;
      });
    }
    const total = P + A + L;
    const pct = total ? Math.round((P / total) * 1000) / 10 : 0;
    return { ...s, P, A, L, total, pct };
  }).sort((a, b) => (a.roll + '').localeCompare(b.roll + '', undefined, { numeric: true }));
}

function renderReport() {
  document.getElementById('reportMonth').value = currentReportMonth;
  const q = document.getElementById('reportSearch').value.trim().toLowerCase();
  const prayerFilter = document.getElementById('reportPrayerFilter').value;
  const stats = computeMonthlyStats(currentReportMonth, prayerFilter).filter(s => !q || s.name.toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q));
  const tbody = document.getElementById('reportTbody');
  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:20px;">No students added yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = stats.map(s => {
    const pctClass = s.pct >= 75 ? 'pct-good' : s.pct >= 50 ? 'pct-mid' : 'pct-bad';
    return `<tr>
      <td>${escapeHtml(s.roll)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${s.P}</td>
      <td>${s.A}</td>
      <td>${s.L}</td>
      <td>${s.total}</td>
      <td class="${pctClass}">${s.pct}%</td>
    </tr>`;
  }).join('');
}
document.getElementById('reportSearch').addEventListener('input', renderReport);
document.getElementById('reportPrayerFilter').addEventListener('change', renderReport);
document.getElementById('reportMonth').addEventListener('change', e => { currentReportMonth = e.target.value || currentReportMonth; renderReport(); });
document.getElementById('monthBack').addEventListener('click', () => shiftMonth(-1));
document.getElementById('monthFwd').addEventListener('click', () => shiftMonth(1));
function shiftMonth(delta) {
  const [y, m] = currentReportMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  currentReportMonth = d.getFullYear() + '-' + pad(d.getMonth() + 1);
  renderReport();
}

function buildCsv() {
  const prayerFilter = document.getElementById('reportPrayerFilter').value;
  const label = prayerFilter === 'ALL' ? 'All Prayers (Combined)' : prayerFilter;
  const stats = computeMonthlyStats(currentReportMonth, prayerFilter);
  const rows = [
    [settings.madrissaName || 'Madrissa'],
    ['Incharge: ' + (settings.incharge || '--')],
    ['Monthly Attendance Report - ' + monthLabel(currentReportMonth)],
    ['Prayer: ' + label],
    [],
    ['Roll No', 'Name', 'Present', 'Absent', 'Leave', 'Total Marked', 'Percentage'],
    ...stats.map(s => [s.roll, s.name, s.P, s.A, s.L, s.total, s.pct + '%']),
    [],
    ['Generated by M Ijaz - GHS 124/NB'],
  ];
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

document.getElementById('reportDownloadCsv').addEventListener('click', () => {
  const csv = buildCsv();
  downloadBlob(csv, `attendance-report-${currentReportMonth}.csv`, 'text/csv');
  showToast('CSV downloaded');
});

document.getElementById('reportDownloadPdf').addEventListener('click', () => {
  goto('reports');
  setTimeout(() => window.print(), 150);
});

document.getElementById('reportShare').addEventListener('click', async () => {
  const text = buildShareText();
  await shareContent('Monthly Attendance Report', text, buildCsv(), `attendance-report-${currentReportMonth}.csv`, 'text/csv');
});
document.getElementById('qaShare').addEventListener('click', async () => {
  const text = buildShareText();
  await shareContent('Attendance Report', text, buildCsv(), `attendance-report-${currentReportMonth}.csv`, 'text/csv'
