'use strict';
const SUPABASE_URL = 'https://jcvqloukmjbkgxcufenz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdnFsb3VrbWpia2d4Y3VmZW56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTk5OTAsImV4cCI6MjA5NDIzNTk5MH0.aix0NiDBOkbPnSdEZugiMLSHglxFPUX8Mw1e8QVEwWs';
const IS_LIVE = !!(SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_URL.startsWith('https://'));
const sb = IS_LIVE ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let TEACHER = null,
  SUBJECTS = [],
  CURR = null;
let CUR_STUDENTS = [],
  CUR_ASSIGNS = [],
  CUR_SUBS = {},
  SEL_ASSIGN = null,
  _subFilter = 'all';
const AVC = ['#00B8B4', '#4c9af5', '#4caf82', '#e8924a', '#e07070', '#b47cef'];
let _srvBlobUrl = null;

/* ════════════════════════════════════════════════
   ✅ HELPER — Per-subject fee (fees jsonb se)
   fees: [{"grade":"9","board":"ICSE","group_fee":13000,"individual_fee":15000}, ...]
════════════════════════════════════════════════ */
function parseFees(fees) {
  if (!fees) return [];
  if (typeof fees === 'string') { try { fees = JSON.parse(fees); } catch { return []; } }
  return Array.isArray(fees) ? fees : [];
}
function _feeMatchOne(val, target) {
  if (val == null || val === '') return true;               // khaali = sabke liye
  const list = String(val).split(',').map(x => x.trim().toLowerCase());
  if (list.includes('all')) return true;                    // "All" = sabke liye
  return list.includes((target || '').toString().trim().toLowerCase());
}
function feeMatches(entry, grade, board) {
  return _feeMatchOne(entry.grade, grade) && _feeMatchOne(entry.board, board);
}
function feeNum(entry, classType) {
  if (!entry) return 0;
  const keys = classType === 'individual'
    ? ['individual_fee', 'individual-fee', 'individualFee', 'fee_individual', 'individual']
    : ['group_fee', 'group-fee', 'groupFee', 'fee_group', 'group'];
  for (const k of keys) { if (entry[k] != null) return Number(entry[k]) || 0; }
  return 0;
}
/* grade+board+classType ke hisaab se fee. grade/board na do to pehli entry. */
function getSubjectFee(subject, classType = 'group', grade = null, board = null) {
  if (!subject) return 0;
  const fees = parseFees(subject.fees);
  if (!fees.length) return 0;
  let entry = null;
  if (grade != null || board != null) entry = fees.find(f => feeMatches(f, grade, board));
  if (!entry) entry = fees[0];
  return feeNum(entry, classType);
}
/* subject kis board/grade ke liye hai — chip text (e.g. "ICSE 9, ISC 12") */
function subjectScopeLabel(subject) {
  const fees = parseFees(subject && subject.fees);
  if (!fees.length) return '—';
  const combos = fees.map(f => ((f.board || 'All') + ' ' + (f.grade || 'All')).trim());
  return [...new Set(combos)].join(', ');
}
/* pehli fee entry ka board (color tag ke liye) */
function subjectFirstBoard(subject) {
  const fees = parseFees(subject && subject.fees);
  return fees.length ? (fees[0].board || '') : '';
}

/* ════════════════════════════════════════════════
   ✅ profiles.subjects parse — student ne kaunse subject liye
   format 1: ["Economics","Math"]
   format 2: [{"name":"Economics","type":"group"}, ...]
════════════════════════════════════════════════ */
function parseProfileSubjects(subs) {
  if (!subs) return [];
  if (typeof subs === 'string') { try { subs = JSON.parse(subs); } catch { subs = subs.split(',').map(x => x.trim()); } }
  if (!Array.isArray(subs)) return [];
  return subs.map(item => {
    if (item && typeof item === 'object') {
      return {
        name: String(item.name || item.subject || '').trim(),
        type: String(item.type || item.class_type || '').trim().toLowerCase()
      };
    }
    return { name: String(item).trim(), type: '' };
  }).filter(x => x.name);
}
/* profile ne ye subject liya hai? haan to uski entry (type ke liye) lautao */
function profileSubjectEntry(profileSubjects, subject) {
  const list = parseProfileSubjects(profileSubjects);
  const sn = (subject.name || '').trim().toLowerCase();
  const sc = (subject.code || '').trim().toLowerCase();
  return list.find(x => {
    const n = x.name.toLowerCase();
    return n === sn || (sc && n === sc);
  }) || null;
}
function normClassType(raw) {
  return /ind|1|one/.test(String(raw || '').toLowerCase()) ? 'individual' : 'group';
}
/* assignment is grade+board ke liye hai? (grade/board khaali = sabke liye) */
function assignmentInScope(a, grade, board) {
  const ag = a.grade, ab = a.board;
  const noScope = (ag == null || ag === '') && (ab == null || ab === '');
  if (noScope) return true;                       // purane assignments = sabke liye
  return _feeMatchOne(ag, grade) && _feeMatchOne(ab, board);
}
/* ✅ Raw score ko max_score ke hisaab se % banata hai, phir average nikalta hai */
function avgPercent(rows, maxMap) {
  const pcts = [];
  (rows || []).forEach(r => {
    const score = Number(r.student_score);
    if (isNaN(score)) return;
    const max = Number(maxMap[(r.name || '').trim()]) || 0;
    pcts.push(max > 0 ? (score / max) * 100 : score); // max na mile to as-is
  });
  return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return d;
  }
}

function ini(n) {
  return (n || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function bc(b) {
  const l = (b || '').toLowerCase();
  if (l === 'ib') return 'ib';
  if (l === 'icse' || l === 'isc') return 'icse';
  return 'cbse';
}
let _tt;

function toast(m, t = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = m;
  el.className = `show ${t}`;
  clearTimeout(_tt);
  _tt = setTimeout(() => el.className = '', 3500);
}

function setTopbars() {
  if (!TEACHER) return;
  const n = TEACHER.full_name || TEACHER.username;
  const r = `Mathematics · ID: ${TEACHER.employee_id || 'TCH-0001'}`;
  const av = ini(n);
  ['d-uname', 'd2-uname'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.textContent = n;
  });
  ['d-urole', 'd2-urole'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.textContent = r;
  });
  ['d-uav', 'd2-uav'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.textContent = av;
  });
}

function _(id) {
  return document.getElementById(id);
}

function setTxt(id, v) {
  const e = _(id);
  if (e) e.innerHTML = String(v);
}

function setW(id, w) {
  const e = _(id);
  if (e) e.style.width = w;
}

/* ── INIT ── */
window.addEventListener('load', async () => {
  const s = sessionStorage.getItem('pp_teacher');
  if (s) {
    try {
      TEACHER = JSON.parse(s);
      await loadDashboard();
    } catch {
      sessionStorage.removeItem('pp_teacher');
      showScreen('s-login');
    }
  } else showScreen('s-login');
});

/* ── AUTH ── */
async function doLogin() {
  const u = _('t-user').value.trim(),
    p = _('t-pass').value;
  const btn = _('login-btn'),
    err = _('login-err');
  err.style.display = 'none';
  if (!u || !p) {
    err.textContent = 'Please enter both username and password.';
    err.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in…';
  try {
    if (!IS_LIVE) {
      toast('⚠ Supabase is not connected. Please use live login.', 'err');
      btn.disabled = false;
      btn.textContent = 'Sign In to Portal →';
      return;
    }
    const {
      data,
      error
    } = await sb.rpc('teacher_login', {
      p_username: u,
      p_password: p
    });
    if (error) throw error;
    if (!data || !data.success) {
      err.textContent = '⚠ ' + (data?.message || 'Invalid username or password');
      err.style.display = 'block';
      return;
    }
    TEACHER = data;
    sessionStorage.setItem('pp_teacher', JSON.stringify(TEACHER));
    await loadDashboard();
  } catch (e) {
    err.textContent = '⚠ ' + (e.message || 'Login failed');
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In to Portal →';
  }
}

function doLogout() {
  sessionStorage.removeItem('pp_teacher');
  TEACHER = null;
  SUBJECTS = [];
  CURR = null;
  showScreen('s-login');
}

/* ════════════════════════════════════════════════
   ✅ FIXED loadDashboard — Saare enrollments lo
   (sirf active nahi, pending bhi)
════════════════════════════════════════════════ */
async function loadDashboard() {
  setTopbars();
  setTxt('dash-name', TEACHER.full_name);
  console.log('TEACHER:', TEACHER);
  showScreen('s-dash');
  if (!IS_LIVE) {
    toast('⚠ Unable to connect to Supabase.', 'err');
    return;
  }
  setTxt('dash-sub', 'Loading your subjects…');

  const {
    data: allSubs,
    error
  } = await sb.from('subjects').select('*');
  if (error) {
    toast('Error: ' + error.message, 'err');
    return;
  }
  const tLower = (TEACHER.full_name || '').toLowerCase().trim();
  const subs = (allSubs || []).filter(s => (s.teacher || '').toLowerCase().trim() === tLower);
  if (!subs || !subs.length) {
    _('curr-grid').innerHTML = '<div style="grid-column:1/-1;padding:48px 32px;text-align:center;color:var(--muted)"><div style="font-size:28px;margin-bottom:14px">📚</div><div style="font-size:16px;font-weight:600;color:var(--cream);margin-bottom:10px">No subjects assigned yet</div></div>';
    _('pay-grid').innerHTML = '<div class="loading-state">No subjects found</div>';
    updateStats([]);
    return;
  }

  const PAID_ST = new Set(['active', 'paid', 'completed', 'success', 'confirmed', 'verified']);

  /* ════════════════════════════════════════════════
     ✅ Har subject ko uske fees ke grade/board combos me
     alag-alag CARD banao. Enrolled students ab
     profiles.subjects (jsonb) se aate hain — student_subjects se nahi.
  ════════════════════════════════════════════════ */

  /* Saare student profiles ek baar laao */
  const { data: allProfiles } = await sb
    .from('profiles')
    .select('id, full_name, username, roll_number, class, board, subjects, preferred_class_type');

  const cards = [];
  for (const s of subs) {
    /* Is subject ko jin students ne profiles.subjects me liya hai */
    const enrolledProfiles = (allProfiles || []).map(p => {
      const entry = profileSubjectEntry(p.subjects, s);
      if (!entry) return null;
      const ct = normClassType(entry.type || p.preferred_class_type || 'group');
      return { ...p, _class_type: ct };
    }).filter(Boolean);

    /* Subject-level data (scores / assignments / payments) */
    const [
      { data: scores },
      { data: pubAssigns },
      { data: payRecs }
    ] = await Promise.all([
      sb.from('assessments').select('student_id, student_score, name').eq('subject_id', s.id),
      sb.from('assignments').select('title, max_score, grade, board').eq('subject_id', s.id).eq('status', 'published'),
      sb.from('payments').select('student_id, amount_inr, status').eq('subject_id', s.id),
    ]);

    const maxMap = {};
    (pubAssigns || []).forEach(a => { maxMap[(a.title || '').trim()] = Number(a.max_score) || 0; });

    /* fees ke combos. fees na ho to ek hi card (saare enrolled students) */
    const fees = parseFees(s.fees);
    const combos = fees.length ? fees : [{ grade: null, board: null, _all: true }];

    combos.forEach(combo => {
      /* is combo (grade+board) ke students */
      const inCombo = combo._all ? enrolledProfiles : enrolledProfiles.filter(p =>
        feeMatches(combo, p.class, p.board)
      );
      const studentIds = new Set(inCombo.map(p => p.id));

      /* Payment band hai → har enrolled student ACTIVE */
      const active = inCombo.length;
      const pending = 0;

      /* verified payments (agar koi ho) */
      const paidRecs = (payRecs || []).filter(p =>
        studentIds.has(p.student_id) && PAID_ST.has((p.status || '').toLowerCase())
      );
      const paid = new Set(paidRecs.map(p => p.student_id)).size;
      const received = paidRecs.reduce((sum, p) => sum + (Number(p.amount_inr) || 0), 0);

      /* Expected — is combo ke students ki fee */
      let expectedTotal = 0;
      inCombo.forEach(p => {
        expectedTotal += getSubjectFee(s, p._class_type, p.class, p.board);
      });

      /* Avg — sirf is combo ke students ke scores */
      const comboScores = (scores || []).filter(r => studentIds.has(r.student_id));
      const avg = avgPercent(comboScores, maxMap) || 0;

      /* Is combo (grade+board) ke published assignments ki ginti */
      const aCount = combo._all
        ? (pubAssigns || []).length
        : (pubAssigns || []).filter(a => assignmentInScope(a, combo.grade, combo.board)).length;

      const scopeLabel = combo._all
        ? subjectScopeLabel(s)
        : ((combo.board || 'All') + ' ' + (combo.grade || 'All')).trim();

      cards.push({
        ...s,
        _cardId: s.id + '||' + (combo.grade || '') + '||' + (combo.board || ''),
        _grade: combo.grade || null,
        _board: combo.board || null,
        _scope: scopeLabel,
        _tot: inCombo.length,
        _active: active,
        _pending: pending,
        _paid: paid,
        _received: received,
        _expected: expectedTotal,
        _avg: avg,
        _asgn: aCount || 0,
        _students: inCombo   /* ✅ is card ke actual student profiles */
      });
    });
  }
  SUBJECTS = cards;
  renderDashboard();
}

function renderDashboard() {
  setTopbars();
  updateStats(SUBJECTS);
  renderPayBreakdown(SUBJECTS);
  renderCurrGrid(SUBJECTS);
}

function updateStats(list) {
  /* ✅ Total students = active + pending */
  const totStu = list.reduce((a, s) => a + (s._active || 0) + (s._pending || 0), 0);
  const totPaid = list.reduce((a, s) => a + (s._paid || 0), 0);
  const totExp = list.reduce((a, s) => a + (s._expected || 0), 0);
  const totRec = list.reduce((a, s) => a + (s._received || 0), 0);
  const totA = (() => {
    const seen = new Set();
    let n = 0;
    list.forEach(s => { if (!seen.has(s.id)) { seen.add(s.id); n += (s._asgn || 0); } });
    return n;
  })();
  const avgs = list.filter(s => s._avg > 0).map(s => s._avg);
  const overAvg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0;
  const paidPct = totExp > 0 ? Math.round(totRec / totExp * 100) : 0;

  setTxt('st-earn', `₹${(totRec / 1000).toFixed(1)}k`);
  setW('st-earn-bar', paidPct + '%');
  setTxt('st-earn-sub', `of <b>₹${(totExp / 1000).toFixed(1)}k</b> expected · ${paidPct}% collected`);

  setTxt('st-avg', overAvg ? overAvg + '%' : '—');
  setW('st-avg-bar', overAvg + '%');
  setTxt('st-avg-sub', `across <b>${list.length} classes</b> · ${totStu} students`);

  setTxt('st-stu', totStu);
  setW('st-stu-bar', totStu > 0 ? Math.min(100, Math.round(totPaid / totStu * 100)) + '%' : '0%');
  setTxt('st-stu-sub', `<b>${totPaid} paid</b> · ${totStu - totPaid} pending fee`);

  setTxt('st-asgn', totA);
  setW('st-asgn-bar', totA > 0 ? Math.min(100, totA * 8) + '%' : '0%');
  setTxt('st-asgn-sub', `published to students`);

  const now = new Date();
  setTxt('pay-month', `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`);
  setTxt('dash-sub', `${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${list.length} subject${list.length !== 1 ? 's' : ''} assigned`);
}

function renderPayBreakdown(list) {
  const g = _('pay-grid');
  if (!list.length) {
    g.innerHTML = '<div class="loading-state">No subjects found</div>';
    return;
  }
  g.innerHTML = list.map(s => {
    const exp = s._expected || 0;
    const rec = s._received || 0;
    const pct = exp > 0 ? Math.round(rec / exp * 100) : 0;
    const fc = pct >= 100 ? '' : pct >= 70 ? 'partial' : 'low';

    const enrollments = s._students || [];
    const groupCount = enrollments.filter(e => (e._class_type || 'group') === 'group').length;
    const indCount = enrollments.length - groupCount;
    const breakdown = (indCount > 0 && groupCount > 0) ?
      `${groupCount} Group · ${indCount} 1-on-1` :
      (indCount > 0 ? `${indCount} 1-on-1` : `${groupCount} Group`);

    /* ✅ Total students = active + pending */
    const totalStudents = (s._active || 0) + (s._pending || 0);

    return `<div class="pci"><div class="pci-board">${s._scope || subjectScopeLabel(s)}</div>
      <div class="pci-name">${s.name}</div>
      <div class="pci-row"><span class="pci-key">Mix</span><span class="pci-val" style="color:var(--teal);font-size:12px;">${breakdown}</span></div>
      <div class="pci-row"><span class="pci-key">Expected</span><span class="pci-val">₹${exp.toLocaleString('en-IN')}</span></div>
      <div class="pci-row"><span class="pci-key">Received</span><span class="pci-val" style="color:${pct >= 100 ? 'var(--green)' : 'var(--teal)'}">₹${rec.toLocaleString('en-IN')}</span></div>
      <div class="pci-row"><span class="pci-key">Students paid</span><span class="pci-val">${s._paid || 0} / ${totalStudents}</span></div>
      <div class="pci-bar"><div class="pci-fill ${fc}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderCurrGrid(list) {
  const g = _('curr-grid');
  if (!list.length) {
    g.innerHTML = '<div class="loading-state" style="grid-column:1/-1">No subjects</div>';
    return;
  }
  g.innerHTML = list.map(s => {
    const b = bc(s._board || subjectFirstBoard(s));
    const avgC = s._avg >= 75 ? 'var(--green)' : 'var(--teal)';
    const totalStudents = (s._active || 0) + (s._pending || 0);
    const paidC = (s._paid === totalStudents && totalStudents > 0) ? 'var(--green)' : 'var(--orange)';
    const earnings = s._received || 0;
    return `<div class="curr-card" onclick="openSubject('${s._cardId || s.id}')">
      <div class="cc-accent ${b}"></div>
      <div class="cc-board-tag ${b}">${s._scope || subjectScopeLabel(s)}</div>
      <div class="cc-name">${s.name}</div>
      <div class="cc-sub">${s.code || ''} Academic Year 2025–26</div>
      <div class="cc-stats">
        <div class="cc-stat"><div class="cc-stat-lbl">Students</div><div class="cc-stat-val" style="color:var(--blue)">${totalStudents}</div></div>
        <div class="cc-stat"><div class="cc-stat-lbl">Avg Score</div><div class="cc-stat-val" style="color:${avgC}">${s._avg ? s._avg + '%' : '—'}</div></div>
        <div class="cc-stat"><div class="cc-stat-lbl">Fees Paid</div><div class="cc-stat-val" style="color:${paidC}">${s._paid || 0}/${totalStudents}</div></div>
        <div class="cc-stat"><div class="cc-stat-lbl">Earnings</div><div class="cc-stat-val" style="color:var(--teal)">₹${(earnings / 1000).toFixed(1)}k</div></div>
      </div>
      ${s._pending > 0 ? `<div class="cc-pending">⏳ ${s._pending} pending verification</div>` : ''}
      ${s._asgn > 0 ? `<div class="cc-pending" style="margin-top:6px;">📝 ${s._asgn} assignment${s._asgn !== 1 ? 's' : ''}</div>` : ''}
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   ✅ FIXED openSubject — Pending students bhi load karo
══════════════════════════════════════════════════════════════ */
async function openSubject(id) {
  CURR = SUBJECTS.find(s => (s._cardId || s.id) === id) || SUBJECTS.find(s => s.id === id);
  if (!CURR) return;
  CUR_STUDENTS = [];
  CUR_ASSIGNS = [];
  CUR_SUBS = {};
  SEL_ASSIGN = null;
  const b = bc(CURR._board || subjectFirstBoard(CURR));
  setTxt('bc-name', CURR.name);
  const badge = _('det-badge');
  badge.textContent = CURR._scope || subjectScopeLabel(CURR);
  badge.className = `det-badge ${b}`;
  setTxt('det-title', CURR.name);
  setTxt('det-meta', `${CURR.code || ''} ${TEACHER.full_name} - Academic Year 2025–26`);
  setTxt('up-sub-label', `${CURR._scope || subjectScopeLabel(CURR)} — ${CURR.name}`);
  _('stu-tbody').innerHTML = '<tr><td colspan="5" class="loading-state">Loading students…</td></tr>';
  _('mark-rows').innerHTML = '<div class="loading-state">Loading…</div>';
  showScreen('s-detail');
  switchTab('upload');

  if (!IS_LIVE) {
    toast('⚠ Supabase is not connected.', 'err');
    return;
  }

  /* Step 1: Assignments — sirf is card (grade+board combo) ke */
  const {
    data: asgns
  } = await sb.from('assignments').select('*')
    .eq('subject_id', CURR.id).eq('status', 'published')
    .order('created_at', {
      ascending: false
    });
  CUR_ASSIGNS = (asgns || []).filter(a =>
    (CURR._grade == null && CURR._board == null) ? true : assignmentInScope(a, CURR._grade, CURR._board)
  );
  SEL_ASSIGN = CUR_ASSIGNS[0] || null;
  populateAssignSels();
  renderPublishedList();

  /* ✅ Step 2: Is card (combo) ke enrolled students — profiles.subjects se
     (dashboard me pehle hi nikaale ja chuke hain) */
  const rawStudents = (CURR._students || []).map(p => ({
    id: p.id,
    full_name: p.full_name || null,
    username: p.username || null,
    roll_number: p.roll_number || null,
    class: p.class || null,
    board: p.board || null,
    _class_type: p._class_type || 'group',
    _is_active: true,      /* payment band → active */
    _pay: 'active',
    _avg: null
  }));

  /* is card kis grade+board ka hai (submission-students filter ke liye) */
  const _comboFilter = (cls, brd) => {
    if (CURR._grade == null && CURR._board == null) return true;   // "all" card
    return feeMatches({ grade: CURR._grade, board: CURR._board }, cls, brd);
  };

  /* Step 3: Submissions ke through bhi students */
  if (CUR_ASSIGNS.length) {
    const assignIds = CUR_ASSIGNS.map(a => a.id);
    const {
      data: subRows
    } = await sb.from('assignment_submissions')
      .select('student_id, profiles:student_id(id, full_name, username, roll_number, class, board)')
      .in('assignment_id', assignIds);

    const knownIds = new Set(rawStudents.map(s => s.id));
    (subRows || []).forEach(sub => {
      if (sub.student_id && !knownIds.has(sub.student_id)) {
        const pr = sub.profiles || {};
        /* ✅ Sirf is combo (grade+board) ke students hi add karo */
        if (!_comboFilter(pr.class, pr.board)) return;
        rawStudents.push({
          id: sub.student_id,
          full_name: pr.full_name || null,
          username: pr.username || null,
          roll_number: pr.roll_number || null,
          class: pr.class || null,
          board: pr.board || null,
          _class_type: 'group',
          _is_active: false,
          _pay: 'pending',
          _avg: null
        });
        knownIds.add(sub.student_id);
      }
    });
  }

  /* Step 4: Profiles fallback (RLS) */
  if (rawStudents.some(s => !s.full_name)) {
    const ids = rawStudents.map(s => s.id).filter(Boolean);
    if (ids.length) {
      const {
        data: profs
      } = await sb.from('profiles')
        .select('id, full_name, username, roll_number, class, board').in('id', ids);
      if (profs && profs.length) {
        const pm = {};
        profs.forEach(p => pm[p.id] = p);
        rawStudents.forEach((s, i) => {
          if (pm[s.id]) {
            const orig = rawStudents[i];
            Object.assign(rawStudents[i], pm[s.id]);
            /* Preserve class_type from student_subjects */
            rawStudents[i]._class_type = orig._class_type;
            rawStudents[i]._is_active = orig._is_active;
            rawStudents[i]._pay = orig._pay;
          }
        });
      }
    }
  }

  /* Step 5: Avg scores */
  /* ✅ assignment title -> max_score map (CUR_ASSIGNS pehle hi load ho chuke hain) */
  const maxMap = {};
  CUR_ASSIGNS.forEach(a => { maxMap[(a.title || '').trim()] = Number(a.max_score) || 0; });

  CUR_STUDENTS = await Promise.all(rawStudents.map(async s => {
    if (!s.id) return s;
    const {
      data: sc
    } = await sb.from('assessments')
      .select('student_score, name').eq('student_id', s.id).eq('subject_id', CURR.id);
    return { ...s, _avg: avgPercent(sc, maxMap) }; // ✅ % me, raw nahi
  }));

  console.log('[openSubject] Total students loaded:', CUR_STUDENTS.length);

  renderStudentTable();
  updateDetStats();
  await loadNotices();
}

function updateDetStats() {
  setTxt('dqs-stu', CUR_STUDENTS.length);
  const avgs = CUR_STUDENTS.filter(s => s._avg != null).map(s => s._avg);
  const avg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0;
  setTxt('dqs-avg', avg ? avg + '%' : '—');

  let earn = 0;
  if (CURR && CURR._received !== undefined) {
    earn = CURR._received;
  } else {
    CUR_STUDENTS.forEach(s => {
      if (s._pay === 'active' || s._is_active === true) {
        const ct = s._class_type || 'group';
        earn += getSubjectFee(CURR, ct, s.class, s.board);
      }
    });
  }
  setTxt('dqs-earn', earn > 0 ? '₹' + (earn / 1000).toFixed(1) + 'k' : '₹0');
  setTxt('dqs-sub', '—');
}

/* ════════════════════════════════════════════════
   ✅ renderStudentTable — Show ALL students with status
════════════════════════════════════════════════ */
function renderStudentTable(filter = '') {
  const tbody = _('stu-tbody');
  const rows = CUR_STUDENTS.filter(s =>
    !filter ||
    (s.full_name || '').toLowerCase().includes(filter.toLowerCase()) ||
    (s.roll_number || '').includes(filter) ||
    (s.username || '').toLowerCase().includes(filter.toLowerCase())
  );
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-state">No students found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((s, i) => {
    const av = AVC[i % AVC.length];
    const iv = ini(s.full_name);
    const sc = s._avg;
    const bcc = sc >= 80 ? 'high' : sc >= 65 ? 'mid' : 'low';

    /* ✅ Payment status logic */
    const isActive = s._is_active === true;
    const isPending = !isActive && (s._pay === 'pending');
    let ptag, pcls;
    if (isActive) {
      ptag = '✓ Active';
      pcls = 'paid';
    } else if (isPending) {
      ptag = '⏳ Pending';
      pcls = 'pending';
    } else {
      ptag = 'Inactive';
      pcls = 'overdue';
    }

    const ct = s._class_type || 'group';
    const ctLabel = ct === 'individual' ? '1-on-1' : 'Group';
    const ctColor = ct === 'individual' ? 'var(--yellow)' : 'var(--teal)';

    return `<tr>
      <td style="color:var(--muted);width:36px">${String(i + 1).padStart(2, '0')}</td>
      <td>
        <div class="s-name-cell">
          <div class="s-av" style="background:${av}">${iv}</div>
          <div>
            <div style="font-weight:500;">${s.full_name || '—'}</div>
            ${s.username ? `<div style="font-size:11px;color:var(--muted);">@${s.username} · <span style="color:${ctColor};">${ctLabel}</span></div>` : `<div style="font-size:11px;color:${ctColor};">${ctLabel}</div>`}
          </div>
        </div>
      </td>
      <td style="color:var(--muted);font-size:13px"><strong style="color:var(--cream);">${s.roll_number || '—'}</strong></td>
      <td>${sc != null ? `<div class="score-wrap"><span>${sc}%</span><div class="score-bar"><div class="score-fill ${bcc}" style="width:${sc}%"></div></div></div>` : '—'}</td>
      <td><span class="pay-badge ${pcls}">${ptag}</span></td>
    </tr>`;
  }).join('');
}

function filterStudents(v) {
  renderStudentTable(v);
}

function renderPublishedList() {
  const section = _('pub-assign-section');
  const listEl = _('pub-assign-list');
  if (!section || !listEl) return;
  if (!CUR_ASSIGNS || !CUR_ASSIGNS.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  setTxt('pub-assign-count', CUR_ASSIGNS.length + ' assignment' + (CUR_ASSIGNS.length !== 1 ? 's' : ''));
  listEl.innerHTML = CUR_ASSIGNS.map(a => {
    const daysLeft = Math.ceil((new Date(a.due_date) - new Date()) / 86400000);
    const overdue = daysLeft < 0;
    const dueStr = overdue ?
      `<span style="color:var(--red);">⚠ Overdue ${Math.abs(daysLeft)}d</span>` :
      daysLeft === 0 ?
      `<span style="color:var(--orange);">⚠ Due today</span>` :
      `<span style="color:var(--muted);">Due: ${fmtDate(a.due_date)}</span>`;
    return `<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid rgba(0,184,180,0.06);">
      <div style="width:36px;height:36px;background:var(--teal-dim);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📝</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;color:var(--cream);margin-bottom:4px;">${a.title}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">${a.type} · Max: ${a.max_score} marks · ${dueStr}</div>
        ${a.instructions ? `<div style="font-size:11.5px;color:var(--muted);line-height:1.5;">${a.instructions}</div>` : ''}
        ${a.file_url ? `<div style="margin-top:6px;font-size:12px;color:var(--teal);">📎 ${a.file_name || 'File attached'}</div>` : '<div style="margin-top:4px;font-size:11.5px;color:var(--muted);">No file attached</div>'}
      </div>
      <div style="flex-shrink:0;text-align:right;">
        <div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:6px;">✓ Published</div>
        <div style="font-size:11px;color:var(--muted);">${fmtDate(a.created_at)}</div>
        <button onclick="switchTab('subs');setSubAssignment('${a.id}')"
          style="margin-top:8px;padding:5px 12px;background:transparent;color:var(--teal);border:1px solid var(--teal);border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;">
          View Submissions
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderAssignList() {
  const listEl = _('asgn-list');
  const badge = _('asgn-total-badge');
  const stTotal = _('asgn-stat-total');
  const stAct = _('asgn-stat-active');
  const stOver = _('asgn-stat-over');

  if (!CUR_ASSIGNS || !CUR_ASSIGNS.length) {
    if (listEl) listEl.innerHTML = '<div class="loading-state" style="text-align:center;padding:48px 24px;">' +
      '<div style="font-size:32px;margin-bottom:14px">📋</div>' +
      '<div style="font-size:15px;font-weight:600;color:var(--cream);margin-bottom:10px">No assignments published yet</div>' +
      '<div style="font-size:13px;color:var(--muted);margin-bottom:20px">Create your first assignment from the Upload Assignment tab</div>' +
      '<button onclick="switchTab(\'upload\')" style="padding:10px 24px;background:var(--teal);border:none;border-radius:8px;color:#fff;font-family:\'DM Sans\',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;">+ Upload Assignment</button>' +
      '</div>';
    if (badge) badge.textContent = '0 assignments';
    if (stTotal) stTotal.textContent = '0';
    if (stAct) stAct.textContent = '0';
    if (stOver) stOver.textContent = '0';
    return;
  }

  const sortSel = _('asgn-sort');
  const sortVal = sortSel ? sortSel.value : 'newest';
  const sorted = [...CUR_ASSIGNS].sort((a, b) => {
    if (sortVal === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    if (sortVal === 'due') return new Date(a.due_date) - new Date(b.due_date);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const now = new Date();
  const nOver = sorted.filter(a => new Date(a.due_date) < now).length;
  const nActive = sorted.length - nOver;
  if (badge) badge.textContent = sorted.length + ' assignment' + (sorted.length !== 1 ? 's' : '');
  if (stTotal) stTotal.textContent = sorted.length;
  if (stAct) stAct.textContent = nActive;
  if (stOver) stOver.textContent = nOver;

  const typeClr = {
    'Worksheet': {
      bg: 'rgba(0,184,180,0.15)',
      col: 'var(--teal)'
    },
    'Problem Set': {
      bg: 'rgba(76,154,245,0.15)',
      col: 'var(--blue)'
    },
    'Practice Paper': {
      bg: 'rgba(76,175,130,0.15)',
      col: 'var(--green)'
    },
    'Lab Report': {
      bg: 'rgba(232,146,74,0.15)',
      col: 'var(--orange)'
    },
    'Project': {
      bg: 'rgba(180,124,239,0.15)',
      col: 'var(--purple)'
    },
  };
  const def = {
    bg: 'rgba(0,184,180,0.1)',
    col: 'var(--teal)'
  };

  if (listEl) listEl.innerHTML = sorted.map(a => {
    const daysLeft = Math.ceil((new Date(a.due_date) - now) / 86400000);
    const isOverdue = daysLeft < 0;
    const isToday = daysLeft === 0;
    const tc = typeClr[a.type] || def;

    const dueBadge = isOverdue ?
      `<span style="background:rgba(224,112,112,0.15);color:var(--red);padding:3px 10px;border-radius:12px;font-size:11.5px;font-weight:600;">⚠ Overdue ${Math.abs(daysLeft)}d</span>` :
      isToday ?
      `<span style="background:rgba(232,146,74,0.15);color:var(--orange);padding:3px 10px;border-radius:12px;font-size:11.5px;font-weight:600;">⚠ Due Today</span>` :
      `<span style="background:rgba(0,184,180,0.1);color:var(--teal);padding:3px 10px;border-radius:12px;font-size:11.5px;font-weight:600;">📅 ${daysLeft}d left</span>`;

    return `
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:20px 22px;margin-bottom:14px;transition:border-color .2s;"
         onmouseenter="this.style.borderColor='rgba(0,184,180,0.35)'" onmouseleave="this.style.borderColor='var(--border)'">
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
        <div style="width:42px;height:42px;background:${tc.bg};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📝</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px;">
            <div style="font-size:15px;font-weight:600;color:var(--cream);">${a.title}</div>
            <span style="background:${tc.bg};color:${tc.col};padding:2px 9px;border-radius:10px;font-size:11px;font-weight:600;">${a.type}</span>
            ${dueBadge}
          </div>
          <div style="font-size:12px;color:var(--muted);">
            Published ${fmtDate(a.created_at)} &nbsp;·&nbsp;
            Due <strong style="color:var(--cream);">${fmtDate(a.due_date)}</strong> &nbsp;·&nbsp;
            Max score: <strong style="color:var(--cream);">${a.max_score}</strong>
          </div>
        </div>
        <div style="font-size:10.5px;font-weight:700;color:var(--green);background:rgba(76,175,130,0.1);padding:4px 10px;border-radius:8px;flex-shrink:0;">✓ Published</div>
      </div>
      ${a.instructions
        ? `<div style="font-size:12.5px;color:var(--muted);line-height:1.65;margin-bottom:14px;padding:10px 14px;background:rgba(0,0,0,0.12);border-radius:8px;border-left:3px solid rgba(0,184,180,0.25);">${a.instructions}</div>`
        : ''}
      ${a.file_url
        ? `<div style="margin-bottom:14px;">
             <a href="${a.file_url}" target="_blank"
                style="display:inline-flex;align-items:center;gap:7px;background:rgba(0,184,180,0.08);border:1px solid rgba(0,184,180,0.25);color:var(--teal);text-decoration:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;transition:background .2s;"
                onmouseenter="this.style.background='rgba(0,184,180,0.16)'" onmouseleave="this.style.background='rgba(0,184,180,0.08)'">
               📄 ${a.file_name || 'View Worksheet File'}
             </a>
             <span style="font-size:11.5px;color:var(--muted);margin-left:10px;">Click to open / download</span>
           </div>`
        : `<div style="font-size:12px;color:var(--muted);margin-bottom:14px;font-style:italic;">📎 No file attached to this assignment</div>`}
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid rgba(0,184,180,0.08);">
        <button onclick="switchTab('subs');setSubAssignment('${a.id}')"
          style="padding:8px 18px;background:transparent;color:var(--teal);border:1px solid var(--teal);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .2s;"
          onmouseenter="this.style.background='rgba(0,184,180,0.1)'" onmouseleave="this.style.background='transparent'">
          📥 View Submissions
        </button>
        <button onclick="SEL_ASSIGN=CUR_ASSIGNS.find(x=>x.id==='${a.id}')||SEL_ASSIGN;switchTab('mark')"
          style="padding:8px 18px;background:transparent;color:var(--green);border:1px solid var(--green);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .2s;"
          onmouseenter="this.style.background='rgba(76,175,130,0.1)'" onmouseleave="this.style.background='transparent'">
          ✏️ Mark Scores
        </button>
      </div>
    </div>`;
  }).join('');
}

function setSubAssignment(aid) {
  SEL_ASSIGN = CUR_ASSIGNS.find(a => a.id === aid) || SEL_ASSIGN;
  populateAssignSels();
  const sel = _('s-asgn-sel');
  if (sel) sel.value = aid;
  loadSubmissions(aid);
}

function switchTab(t) {
  ['upload', 'asgn', 'subs', 'mark', 'notice'].forEach(x => {
    const tab = _('tab-' + x);
    if (tab) tab.classList.toggle('active', x === t);
    const pane = _('pane-' + x);
    if (pane) pane.style.display = x === t ? 'block' : 'none';
  });
  if (t === 'upload') renderPublishedList();
  if (t === 'asgn') renderAssignList();
  if (t === 'subs' && SEL_ASSIGN) loadSubmissions(SEL_ASSIGN.id);
  if (t === 'mark') renderMarkRows();
  if (t === 'notice') loadNotices();
}

function handleFile(inp) {
  const f = inp.files[0];
  if (!f) return;
  setTxt('file-nm', f.name);
  setTxt('file-sz', (f.size / 1048576).toFixed(2) + ' MB');
  _('drop-zone').style.display = 'none';
  _('file-prev').style.display = 'flex';
}

function clearFile() {
  _('a-file').value = '';
  _('drop-zone').style.display = 'block';
  _('file-prev').style.display = 'none';
}

async function publishAssignment() {
  const title = _('a-title').value.trim(),
    type = _('a-type').value,
    due = _('a-due').value,
    max = parseInt(_('a-max').value) || 50,
    inst = _('a-inst').value.trim();
  if (!title || !due) {
    toast('Please fill in the title and due date.', 'err');
    return;
  }
  const btn = _('pub-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Publishing…';
  let fileUrl = '',
    fileName = '';
  const fi = _('a-file');
  if (fi.files[0]) {
    const f = fi.files[0];
    fileName = f.name;
    btn.innerHTML = '<span class="spinner"></span>Uploading file…';
    try {
      const codeFolder = (CURR.code || CURR.name || 'Subject').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
      const subName = (CURR.name || 'Subject').replace(/[^a-zA-Z0-9 ]/g, '').replace(/ +/g, '-');
      const tName = (TEACHER.full_name || 'Teacher').replace(/[^a-zA-Z0-9 .]/g, '').replace(/ +/g, '-');
      const safeFN = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = codeFolder + '/' + subName + '/' + tName + '/' + safeFN;
      const {
        error: ue
      } = await sb.storage.from('peak-assignments').upload(path, f, {
        upsert: true
      });
      if (ue) {
        toast('File upload failed: ' + ue.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Publish Assignment →';
        return;
      }
      fileUrl = sb.storage.from('peak-assignments').getPublicUrl(path).data.publicUrl || '';
    } catch (uploadErr) {
      toast('Upload error: ' + uploadErr.message, 'err');
      btn.disabled = false;
      btn.textContent = 'Publish Assignment →';
      return;
    }
    btn.innerHTML = '<span class="spinner"></span>Saving…';
  }
  if (!IS_LIVE) {
    toast('⚠ Supabase is not connected.', 'err');
    btn.disabled = false;
    btn.textContent = 'Publish Assignment →';
    return;
  }
  const {
    data: nA,
    error
  } = await sb.from('assignments').insert({
    subject_id: CURR.id,
    teacher_id: TEACHER.id,
    title,
    type,
    due_date: due,
    max_score: max,
    instructions: inst,
    file_url: fileUrl,
    file_name: fileName,
    status: 'published',
    grade: CURR._grade || null,   /* ✅ sirf is grade ke liye */
    board: CURR._board || null    /* ✅ sirf is board ke liye */
  }).select().single();
  if (error) {
    toast('Error: ' + error.message, 'err');
    btn.disabled = false;
    btn.textContent = 'Publish Assignment →';
    return;
  }
  CUR_ASSIGNS.unshift(nA);
  SEL_ASSIGN = CUR_ASSIGNS[0];
  if (CURR) CURR._asgn = (CURR._asgn || 0) + 1;
  populateAssignSels();
  renderPublishedList();
  renderCurrGrid(SUBJECTS);
  toast(`✓ "${title}" published! Students can see it now.`, 'ok');
  clearAssignFm();
  btn.disabled = false;
  btn.textContent = 'Publish Assignment →';
}

function clearAssignFm() {
  _('a-title').value = '';
  _('a-due').value = '';
  _('a-max').value = '50';
  _('a-inst').value = '';
  clearFile();
}

function populateAssignSels() {
  const opts = CUR_ASSIGNS.length ? CUR_ASSIGNS.map(a => `<option value="${a.id}">${a.title}</option>`).join('') : '<option value="">No assignments</option>';
  ['s-asgn-sel', 'm-asgn-sel'].forEach(id => {
    const e = _(id);
    if (e) e.innerHTML = opts;
  });
  if (SEL_ASSIGN) {
    const se = _('s-asgn-sel'),
      me = _('m-asgn-sel');
    if (se) se.value = SEL_ASSIGN.id;
    if (me) me.value = SEL_ASSIGN.id;
    updAMeta(SEL_ASSIGN, 's');
    updAMeta(SEL_ASSIGN, 'm');
  }
}

function updAMeta(a, p) {
  if (!a) return;
  setTxt(p + '-asgn-title', a.title || '—');
  setTxt(p + '-asgn-meta', `Due: ${fmtDate(a.due_date)} / Max score: ${a.max_score}`);
}

function onSubsAssignChange(id) {
  SEL_ASSIGN = CUR_ASSIGNS.find(a => a.id === id) || SEL_ASSIGN;
  loadSubmissions(id);
}

async function loadSubmissions(aid) {
  SEL_ASSIGN = CUR_ASSIGNS.find(a => a.id === aid) || SEL_ASSIGN;
  if (!SEL_ASSIGN) return;
  updAMeta(SEL_ASSIGN, 's');
  const list = _('subs-list');
  list.innerHTML = '<div class="loading-state">Loading submissions…</div>';
  let sm = {};

  if (IS_LIVE) {
    const {
      data: subs
    } = await sb.from('assignment_submissions')
      .select('id, student_id, submitted_at, file_url, file_name, file_size, status, teacher_remarks, checked_file_url, checked_file_name, profiles:student_id(id, full_name, username, roll_number, class, board)')
      .eq('assignment_id', aid);
    (subs || []).forEach(s => {
      const pr = s.profiles || {};
      sm[s.student_id] = {
        ...s,
        _name: pr.full_name || null,
        _username: pr.username || null,
        _roll: pr.roll_number || null,
        _class: pr.class || null,
        teacher_remarks: s.teacher_remarks || '',
        checked_file_url: s.checked_file_url || '',
        checked_file_name: s.checked_file_name || ''
      };
    });
    const missingSubIds = Object.keys(sm).filter(sid => !sm[sid]._name);
    if (missingSubIds.length) {
      const {
        data: sprofs
      } = await sb.from('profiles').select('id, full_name, username, roll_number, class, board').in('id', missingSubIds);
      const spm = {};
      (sprofs || []).forEach(p => spm[p.id] = p);
      Object.keys(sm).forEach(sid => {
        if (spm[sid]) {
          sm[sid]._name = spm[sid].full_name || null;
          sm[sid]._username = spm[sid].username || null;
          sm[sid]._roll = spm[sid].roll_number || null;
          sm[sid]._class = spm[sid].class || null;
        }
      });
    }
  }
  CUR_SUBS[aid] = sm;
  renderSubList(sm);
  setTxt('dqs-sub', Object.keys(sm).length);
}

function setSubFilter(f, el) {
  _subFilter = f;
  document.querySelectorAll('.filter-row .fc').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const sm = CUR_SUBS[SEL_ASSIGN?.id] || {};
  renderSubList(sm);
}

function renderSubList(sm) {
  const list = _('subs-list');
  const submittedArr = Object.values(sm);
  const submittedIds = new Set(Object.keys(sm));
  const notSubArr = CUR_STUDENTS.filter(s => !submittedIds.has(s.id));
  const subCt = submittedArr.length;
  setTxt('sub-ct-y', '✓ Submitted: ' + subCt);
  setTxt('sub-ct-n', '✗ Not submitted: ' + notSubArr.length);
  let html = '';

  if (_subFilter === 'all' || _subFilter === 'submitted') {
    submittedArr.forEach((sub, i) => {
      const name = sub._name || '—',
        username = sub._username ? '@' + sub._username : '';
      const roll = sub._roll || '—',
        cls = sub._class ? ' · ' + sub._class : '';
      const av = AVC[i % AVC.length],
        iv = ini(name);
      const fname = sub.file_name || '',
        fsize = sub.file_size ? (Number(sub.file_size) / 1048576).toFixed(2) + ' MB' : '';
      const subData = {
        sid: sub.student_id,
        aid: SEL_ASSIGN ? SEL_ASSIGN.id : '',
        url: sub.file_url,
        fname: sub.file_name || '',
        remark: sub.teacher_remarks || '',
        subId: sub.id || '',
        checkedUrl: sub.checked_file_url || '',
        checkedName: sub.checked_file_name || ''
      };
      const subDataStr = btoa(unescape(encodeURIComponent(JSON.stringify(subData))));
      const viewBtn = sub.file_url ?
        '<button onclick="openSubReview(atob(\'' + subDataStr + '\'))" class="sub-view" style="cursor:pointer;">✏️ Review & Comment</button>' :
        '<span style="font-size:12px;color:var(--muted);">No file</span>';
      const dlBtn = sub.file_url ?
        '<button onclick="downloadSubmission(atob(\'' + subDataStr + '\'))" style="cursor:pointer;margin-top:6px;display:inline-block;padding:5px 12px;background:transparent;color:var(--blue);border:1px solid var(--blue);border-radius:6px;font-size:11.5px;font-weight:600;">⬇ Download</button>' :
        '';
      html += '<div class="sub-row" style="border-left:3px solid var(--green);padding-left:14px;align-items:flex-start;">' +
        '<div class="s-av" style="background:' + av + ';margin-top:4px;">' + iv + '</div>' +
        '<div style="flex:1;min-width:0;"><div class="sub-name">' + name + '</div>' +
        (username ? '<div style="font-size:11.5px;color:var(--teal);margin-top:1px;">' + username + '</div>' : '') +
        
        (fname ? '<div style="font-size:11px;color:var(--muted);margin-top:5px;">📎 ' + fname + (fsize ? ' (' + fsize + ')' : '') + '</div>' : '') +
        '</div><div style="text-align:right;flex-shrink:0;min-width:140px;">' +
        '<div style="font-size:11px;color:var(--green);font-weight:700;margin-bottom:3px;">✓ Submitted</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-bottom:8px;">' + fmtDate(sub.submitted_at) + '</div>' +
        viewBtn + (dlBtn ? '<br>' + dlBtn : '') + '</div></div>';
    });
  }
  if (_subFilter === 'all' || _subFilter === 'not submitted') {
    notSubArr.forEach((s, i) => {
      const name = s.full_name || '—',
        username = s.username ? '@' + s.username : '';
      const roll = s.roll_number || '—',
        cls = s.class ? ' · ' + s.class : '';
      const av = AVC[(subCt + i) % AVC.length],
        iv = ini(name);
      html += '<div class="sub-row" style="border-left:3px solid rgba(224,112,112,.5);padding-left:14px;align-items:flex-start;">' +
        '<div class="s-av" style="background:' + av + ';margin-top:4px;">' + iv + '</div>' +
        '<div style="flex:1;"><div class="sub-name">' + name + '</div>' +
        (username ? '<div style="font-size:11.5px;color:var(--muted);margin-top:1px;">' + username + '</div>' : '') +
        '<div class="sub-roll">Roll No. <strong style="color:var(--cream);">' + roll + '</strong>' + cls + '</div>' +
        '</div><div class="not-sub">✗ Not Submitted</div></div>';
    });
  }
  if (!html) {
    list.innerHTML = '<div class="loading-state">No students match filter</div>';
    return;
  }
  list.innerHTML = html;
}

function onMarkAssignChange(id) {
  SEL_ASSIGN = CUR_ASSIGNS.find(a => a.id === id) || SEL_ASSIGN;
  updAMeta(SEL_ASSIGN, 'm');
  renderMarkRows();
}

/* ✅ Student ki submitted worksheet download karo (cross-origin → blob ke through) */
function downloadSubmission(jsonStr) {
  let meta;
  try { meta = JSON.parse(jsonStr); } catch (e) { return; }
  if (!meta.url) { toast('No file to download.', 'err'); return; }
  _downloadFile(meta.url, meta.fname || 'submission');
}
async function _downloadFile(url, filename) {
  try {
    toast('Downloading…', 'ok');
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename || 'submission';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => { try { URL.revokeObjectURL(objUrl); } catch (e) {} }, 4000);
  } catch (e) {
    /* fallback: naye tab me kholo */
    window.open(url, '_blank');
  }
}

async function renderMarkRows() {
  const cont = _('mark-rows');
  if (!CUR_ASSIGNS.length) {
    cont.innerHTML = '<div class="loading-state">Please upload an assignment first.</div>';
    return;
  }
  if (!SEL_ASSIGN) SEL_ASSIGN = CUR_ASSIGNS[0];
  updAMeta(SEL_ASSIGN, 'm');
  cont.innerHTML = '<div class="loading-state"><span class="spinner"></span> Loading saved scores…</div>';

  let existingMap = {};
  if (IS_LIVE && CURR && SEL_ASSIGN) {
    const studentIds = CUR_STUDENTS.map(s => s.id).filter(Boolean);
    if (studentIds.length) {
      try {
        const {
          data: existing,
          error
        } = await sb.from('assessments')
          .select('student_id, student_score, remarks')
          .eq('subject_id', CURR.id)
          .eq('name', SEL_ASSIGN.title)
          .in('student_id', studentIds);
        if (error) console.warn('Assessments fetch error:', error.message);
        (existing || []).forEach(r => {
          if (r.student_score !== null && r.student_score !== undefined) {
            existingMap[r.student_id] = {
              score: r.student_score,
              remarks: r.remarks || ''
            };
          }
        });
      } catch (e) {
        console.error('[MarkRows] Error:', e);
      }
    }
  }

  cont.innerHTML = CUR_STUDENTS.map((s, i) => {
    const av = AVC[i % AVC.length],
      iv = ini(s.full_name);
    const hasSaved = Object.prototype.hasOwnProperty.call(existingMap, s.id);
    const saved = hasSaved ? existingMap[s.id] : null;
    const score = hasSaved ? saved.score : '';
    const remark = hasSaved ? (saved.remarks || '') : '';
    const dotCls = hasSaved ? 'saved' : 'unsaved';
    const scoreColor = hasSaved ? 'color:var(--teal);font-weight:700;' : '';
    return `<div class="mark-row" data-sid="${s.id}">
      <div style="flex:1.5;display:flex;align-items:center;gap:10px">
        <div class="s-av" style="background:${av};width:28px;height:28px;font-size:11px">${iv}</div>
        <div>
          <div style="font-size:13.5px;font-weight:500">${s.full_name || '—'}</div>
          <div style="font-size:11.5px;color:var(--muted)">${s.username ? '@' + s.username : ''}</div>
        </div>
      </div>
      <input class="m-score _sc" type="number" min="0"
             placeholder="—" value="${score}" style="${scoreColor}">
      <div style="font-size:12px;color:var(--muted)">/ ${SEL_ASSIGN.max_score}</div>
      <input class="m-remarks _rm" placeholder="Add remarks…" value="${remark}">
      <div class="m-dot ${dotCls}" title="${hasSaved ? '✓ Saved · ' + score + '/' + SEL_ASSIGN.max_score : 'Not saved yet'}"></div>
    </div>`;
  }).join('');
}

async function saveAllScores() {
  if (!SEL_ASSIGN) {
    toast('Please select an assignment.', 'err');
    return;
  }
  const rows = document.querySelectorAll('#mark-rows .mark-row');
  const updates = [];
  rows.forEach(r => {
    const sc = r.querySelector('._sc').value,
      rm = r.querySelector('._rm').value;
    if (sc !== '') updates.push({
      student_id: r.dataset.sid,
      subject_id: CURR.id,
      name: SEL_ASSIGN.title,
      student_score: parseFloat(sc),
      class_avg_score: 0,
      remarks: rm || '',
      conducted_month: new Date().toLocaleString('default', {
        month: 'long',
        year: 'numeric'
      }),
      conducted_at: new Date().toISOString()
    });
  });
  if (!updates.length) {
    toast('No scores were entered.', 'err');
    return;
  }
  const avg = Math.round(updates.reduce((a, u) => a + u.student_score, 0) / updates.length);
  updates.forEach(u => u.class_avg_score = avg);
  if (!IS_LIVE) {
    toast('⚠ Supabase is not connected.', 'err');
    return;
  }
  await sb.from('assessments').delete().eq('subject_id', CURR.id).eq('name', SEL_ASSIGN.title).in('student_id', updates.map(u => u.student_id));
  const {
    error
  } = await sb.from('assessments').insert(updates);
  if (error) {
    toast('Error: ' + error.message, 'err');
    return;
  }
  rows.forEach(r => r.querySelector('.m-dot').className = 'm-dot saved');
  toast(`✓ ${updates.length} scores saved!`, 'ok');
}

async function loadNotices() {
  const list = _('notice-list');
  list.innerHTML = '<div class="loading-state">Loading…</div>';
  if (!IS_LIVE) {
    list.innerHTML = '<div class="loading-state">Please connect Supabase.</div>';
    return;
  }
  const {
    data
  } = await sb.from('notices').select('*').order('created_at', {
    ascending: false
  }).limit(20);
  renderNoticeList(data || []);
}

function renderNoticeList(notices) {
  const list = _('notice-list');
  if (!notices.length) {
    list.innerHTML = '<div class="loading-state">No notices posted yet.</div>';
    return;
  }
  const clr = {
    info: 'var(--yellow)',
    warning: 'var(--orange)',
    urgent: 'var(--red)'
  };
  list.innerHTML = notices.map(n => `
    <div class="n-row">
      <div class="n-dot" style="background:${clr[n.type] || clr.info};margin-top:6px"></div>
      <div style="flex:1"><div style="font-size:13.5px;line-height:1.5"><strong>${n.title}</strong>${n.body ? ' — ' + n.body : ''}</div><div style="font-size:11.5px;color:var(--muted);margin-top:3px">${fmtDate(n.created_at)}</div></div>
      <button onclick="deleteNotice('${n.id}')" title="Delete notice"
        style="flex-shrink:0;background:rgba(224,112,112,0.12);border:1px solid rgba(224,112,112,0.35);color:#e07070;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">🗑 Delete</button>
    </div>`).join('');
}

/* ✅ Notice delete — student ke dashboard se bhi hat jayega (same table) */
async function deleteNotice(id) {
  if (!id) return;
  if (!confirm('Delete this notice? It will also be removed from student dashboards.')) return;
  if (!IS_LIVE) { toast('⚠ Supabase is not connected.', 'err'); return; }
  try {
    /* .select() lagaya taaki pata chale kitni rows actually delete hui */
    const { data, error } = await sb.from('notices').delete().eq('id', id).select();
    if (error) throw error;
    if (!data || data.length === 0) {
      /* RLS ne block kiya — koi row delete nahi hui */
      toast('Delete blocked. Run the notices delete policy in Supabase.', 'err');
      return;
    }
    toast('✓ Notice deleted.', 'ok');
    await loadNotices();
  } catch (e) {
    toast('Delete failed: ' + e.message, 'err');
  }
}

async function postNotice() {
  const t = _('n-title').value.trim(),
    b = _('n-body').value.trim(),
    ty = _('n-type').value;
  if (!t || !b) {
    toast('Please fill in the title and content.', 'err');
    return;
  }
  if (!IS_LIVE) {
    toast('⚠ Supabase is not connected.', 'err');
    return;
  }
  const {
    error
  } = await sb.from('notices').insert({
    title: t,
    body: b,
    type: ty
  });
  if (error) {
    toast('Error: ' + error.message, 'err');
    return;
  }
  toast('✓ Notice posted!', 'ok');
  _('n-title').value = '';
  _('n-body').value = '';
  await loadNotices();
}

/* ════════════════════════════════════════════════
   ✅ FIXED openSubReview — har file type dikhao
════════════════════════════════════════════════ */
function openSubReview(jsonStr) {
  let meta;
  try {
    meta = JSON.parse(jsonStr);
  } catch (e) {
    toast('Error opening review', 'err');
    return;
  }

  const modal = _('sub-review-modal');
  if (!modal) {
    toast('Modal not found', 'err');
    return;
  }

  setTxt('srv-fname', meta.fname || 'Submission');
  _('srv-remark-input').value = meta.remark || '';
  _('srv-save-btn').dataset.subId = meta.subId || '';
  _('srv-save-btn')._metaAid = meta.aid;
  _('srv-save-btn')._metaSid = meta.sid;
  setTxt('srv-char-count', (meta.remark || '').length + ' characters');

  modal.style.display = 'flex';

  /* ✅ Checked-worksheet upload box (modal me JS se inject) */
  mountCheckedUI(meta);

  /* ✅ File ko uske type ke hisaab se dikhao (PDF / Word / image / etc.) */
  renderSubmissionFile(meta.url, meta.fname);
}

/* ✅ Review modal me "Upload Checked Worksheet" box ek baar bana do, phir update karte raho */
function mountCheckedUI(meta) {
  const saveBtn = _('srv-save-btn');
  if (!saveBtn) return;
  let wrap = _('srv-checked-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'srv-checked-wrap';
    wrap.style.cssText = 'margin:14px 0;padding:14px 16px;border:1px dashed rgba(0,184,180,0.4);border-radius:10px;';
    wrap.innerHTML =
      '<div style="font-size:12px;font-weight:700;color:var(--teal);margin-bottom:8px;">📤 Upload Checked Worksheet (student will see this)</div>'
      + '<div id="srv-checked-status" style="font-size:12px;color:var(--muted);margin-bottom:10px;">No checked file uploaded yet.</div>'
      + '<input type="file" id="srv-checked-file" style="font-size:12px;color:var(--cream);margin-bottom:10px;display:block;max-width:100%;">'
      + '<button id="srv-checked-btn" onclick="uploadCheckedWorksheet()" style="padding:8px 18px;background:var(--teal);border:none;border-radius:8px;color:#fff;font-family:\'DM Sans\',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;">Upload Checked File →</button>';
    saveBtn.parentNode.insertBefore(wrap, saveBtn);
  }
  /* reset + existing checked file dikhao */
  const fileInp = _('srv-checked-file');
  if (fileInp) fileInp.value = '';
  setTxt('srv-checked-status', (meta.checkedUrl)
    ? '✓ Checked file uploaded: ' + (meta.checkedName || 'file')
    : 'No checked file uploaded yet.');
}

/* ✅ Checked worksheet upload → assignment_submissions me save → student ko dikhega */
async function uploadCheckedWorksheet() {
  const fileInp = _('srv-checked-file');
  const btn = _('srv-checked-btn');
  const subId = _('srv-save-btn').dataset.subId;
  const sid = _('srv-save-btn')._metaSid;
  const aid = _('srv-save-btn')._metaAid;
  const file = fileInp && fileInp.files[0];
  if (!file) { toast('Please choose a file first.', 'err'); return; }
  if (!subId) { toast('Submission ID not found.', 'err'); return; }
  if (!IS_LIVE) { toast('⚠ Supabase is not connected.', 'err'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Uploading…';
  try {
    const safeFN = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = 'checked/' + (sid || 'student') + '/' + subId + '/' + Date.now() + '_' + safeFN;
    const { error: ue } = await sb.storage.from('peak-submissions').upload(path, file, { upsert: true });
    if (ue) throw ue;
    const url = sb.storage.from('peak-submissions').getPublicUrl(path).data.publicUrl || '';
    const { data: upd, error } = await sb.from('assignment_submissions')
      .update({ checked_file_url: url, checked_file_name: file.name })
      .eq('id', subId).select();
    if (error) throw error;
    if (!upd || upd.length === 0) {
      toast('File saved but DB update blocked (RLS). Add an UPDATE policy on assignment_submissions.', 'err');
      return;
    }
    /* cache update + status */
    if (aid && CUR_SUBS[aid] && CUR_SUBS[aid][sid]) {
      CUR_SUBS[aid][sid].checked_file_url = url;
      CUR_SUBS[aid][sid].checked_file_name = file.name;
    }
    setTxt('srv-checked-status', '✓ Checked file uploaded: ' + file.name);
    toast('✓ Checked worksheet uploaded! The student can see it now.', 'ok');
  } catch (e) {
    toast('Upload failed: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload Checked File →';
  }
}

/* ════════════════════════════════════════════════
   ✅ NEW: Submission file ko sahi viewer me dikhao
════════════════════════════════════════════════ */
async function renderSubmissionFile(url, fname) {
  const fileEl = _('srv-file-area');
  if (!fileEl) return;

  /* purana blob memory se hatao */
  if (_srvBlobUrl) { try { URL.revokeObjectURL(_srvBlobUrl); } catch (e) {} _srvBlobUrl = null; }

  if (!url) {
    fileEl.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;">No file attached.</div>';
    return;
  }

  const name = (fname || url).toLowerCase();
  const clean = name.split('#')[0].split('?')[0];
  const ext = (clean.split('.').pop() || '').trim();

  const isImage = /^(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(ext);
  const isPdf = ext === 'pdf';
  const isOffice = /^(doc|docx|ppt|pptx|xls|xlsx)$/.test(ext);

  fileEl.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;"><span class="spinner" style="margin-right:8px;"></span>Loading file…</div>';

  /* ── WORD / PPT / EXCEL → Microsoft ka official viewer ── */
  if (isOffice) {
    const officeSrc = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(url);
    fileEl.innerHTML =
      '<iframe src="' + officeSrc + '" style="width:100%;height:68vh;border:none;border-radius:10px;background:#fff;" title="Submission"></iframe>';
    return;
  }

  /* ── PDF aur IMAGE ke liye file ko blob ki tarah laao ── */
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const raw = await resp.blob();
    const ctype = (resp.headers.get('content-type') || raw.type || '').toLowerCase();

    /* IMAGE */
    if (isImage || ctype.startsWith('image/')) {
      const b = URL.createObjectURL(raw);
      _srvBlobUrl = b;
      fileEl.innerHTML =
        '<img src="' + b + '" alt="Submission" style="max-width:100%;max-height:68vh;border-radius:10px;display:block;margin:0 auto;" oncontextmenu="return false;">';
      return;
    }

    /* PDF */
    if (isPdf || ctype.includes('pdf')) {
      const pdfBlob = (raw.type === 'application/pdf') ? raw : new Blob([raw], { type: 'application/pdf' });
      const b = URL.createObjectURL(pdfBlob);
      _srvBlobUrl = b;
      fileEl.innerHTML =
        '<iframe src="' + b + '#toolbar=0&navpanes=0&view=FitH" style="width:100%;height:68vh;border:none;border-radius:10px;" title="Submission"></iframe>';
      return;
    }

    /* koi aur type */
    fileEl.innerHTML =
      '<div style="padding:24px;text-align:center;color:#cbd5e1;font-size:13px;line-height:1.7;">'
      + 'This file cannot be previewed here (' + (ext || 'unknown') + ').<br><br>'
      + '<a href="' + url + '" target="_blank" rel="noopener" style="color:var(--teal);font-weight:600;">Open in new tab →</a>'
      + '</div>';
  } catch (e) {
    fileEl.innerHTML =
      '<div style="padding:24px;text-align:center;color:#e07070;font-size:13px;line-height:1.7;">'
      + 'Could not load the file.<br>(' + e.message + ')<br><br>'
      + '<a href="' + url + '" target="_blank" rel="noopener" style="color:var(--teal);font-weight:600;">Open in new tab →</a>'
      + '</div>';
  }
}

function closeSubReview() {
  const modal = _('sub-review-modal');
  if (modal) modal.style.display = 'none';
  /* blob memory se hatao */
  if (_srvBlobUrl) { try { URL.revokeObjectURL(_srvBlobUrl); } catch (e) {} _srvBlobUrl = null; }
  const fileEl = _('srv-file-area');
  if (fileEl) fileEl.innerHTML = '';
}

async function saveSubRemark() {
  const btn = _('srv-save-btn');
  const input = _('srv-remark-input');
  const subId = btn.dataset.subId;
  const remark = input.value.trim();
  if (!subId) {
    toast('Submission ID not found.', 'err');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Saving…';

  try {
    if (IS_LIVE) {
      const {
        error
      } = await sb.from('assignment_submissions')
        .update({
          teacher_remarks: remark
        })
        .eq('id', subId);
      if (error) throw error;
    }
    const aid = btn._metaAid;
    const sid = btn._metaSid;
    if (aid && CUR_SUBS[aid] && CUR_SUBS[aid][sid]) {
      CUR_SUBS[aid][sid].teacher_remarks = remark;
    }
    toast('✓ Comment saved! The student can see it now.', 'ok');
    closeSubReview();
    if (SEL_ASSIGN) renderSubList(CUR_SUBS[SEL_ASSIGN.id] || {});
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Save Comment';
  }
}

function goBack() {
  showScreen('s-dash');
  if (TEACHER && IS_LIVE) loadDashboard();
}