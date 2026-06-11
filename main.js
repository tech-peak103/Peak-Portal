'use strict';
const SUPABASE_URL = 'https://jcvqloukmjbkgxcufenz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdnFsb3VrbWpia2d4Y3VmZW56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTk5OTAsImV4cCI6MjA5NDIzNTk5MH0.aix0NiDBOkbPnSdEZugiMLSHglxFPUX8Mw1e8QVEwWs';
const IS_LIVE = !!(SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_URL.startsWith('https://'));
let sb = null;
if (IS_LIVE) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

/* ════════════════════════════════════════════════
   ✅ PAYMENT MASTER SWITCH
   ------------------------------------------------
   Payments are currently OFF (false).
   - The student will only see the subjects listed in their
     profiles.subjects (with a grade/board match).
     e.g. [{"name":"Economics","type":"group"},{"name":"Math","type":"individual"}]
   - All those subjects are shown ACTIVE/unlocked without payment,
     along with the teacher and a group/1-on-1 chip.

   👉 To turn payments back on, change false to true
      below. The entire old payment code is still
      present in this file, untouched.
════════════════════════════════════════════════ */
const PAYMENTS_ENABLED = false;

function saveSession(profile) { sessionStorage.setItem('pp_student', JSON.stringify(profile)); }
function loadSession() { try { return JSON.parse(sessionStorage.getItem('pp_student')); } catch { return null; } }
function clearSession() { sessionStorage.removeItem('pp_student'); }

/* ════════════════════════════════════════════════
   ✅ HELPERS — Per-subject fee and label
════════════════════════════════════════════════ */
/* ✅ fees jsonb parse + matching helpers (new schema) */
function parseFees(fees) {
  if (!fees) return [];
  if (typeof fees === 'string') { try { fees = JSON.parse(fees); } catch { return []; } }
  return Array.isArray(fees) ? fees : [];
}
function _feeMatchOne(val, target) {
  if (val == null || val === '') return true;               // empty = applies to everyone
  const list = String(val).split(',').map(x => x.trim().toLowerCase());
  if (list.includes('all')) return true;                    // "All" = applies to everyone
  return list.includes((target || '').toString().trim().toLowerCase());
}
function feeMatches(entry, grade, board) {
  return _feeMatchOne(entry.grade, grade) && _feeMatchOne(entry.board, board);
}
/* Is this assignment for this grade+board? (empty grade/board = applies to everyone) */
function assignmentInScope(a, grade, board) {
  const ag = a.grade, ab = a.board;
  const noScope = (ag == null || ag === '') && (ab == null || ab === '');
  if (noScope) return true;                       // old assignments = apply to everyone
  return _feeMatchOne(ag, grade) && _feeMatchOne(ab, board);
}
function feeNum(entry, classType) {
  if (!entry) return 0;
  const keys = classType === 'individual'
    ? ['individual_fee', 'individual-fee', 'individualFee', 'fee_individual', 'individual']
    : ['group_fee', 'group-fee', 'groupFee', 'fee_group', 'group'];
  for (const k of keys) { if (entry[k] != null) return Number(entry[k]) || 0; }
  return 0;
}
/* The correct fee entry based on the student's grade+board */
function getStudentFeeEntry(subject) {
  const fees = parseFees(subject && subject.fees);
  if (!fees.length) return null;
  const g = (PROFILE && PROFILE.class) || '';
  const b = (PROFILE && PROFILE.board) || '';
  return fees.find(f => feeMatches(f, g, b)) || fees[0];
}
function getGroupFee(subject) {
  return feeNum(getStudentFeeEntry(subject), 'group');
}
/* ✅ Converts raw score to a % using max_score, then computes the average */
function avgPercent(rows, maxMap) {
  const pcts = [];
  (rows || []).forEach(r => {
    const score = Number(r.student_score);
    if (isNaN(score)) return;
    const max = Number(maxMap[(r.name || '').trim()]) || 0;
    pcts.push(max > 0 ? (score / max) * 100 : score); // if max is unknown, use as-is
  });
  return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
}

function getIndividualFee(subject) {
  return feeNum(getStudentFeeEntry(subject), 'individual');
}

function getEnrolledClassType(subject) {
  return subject._class_type || 'group';
}

function getClassTypeLabel(subject) {
  const ct = getEnrolledClassType(subject);
  return ct === 'individual' ? '👤 1-on-1 Class' : '👥 Group Class';
}

const DEMO = {
  profile: { id: '', username: '', full_name: '', class: '', board: '', roll_number: '' },
  notices: [
    { type: 'urgent', title: 'There is nothing right now', created_at: '-' },
  ],
  subjects: [],
  monthly: {},
  assessments: {},
};

let PROFILE = null, SUBJECTS = [], CUR_SUBJ = null, CUR_METHOD = null;
let CUR_CLASS_TYPE = 'group';

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

let _toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.className = '', 2800);
}

function togglePass() {
  const i = document.getElementById('inp-pass');
  i.type = i.type === 'password' ? 'text' : 'password';
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function initials(name) {
  return (name || 'ST').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function setHeaderUser(p) {
  const n = p.full_name || 'Student';
  const rol = [p.class, p.board].filter(Boolean).join(' • ');
  const ini = initials(n);
  ['tb-av', 'tb2-av', 'tb3-av'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = ini; });
  ['tb-un', 'tb2-un', 'tb3-un'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = n; });
  ['tb-ur', 'tb2-ur', 'tb3-ur'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = rol; });
  document.getElementById('greet-name').textContent = n.split(' ')[0];
}

/* ── AUTH ── */
async function doLogin() {
  const btn = document.getElementById('login-btn');
  const user = document.getElementById('inp-user').value.trim().toLowerCase().replace(/\s+/g, '');
  const pass = document.getElementById('inp-pass').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  if (!user || !pass) {
    errEl.textContent = '⚠ Please enter both username and password.';
    errEl.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in…';
  try {
    if (!IS_LIVE) {
      await new Promise(r => setTimeout(r, 700));
      if (user !== 'aryan123' || pass !== 'demo1234') throw new Error('Demo login only');
      PROFILE = DEMO.profile;
    } else {
      const { data, error } = await sb.rpc('student_login', { p_username: user, p_password: pass });
      if (error) throw new Error('Login error: ' + error.message);
      if (!data || !data.success) throw new Error('Incorrect username and password.');
      PROFILE = data;
    }
    saveSession(PROFILE);
    setHeaderUser(PROFILE);
    document.getElementById('subj-lbl').textContent = ['Enrolled Subjects —', PROFILE.class || '', PROFILE.board ? '(' + PROFILE.board + ')' : ''].filter(Boolean).join(' ');
    await Promise.all([loadNotices(), loadSubjects()]);
    showScreen('s-dash');
    toast('Welcome back, ' + (PROFILE.full_name || '').split(' ')[0] + '!', 'ok');
  } catch (e) {
    errEl.textContent = '⚠ ' + (e.message || 'Login failed.');
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign in to portal';
  }
}

async function doLogout() {
  clearSession();
  PROFILE = null;
  SUBJECTS = [];
  CUR_SUBJ = null;
  showScreen('s-login');
  toast('Signed out successfully.');
}

/* ── NOTICES ── */
async function loadNotices() {
  let notices = DEMO.notices;
  if (IS_LIVE) {
    const { data, error } = await sb.from('notices').select('*').order('created_at', { ascending: false }).limit(5);
    if (!error && data?.length) notices = data;
  }
  document.getElementById('nb-ct').textContent = notices.length;
  document.getElementById('notice-list').innerHTML = notices.map(n => `
    <div class="ni">
      <div class="ndott ${n.type || 'info'}"></div>
      <div>
        <div class="ni-txt">${n.title}${n.body ? ' <span style="color:var(--muted)">— ' + n.body + '</span>' : ''}</div>
        <div class="ni-date">${fmtDate(n.created_at)}</div>
      </div>
    </div>`).join('');
  wireBell();   // 🔔 connect the bell icon to the notice board
}

/* ✅ Notification bell pe click → notice board tak le jao */
function scrollToNotices() {
  const el = document.getElementById('notice-list')
          || document.getElementById('nb-ct')
          || document.querySelector('.nb, .notice-board');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* Find the bell icon and attach a click handler (via 🔔 emoji or a bell class) */
function wireBell() {
  if (window._bellWired) return;
  let bell = document.getElementById('bell') || document.querySelector('.bell, [class*="bell"], [class*="notif"]');
  if (!bell) {
    // Find the leaf element containing the 🔔 emoji
    const nodes = document.querySelectorAll('span, button, a, i, div');
    for (const el of nodes) {
      if (el.children.length === 0 && /🔔/.test(el.textContent || '')) { bell = el; break; }
    }
  }
  if (bell) {
    const target = bell.closest('button, a') || bell;
    target.style.cursor = 'pointer';
    target.addEventListener('click', scrollToNotices);
    window._bellWired = true;
  }
}

/* ════════════════════════════════════════════════
   ✅ loadSubjects
   ------------------------------------------------
   PAYMENTS_ENABLED = false  → only enrolled subjects, all ACTIVE (no payment)
   PAYMENTS_ENABLED = true   → old behaviour (grade/board match + payment lock)
════════════════════════════════════════════════ */
async function loadSubjects() {
  if (!IS_LIVE) { SUBJECTS = DEMO.subjects; renderSubjects(SUBJECTS); return; }

  /* ════════════════════════════════════════════════
     ✅ PAYMENTS-OFF MODE
     Show subjects based on the list in the student's profile.
     profiles.subjects  ->  e.g. ["English","Economics","Maths"]
     Treat all those subjects as ACTIVE without payment.
     (Name case/spaces do not matter; it also matches by code.)
  ════════════════════════════════════════════════ */
  if (!PAYMENTS_ENABLED) {
    try {
      // Get the subjects listed in the profile.
      // First from login/session; if not found, fetch directly from the profiles table.
      let wanted = PROFILE.subjects;
      let prefType = PROFILE.preferred_class_type;

      if (wanted === undefined || wanted === null) {
        const { data: prof, error: pErr } = await sb
          .from('profiles')
          .select('subjects, preferred_class_type')
          .eq('id', PROFILE.id)
          .single();
        if (pErr) throw pErr;
        if (prof) {
          wanted = prof.subjects;
          if (!prefType) prefType = prof.preferred_class_type;
        }
      }

      // If it comes from the DB as a string, convert it to an array
      if (typeof wanted === 'string') {
        try { wanted = JSON.parse(wanted); }
        catch { wanted = wanted.split(',').map(x => x.trim()); }
      }
      if (!Array.isArray(wanted)) wanted = [];

      /* Normalize 'wanted'. BOTH formats work:
         1) Simple naam:       ["English","Economics","Maths"]
         2) Per-subject type:  [{"name":"English","type":"individual"},{"name":"Maths","type":"group"}]
      */
      const wantedList = wanted.map(item => {
        if (item && typeof item === 'object') {
          return {
            name: String(item.name || item.subject || '').trim(),
            type: String(item.type || item.class_type || '').trim().toLowerCase()
          };
        }
        return { name: String(item).trim(), type: '' };
      }).filter(x => x.name);

      const wantedSet = wantedList.map(x => x.name.toLowerCase());
      const typeByName = {};
      wantedList.forEach(x => { typeByName[x.name.toLowerCase()] = x.type; });

      console.log('[loadSubjects] profile subjects =', wanted);   // 🔍 debug
      if (!wantedSet.length) { SUBJECTS = []; renderSubjects([]); return; }

      // Student grade and board
      const grade = (PROFILE.class || '').toString().trim().toLowerCase();
      const board = (PROFILE.board || '').toString().trim().toLowerCase();

      // Fetch all subjects, then match by name/code + fees-scope (grade/board)
      const { data: allSubjects, error: sErr } = await sb.from('subjects').select('*');
      if (sErr) throw sErr;

      const picked = (allSubjects || []).filter(s => {
        const nameMatch = wantedSet.includes((s.name || '').trim().toLowerCase())
                       || wantedSet.includes((s.code || '').trim().toLowerCase());
        if (!nameMatch) return false;
        // Only show if the subject's fees array contains the student's grade+board.
        // If fees is empty, match by name only (no grade/board restriction).
        const fees = parseFees(s.fees);
        if (!fees.length) return true;
        return fees.some(f => feeMatches(f, grade, board));
      });

      console.log('[loadSubjects] matched subjects =', picked.map(s => s.name));  // 🔍 debug
      if (!picked.length) { SUBJECTS = []; renderSubjects([]); return; }

      const enriched = await Promise.all(picked.map(async s => {
        let done = 0, avg = 0;

        // Per-subject class type: first from the profile array, else preferred, else group
        const rawType = typeByName[(s.name || '').trim().toLowerCase()]
                     || typeByName[(s.code || '').trim().toLowerCase()]
                     || prefType || 'group';
        const subjType = /ind|1|one/.test(String(rawType).toLowerCase()) ? 'individual' : 'group';

        // Load stats (to show progress/avg)
        const [{ count }, { data: scores }, { data: pubAssigns }] = await Promise.all([
          sb.from('assessments').select('*', { count: 'exact', head: true }).eq('subject_id', s.id).eq('student_id', PROFILE.id),
          sb.from('assessments').select('student_score, name').eq('subject_id', s.id).eq('student_id', PROFILE.id),
          sb.from('assignments').select('title, max_score').eq('subject_id', s.id).eq('status', 'published')
        ]);
        done = count || 0;
        const maxMap = {};
        (pubAssigns || []).forEach(a => { maxMap[(a.title || '').trim()] = Number(a.max_score) || 0; });
        avg = avgPercent(scores, maxMap) || 0;

        return {
          ...s,
          _status: 'active',      // ✅ unlocked without payment
          _class_type: subjType,
          _done: done,
          _avg: avg,
          _due_in: 0,
          _last_paid: '—',
          _valid_until: '—',
          _validity_pct: 0
        };
      }));

      SUBJECTS = enriched;
      renderSubjects(enriched);
    } catch (e) {
      console.error('loadSubjects error:', e);
      toast('Could not load subjects: ' + e.message, 'err');
      SUBJECTS = [];
      renderSubjects([]);
    }
    return;
  }

  /* ════════════════════════════════════════════════
     ⬇️ OLD PAYMENT CODE (as it was before) ⬇️
     This only runs when PAYMENTS_ENABLED = true above.
     Matches comma-separated grade/board + payment lock.
  ════════════════════════════════════════════════ */
  try {
    const grade = (PROFILE.class || '').toString().trim();
    const board = (PROFILE.board || '').toString().trim();

    // Fetch all subjects, then filter by fees-scope (grade/board)
    const { data: allSubjects, error: sErr } = await sb.from('subjects').select('*');
    if (sErr) throw sErr;

    const rawSubjects = (allSubjects || []).filter(s => {
      const fees = parseFees(s.fees);
      if (!fees.length) return true;                       // no scope means it applies to everyone
      return fees.some(f => feeMatches(f, grade, board));
    });

    if (!rawSubjects?.length) { SUBJECTS = []; renderSubjects([]); return; }

    const sids = rawSubjects.map(s => s.id);
    const { data: enrollments } = await sb.from('student_subjects').select('*')
      .eq('student_id', PROFILE.id).in('subject_id', sids);
    const enrollMap = {};
    (enrollments || []).forEach(e => { enrollMap[e.subject_id] = e; });

    const enriched = await Promise.all(rawSubjects.map(async s => {
      const enroll = enrollMap[s.id];
      const status = !enroll ? 'locked'
                   : enroll.is_active ? 'active'
                   : enroll.payment_status === 'pending' ? 'pending'
                   : 'locked';

      /* ✅ Per-subject class_type from student_subjects */
      const classType = enroll?.class_type || 'group';

      let done = 0, avg = 0, dueIn = 0, lastPaid = '—', validUntil = '—', validityPct = 0;
      if (status === 'active') {
       const [{ count }, { data: scores }, { data: pubAssigns }] = await Promise.all([
          sb.from('assessments').select('*', { count: 'exact', head: true }).eq('subject_id', s.id).eq('student_id', PROFILE.id),
          sb.from('assessments').select('student_score, name').eq('subject_id', s.id).eq('student_id', PROFILE.id),
          sb.from('assignments').select('title, max_score').eq('subject_id', s.id).eq('status', 'published')
        ]);
        done = count || 0;
        const maxMap = {};
        (pubAssigns || []).forEach(a => { maxMap[(a.title || '').trim()] = Number(a.max_score) || 0; });
        avg = avgPercent(scores, maxMap) || 0; // ✅ as a %
        if (enroll && enroll.valid_until) {
          const exp = new Date(enroll.valid_until), today = new Date();
          dueIn = Math.max(0, Math.ceil((exp - today) / 86400000));
          validUntil = fmtDate(enroll.valid_until);
          validityPct = Math.max(0, Math.min(100, Math.round(dueIn / 30 * 100)));
        }
        const { data: lastPay } = await sb.from('payments').select('payment_date')
          .eq('subject_id', s.id).eq('student_id', PROFILE.id).eq('status', 'verified')
          .order('payment_date', { ascending: false }).limit(1);
        if (lastPay?.[0]) lastPaid = fmtDate(lastPay[0].payment_date);
      }
      return {
        ...s,
        _status: status,
        _class_type: classType,
        _done: done,
        _avg: avg,
        _due_in: dueIn,
        _last_paid: lastPaid,
        _valid_until: validUntil,
        _validity_pct: validityPct
      };
    }));
    SUBJECTS = enriched;
    renderSubjects(enriched);
  } catch (e) {
    console.error('loadSubjects error:', e);
    toast('Could not load subjects: ' + e.message, 'err');
    SUBJECTS = [];
    renderSubjects([]);
  }
}

function renderSubjects(list) {
  if (!list.length) {
    document.getElementById('subj-grid').innerHTML = '<div class="loading-state" style="grid-column:1/-1">No subjects found. Please contact admin.</div>';
    return;
  }
  document.getElementById('subj-grid').innerHTML = list.map(buildCard).join('');
}

/* ════════════════════════════════════════════════
   ✅ buildCard — LOCKED card pe DONO fees + choice
════════════════════════════════════════════════ */
function buildCard(s) {
  const cc = s.color_class || 'c1';

  /* ─── ACTIVE CARD ─── */
  if (s._status === 'active') {
    const pct = Math.round((s._done / s.total_assessments) * 100);
    const urgent = s._due_in > 0 && s._due_in <= 3;
    const classTypeLabel = getClassTypeLabel(s);
    return `<div class="sub-card clickable active-card ${cc}" onclick="openSubject('${s.id}')">
      <div class="si ${cc}">${s.icon}</div>
      <div class="sn">${s.name}</div>
      <div class="sm">${s.teacher}</div>
      <div class="class-type-chip">${classTypeLabel}</div>
      <div class="spb"><div class="spf" style="width:${pct}%"></div></div>
      <div class="spl"><span>${s._done}/${s.total_assessments} assessments</span><span>${pct}%</span></div>
      ${(PAYMENTS_ENABLED && s._due_in > 0) ? `<div class="due-chip ${urgent ? 'urgent' : ''}">
        ${urgent ? '🔴' : '💳'} Renewal in ${s._due_in}d</div>` : ''}
    </div>`;
  }

  /* ─── PENDING CARD ─── */
  if (s._status === 'pending') {
    const classTypeLabel = getClassTypeLabel(s);
    return `<div class="sub-card ${cc}">
      <div class="si ${cc}">${s.icon}</div>
      <div class="sn">${s.name}</div>
      <div class="sm">${s.teacher}</div>
      <div class="class-type-chip locked">${classTypeLabel}</div>
      <div class="lock-div"></div>
      <div class="pending-chip"><span class="pulse-dot"></span> Awaiting Verification</div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5;">Payment submitted. We'll activate within 24 hours.</div>
    </div>`;
  }

  /* ─── LOCKED CARD — DONO FEES + CHOICE ─── */
  const groupFee = getGroupFee(s);
  const indFee = getIndividualFee(s);
  const hasIndividual = indFee > 0;

  if (hasIndividual) {
    /* Show both options */
    return `<div class="sub-card ${cc}">
      <div class="si ${cc}">${s.icon}<span style="float:right;font-size:14px;color:var(--muted);">🔒</span></div>
      <div class="sn">${s.name}</div>
      <div class="sm">${s.teacher}</div>
      <div class="lock-div"></div>
      
      <div class="choose-label">Choose Class Type</div>
      
      <div class="fee-option-row" onclick="openPayment('${s.id}', 'group'); event.stopPropagation();">
        <div class="fee-opt-info">
          <span class="fee-opt-emoji">👥</span>
          <div>
            <div class="fee-opt-name">Group Class</div>
            <div class="fee-opt-price">₹${groupFee.toLocaleString('en-IN')}<span class="fee-opt-period">/month</span></div>
          </div>
        </div>
        <div class="fee-opt-arrow">→</div>
      </div>
      
      <div class="fee-option-row premium" onclick="openPayment('${s.id}', 'individual'); event.stopPropagation();">
        
        <div class="fee-opt-info">
          <span class="fee-opt-emoji">👤</span>
          <div>
            <div class="fee-opt-name">1-on-1 Class</div>
            <div class="fee-opt-price">₹${indFee.toLocaleString('en-IN')}<span class="fee-opt-period">/month</span></div>
          </div>
        </div>
        <div class="fee-opt-arrow">→</div>
      </div>
    </div>`;
  }

  /* Sirf group available */
  return `<div class="sub-card ${cc}">
    <div class="si ${cc}">${s.icon}<span style="float:right;font-size:14px;color:var(--muted);">🔒</span></div>
    <div class="sn">${s.name}</div>
    <div class="sm">${s.teacher}</div>
    <div class="class-type-chip locked">👥 Group Class</div>
    <div class="lock-div"></div>
    <div class="fee-row">
      <span class="fee-key">Monthly Fee</span>
      <span class="fee-val">₹${groupFee.toLocaleString('en-IN')}</span>
    </div>
    <button class="pay-now-btn" onclick="openPayment('${s.id}', 'group')">Pay Now →</button>
  </div>`;
}

/* ── SUBJECT DETAIL ── */
async function openSubject(subjectId) {
  const s = SUBJECTS.find(x => x.id === subjectId);
  if (!s) return;
  if (s._status !== 'active') {
    /* Locked card — the student will choose from the fee row */
    return;
  }
  CUR_SUBJ = s;
  document.getElementById('bc-name').textContent = s.name;
  const di = document.getElementById('d-icon');
  di.textContent = s.icon;
  di.className = `dh-icon ${s.color_class || 'c1'}`;
  document.getElementById('d-title').textContent = s.name;

  const classTypeLabel = getClassTypeLabel(s);
  document.getElementById('d-meta').innerHTML =
    `${s.teacher} <span style="margin:0 10px;opacity:.4;">•</span> <span style="color:var(--gold);font-weight:600;">${classTypeLabel}</span>`;

  renderAssessmentWidget(s);
  renderAvgWidget(s);

  /* ✅ Payments off — hide the pay/renewal widget.
     To enable, set PAYMENTS_ENABLED = true above. */
  if (PAYMENTS_ENABLED) {
    const _pw = document.getElementById('pay-widget');
    if (_pw) _pw.style.display = '';
    renderPayWidget(s);
  } else {
    const _pw = document.getElementById('pay-widget');
    if (_pw) _pw.style.display = 'none';
  }

  showScreen('s-detail');
  const [monthly, assessments] = await Promise.all([fetchMonthly(s.id), fetchAssessments(s.id)]);
  renderChart(monthly);
  renderTable(s, assessments);
  await loadAssignments(s.id);
}

function renderAssessmentWidget(s) {
  const pct = Math.round((s._done / s.total_assessments) * 100);
  const circ = 2 * Math.PI * 28, dash = (pct / 100) * circ;
  document.getElementById('ring-arc').setAttribute('stroke-dasharray', `${dash} ${circ}`);
  document.getElementById('ring-pct').textContent = pct + '%';
  document.getElementById('w-done').textContent = s._done;
  document.getElementById('w-tot').textContent = s.total_assessments;
  document.getElementById('w-rem').textContent = `${s.total_assessments - s._done} remaining`;
}

function renderAvgWidget(s) {
  const avg = s._avg || 0;
  const color = avg >= 80 ? 'var(--green)' : avg >= 60 ? 'var(--gold)' : 'var(--red)';
  document.getElementById('w-avg').textContent = avg;
  document.getElementById('w-avg').style.color = color;
  document.getElementById('avg-fill').style.width = avg + '%';
  document.getElementById('avg-fill').style.background = color;
  document.getElementById('w-vs').textContent = avg >= 75 ? '↑ Above class average' : '↓ Below class average';
}

function renderPayWidget(s) {
  const pw = document.getElementById('pay-widget');
  const pb = document.getElementById('pay-widget-body');
  const due = s._due_in || 0;
  const isDue = due > 0 && due <= 5;
  pw.className = 'widget ' + (isDue ? 'pay-due' : 'pay-active');
  const vc = due <= 3 ? 'var(--red)' : due <= 10 ? 'var(--orange)' : 'var(--green)';

  const ct = getEnrolledClassType(s);
  const applicableFee = ct === 'individual' ? getIndividualFee(s) : getGroupFee(s);
  const classTypeLabel = getClassTypeLabel(s);

  pb.innerHTML = `
    ${isDue ? `<div class="pay-due-banner">⚠️ <span class="pay-due-txt">Renewal due in ${due} day${due !== 1 ? 's' : ''}. Renew to avoid interruption.</span></div>` : ''}
    <div class="pr"><span class="pk">Class type</span><span class="pv" style="color:var(--gold);">${classTypeLabel}</span></div>
    <div class="pr"><span class="pk">Last payment</span><span class="pv">${s._last_paid}</span></div>
    <div class="pr"><span class="pk">Fee (monthly)</span><span class="pv">₹${applicableFee.toLocaleString('en-IN')}</span></div>
    <hr class="pd">
    <div class="pr"><span class="pk">Valid until</span><span class="pv">${s._valid_until}</span></div>
    <div class="pvbar"><div class="pvfill" style="width:${s._validity_pct || 0}%;background:${vc};"></div></div>
    <div class="pvlabel"><span>Active</span><span style="color:${vc};">${due} days left</span></div>
    ${!isDue ? '<div class="pay-status-chip">Subscription active</div>' :
      `<button class="renew-btn" onclick="openPayment('${s.id}', '${ct}')">Renew Now →</button>`}`;
}

async function fetchMonthly(subjectId) {
  if (!IS_LIVE) return [];
  const { data } = await sb.from('assessments')
    .select('conducted_month,student_score,class_avg_score')
    .eq('subject_id', subjectId).eq('student_id', PROFILE.id)
    .order('conducted_at', { ascending: true });
  const map = {};
  (data || []).forEach(r => {
    const m = r.conducted_month || '—';
    if (!map[m]) map[m] = { scores: [], avgs: [] };
    map[m].scores.push(Number(r.student_score));
    map[m].avgs.push(Number(r.class_avg_score));
  });
  return Object.entries(map).map(([month, v]) => ({
    month,
    score: Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length),
    avg: Math.round(v.avgs.reduce((a, b) => a + b, 0) / v.avgs.length),
  }));
}

function renderChart(data) {
  if (!data.length) {
    document.getElementById('chart-area').innerHTML = '<div class="loading-state">No assessment data yet.</div>';
    return;
  }
  const maxVal = Math.max(...data.map(d => d.score), ...data.map(d => d.avg), 1);
  document.getElementById('chart-area').innerHTML = data.map(d => `
    <div class="cbg">
      <div class="cbars">
        <div class="cbar" style="height:${(d.avg / maxVal) * 110}px;background:rgba(138,160,184,.32);"></div>
        <div class="cbar" style="height:${(d.score / maxVal) * 110}px;background:var(--gold);"></div>
      </div>
      <div class="cmonth">${d.month}</div>
    </div>`).join('');
}

async function fetchAssessments(subjectId) {
  if (!IS_LIVE) return [];
  const [{ data, error }, { data: pubAssigns }] = await Promise.all([
    sb.from('assessments')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('student_id', PROFILE.id)
      .order('conducted_at', { ascending: true }),
    sb.from('assignments').select('title, max_score').eq('subject_id', subjectId).eq('status', 'published')
  ]);
  if (error) return [];
  const maxMap = {};
  (pubAssigns || []).forEach(a => { maxMap[(a.title || '').trim()] = Number(a.max_score) || 0; });
  return (data || []).map(r => {
    const max = Number(maxMap[(r.name || '').trim()]) || 0;
    const rawScore = Number(r.student_score);
    const rawAvg = Number(r.class_avg_score);
    const pct = v => (max > 0 ? Math.round((Number(v) / max) * 100) : Number(v)); // for the bar
    return {
      name: r.name,
      max,                              // ✅ the max the teacher entered (e.g. 80 or 120)
      score: rawScore,                  // ✅ actual marks (raw)
      avg: rawAvg,                      // ✅ class avg actual marks (raw)
      scorePct: pct(rawScore),          // only for the bar width
      avgPct: pct(rawAvg),              // only for the bar width
      remarks: (r.remarks || '').trim()
    };
  });
}

function renderTable(s, assessments) {
  const done = assessments.length;
  const total = s.total_assessments;
  document.getElementById('tbl-meta').textContent = `${done} completed · ${total - done} upcoming`;

  const rows = assessments.map((a, i) => {
    const bc = a.scorePct >= 80 ? 'high' : a.scorePct >= 65 ? 'mid' : 'low';
    const maxTxt = a.max > 0 ? ' / ' + a.max : '';    // show max if it is known
    const teacherRemark = (a.remarks || '').trim();
    const remarkHTML = teacherRemark
      ? `<span style="display:inline-block;padding:4px 12px;background:rgba(0,184,180,0.1);border:1px solid rgba(0,184,180,0.25);border-radius:8px;color:var(--teal);font-size:12px;font-weight:500;white-space:nowrap;">${teacherRemark}</span>`
      : '<span style="color:var(--muted);font-size:12px;">—</span>';

    return `<tr>
      <td style="color:var(--muted);width:40px;">${String(i + 1).padStart(2, '0')}</td>
      <td style="font-weight:500;">${a.name}</td>
      <td><div class="sbw"><span style="color:var(--muted);">${a.scorePct}%</span>
        <div class="smb"><div class="smf mid" style="width:${a.scorePct}%"></div></div></div></td>
      <td><div class="sbw"><span>${a.score}${maxTxt}</span>
        <div class="smb"><div class="smf ${bc}" style="width:${a.scorePct}%"></div></div></div></td>
      <td>${remarkHTML}</td>
    </tr>`;
  });

  const upcoming = Array.from({ length: total - done }, () => `<tr class="upcoming"></tr>`);
  document.getElementById('asmnt-body').innerHTML = [...rows, ...upcoming].join('');

  /* ✅ Rename the "Class Avg" header to "Percentage" (no need to touch the HTML) */
  const _body = document.getElementById('asmnt-body');
  const _tbl = _body && _body.closest('table');
  if (_tbl) {
    _tbl.querySelectorAll('th').forEach(th => {
      if (/class\s*avg/i.test(th.textContent || '')) th.textContent = 'Percentage';
    });
  }
}

/* ════════════════════════════════════════════════
   ✅ openPayment — classType parameter accept
   (Payments are off, so nothing happens — just a toast.)
════════════════════════════════════════════════ */
function openPayment(subjectId, classType = 'group') {
  /* ✅ Payments are currently off — no payment screen will open.
     To enable, set PAYMENTS_ENABLED = true above. */
  if (!PAYMENTS_ENABLED) { toast('Payments are currently disabled.'); return; }

  const s = SUBJECTS.find(x => x.id === subjectId);
  if (!s) return;
  CUR_SUBJ = s;
  CUR_METHOD = null;
  CUR_CLASS_TYPE = classType;

  ['upi', 'bank', 'cash'].forEach(m => {
    document.getElementById(`mc-${m}`).classList.remove('sel');
    document.getElementById(`body-${m}`).style.display = 'none';
  });

  const upiUtr = document.getElementById('utr-upi');
  const bankUtr = document.getElementById('utr-bank');
  if (upiUtr) upiUtr.value = '';
  if (bankUtr) bankUtr.value = '';

  const btn = document.getElementById('pay-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Select a payment method to continue';

  const fee = classType === 'individual' ? getIndividualFee(s) : getGroupFee(s);
  const classTypeLabel = classType === 'individual' ? '👤 1-on-1 Class' : '👥 Group Class';
  const feeFormatted = fee.toLocaleString('en-IN');

  document.getElementById('pay-fee').textContent = feeFormatted;
  document.getElementById('pay-sname').textContent = `${s.name} (${classTypeLabel})`;
  document.getElementById('pay-sname2').textContent = `${s.name} — ${classTypeLabel}`;
  document.getElementById('pay-sicon').textContent = s.icon;
  document.getElementById('pay-bc').textContent = s.name + ' — Payment';
  document.getElementById('upi-fee').textContent = feeFormatted;
  document.getElementById('bank-fee').textContent = feeFormatted;
  document.getElementById('cash-fee').textContent = feeFormatted;
  document.getElementById('bank-roll').textContent = PROFILE?.roll_number || '—';
  showScreen('s-pay');
}

function selectMethod(m) {
  CUR_METHOD = m;
  ['upi', 'bank', 'cash'].forEach(x => {
    document.getElementById(`mc-${x}`).classList.toggle('sel', x === m);
    document.getElementById(`body-${x}`).style.display = x === m ? 'block' : 'none';
  });
  const btn = document.getElementById('pay-submit-btn');
  btn.disabled = false;
  btn.textContent = 'Submit & Notify Finance Team →';
}

/* ════════════════════════════════════════════════
   ✅ submitPayment — class_type save (per-subject)
   (Payments are off, so nothing will be submitted.)
════════════════════════════════════════════════ */
async function submitPayment() {
  /* ✅ Payments are currently off */
  if (!PAYMENTS_ENABLED) { toast('Payments are currently disabled.'); return; }

  if (!CUR_SUBJ || !CUR_METHOD) return;
  const btn = document.getElementById('pay-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Submitting…';
  const utr = CUR_METHOD === 'upi' ? (document.getElementById('utr-upi').value.trim() || null) :
              CUR_METHOD === 'bank' ? (document.getElementById('utr-bank').value.trim() || null) : null;

  const classType = CUR_CLASS_TYPE || 'group';
  const fee = classType === 'individual' ? getIndividualFee(CUR_SUBJ) : getGroupFee(CUR_SUBJ);

  try {
    if (IS_LIVE) {
      const today = new Date().toISOString().split('T')[0];
      const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { error: payErr } = await sb.from('payments').insert({
        student_id: PROFILE.id,
        subject_id: CUR_SUBJ.id,
        amount_inr: fee,
        class_type: classType,
        payment_method: CUR_METHOD,
        utr_reference: utr,
        status: 'pending',
        payment_date: today,
        valid_until: validUntil
      });
      if (payErr) throw payErr;

      const { error: enErr } = await sb.from('student_subjects').upsert({
        student_id: PROFILE.id,
        subject_id: CUR_SUBJ.id,
        is_active: false,
        payment_status: 'pending',
        class_type: classType
      }, { onConflict: 'student_id,subject_id' });
      if (enErr) throw enErr;
    }
    const subj = SUBJECTS.find(x => x.id === CUR_SUBJ.id);
    if (subj) {
      subj._status = 'pending';
      subj._class_type = classType;
    }
    toast("Payment submitted! We'll verify within 24 hours.", 'ok');
    await new Promise(r => setTimeout(r, 400));
    renderSubjects(SUBJECTS);
    showScreen('s-dash');
  } catch (e) {
    toast('Submission failed: ' + e.message, 'err');
    btn.disabled = false;
    btn.textContent = 'Submit & Notify Finance Team →';
  }
}

function goBack() { showScreen('s-dash'); }

/* ── SESSION RESTORE ── */
(function restoreSession() {
  const saved = loadSession();
  if (!saved) return;
  PROFILE = saved;
  setHeaderUser(saved);
  document.getElementById('subj-lbl').textContent = ['Enrolled Subjects —', saved.class || '', saved.board ? '(' + saved.board + ')' : ''].filter(Boolean).join(' ');
  Promise.all([loadNotices(), loadSubjects()]).then(() => showScreen('s-dash'));
})();

/* ════════════════════════════════════════════════
   ASSIGNMENTS SECTION
════════════════════════════════════════════════ */
let CURR_ASSIGN_ID = null, CURR_ASSIGN_DATA = null;
let _currentBlobUrl = null;  // ✅ to clean up the previous blob
let _blobUrls = {};          // ✅ a separate blob for each viewer container

(function applyProtections() {
  const modalOpen = () => {
    const m = document.getElementById('view-modal');
    return m && m.style.display === 'flex';
  };

  document.addEventListener('contextmenu', function (e) {
    if (modalOpen()) e.preventDefault();
  });

  // Ctrl/Cmd shortcuts (save, print, copy, select-all, view-source)
  document.addEventListener('keydown', function (e) {
    if (!modalOpen()) return;
    const key = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'c', 'a', 'u'].includes(key)) {
      e.preventDefault(); return false;
    }
    if (key === 'f12') { e.preventDefault(); return false; }
  });

  // ---- Blur guard: tab switch / window focus loss (Snipping Tool, alt-tab) ----
  function blurGuard() {
    if (!modalOpen()) return;
    const b = document.getElementById('view-modal-body');
    if (b) b.style.filter = 'blur(22px)';
  }
  function unblurGuard() {
    const b = document.getElementById('view-modal-body');
    if (b) b.style.filter = '';
  }
  document.addEventListener('visibilitychange', () => { document.hidden ? blurGuard() : unblurGuard(); });
  window.addEventListener('blur', blurGuard);
  window.addEventListener('focus', unblurGuard);

  // ---- PrintScreen deterrent (NOT a guarantee — see notes below) ----
  async function handlePrintScreen() {
    if (!modalOpen()) return;
    const b = document.getElementById('view-modal-body');
    if (b) {                       // content ko thodi der blur kar do
      b.style.filter = 'blur(22px)';
      setTimeout(() => { b.style.filter = ''; }, 1200);
    }
    try {                          // jo abhi clipboard me gaya use overwrite karne ki koshish
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(' ');
      }
    } catch (err) { /* focus/permission na ho to fail ho sakta hai */ }
  }

  // Windows Chrome/Edge me PrtSc aksar keyup pe fire hota hai, keydown pe nahi
  document.addEventListener('keyup', function (e) {
    if (e.key === 'PrintScreen') handlePrintScreen();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'PrintScreen') e.preventDefault();
  });
})();
async function loadAssignments(subjectId) {
  const section = document.getElementById('assign-section');
  const list = document.getElementById('assign-list-student');
  const lbl = document.getElementById('assign-count-lbl');
  if (!section) return;
  section.style.display = 'block';
  list.innerHTML = '<div class="loading-state">Loading assignments...</div>';
  try {
    const { data: assignsRaw, error } = await sb.from('assignments').select('*')
      .eq('subject_id', subjectId).eq('status', 'published').order('due_date');
    if (error) throw error;
    /* ✅ Only show assignments for the student's grade+board */
    const sg = (PROFILE.class || ''), sbd = (PROFILE.board || '');
    const assigns = (assignsRaw || []).filter(a => assignmentInScope(a, sg, sbd));
    if (!assigns || assigns.length === 0) {
      lbl.textContent = '0 assignments';
      list.innerHTML = '<div class="loading-state">No assignments yet.</div>';
      return;
    }
    const { data: subs } = await sb.from('assignment_submissions').select('*')
      .eq('student_id', PROFILE.id).in('assignment_id', assigns.map(a => a.id));
    const subMap = {};
    (subs || []).forEach(s => subMap[s.assignment_id] = s);
    window._assignCache = {};
    assigns.forEach(a => { window._assignCache[a.id] = a; });
    window._subCache = subMap;
    lbl.textContent = assigns.length + ' assignment' + (assigns.length !== 1 ? 's' : '');
    let rows = '';
    assigns.forEach((a, i) => {
      const sub = subMap[a.id];
      const daysLeft = Math.ceil((new Date(a.due_date) - new Date()) / 86400000);
      const overdue = daysLeft < 0;
      const dueLbl = overdue
        ? '<span style="color:var(--red);">Overdue ' + Math.abs(daysLeft) + 'd</span>'
        : daysLeft === 0
          ? '<span style="color:var(--orange);">Due today!</span>'
          : '<span style="color:var(--muted);">' + new Date(a.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '</span>';
      const statusHTML = sub ? '<span class="rmk excellent">Submitted</span>'
        : overdue ? '<span class="rmk below">Missed</span>'
        : '<span class="rmk average">Pending</span>';
      const safeTitle = (a.title || '').replace(/'/g, "\\'");
      const viewBtn = '<button onclick="viewAssignment(\'' + a.id + '\')" style="padding:5px 14px;background:transparent;color:var(--gold);border:1px solid var(--gold);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-right:6px;">👁 View</button>';
      const submitBtn = (!sub && !overdue)
        ? '<button onclick="openSubmitModal(\'' + a.id + '\',\'' + safeTitle + '\')" style="padding:5px 14px;background:var(--gold);color:#111;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">Submit</button>'
        : (sub && sub.file_url
          ? '<a href="' + sub.file_url + '" target="_blank" style="padding:5px 12px;background:transparent;color:var(--green);border:1px solid var(--green);border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">My Work</a>'
          : '<span style="font-size:12px;color:var(--muted);">No file</span>');
      rows += '<tr>'
        + '<td style="color:var(--muted);width:36px;">' + String(i + 1).padStart(2, '0') + '</td>'
        + '<td style="font-weight:500;">' + a.title + '</td>'
        + '<td style="color:var(--muted);font-size:13px;">' + (a.type || 'Assignment') + '</td>'
        + '<td>' + dueLbl + '</td>'
        + '<td style="text-align:center;">' + a.max_score + '</td>'
        + '<td>' + statusHTML + '</td>'
        + '<td style="white-space:nowrap;">' + viewBtn + submitBtn + '</td>'
        + '</tr>';
    });
    list.innerHTML = '<div style="overflow-x:auto;"><table><thead><tr>'
      + '<th>#</th><th>Assignment</th><th>Type</th><th>Due Date</th><th>Max</th><th>Status</th><th>Action</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  } catch (e) {
    list.innerHTML = '<div class="loading-state" style="color:var(--red);">Error: ' + e.message + '</div>';
  }
}

async function viewAssignment(assignId) {
  const a = (window._assignCache || {})[assignId];
  const sub = (window._subCache || {})[assignId];
  if (!a) return;
  CURR_ASSIGN_DATA = a;
  const daysLeft = Math.ceil((new Date(a.due_date) - new Date()) / 86400000);
  const overdue = daysLeft < 0;
  const duePill = overdue
    ? '<span style="background:rgba(252,129,129,.15);color:#fc8181;padding:4px 12px;border-radius:20px;font-size:12px;">Overdue by ' + Math.abs(daysLeft) + ' day(s)</span>'
    : daysLeft === 0
      ? '<span style="background:rgba(246,173,85,.15);color:#f6ad55;padding:4px 12px;border-radius:20px;font-size:12px;">Due Today!</span>'
      : '<span style="background:rgba(104,211,145,.15);color:#68d391;padding:4px 12px;border-radius:20px;font-size:12px;">Due in ' + daysLeft + ' day(s)</span>';
  const wName = (PROFILE.full_name || 'Student').toUpperCase();
  const wRoll = PROFILE.roll_number || '';
  const wText = wName + (wRoll ? '  |  ' + wRoll : '');
  let contentHTML = '';
  if (a.file_url) {
    /* ✅ Show a placeholder first; the PDF loads later as a blob (to prevent downloads) */
    const wmRow = Array(30).fill('<span style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap;letter-spacing:1px;padding:0 20px;">' + wText + '</span>').join('');
    contentHTML = '<div style="position:relative;border-radius:10px;overflow:hidden;background:#1a1a2e;">'
      + '<div style="position:absolute;inset:0;z-index:20;pointer-events:none;">'
      + '<div style="position:absolute;inset:0;overflow:hidden;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:30px 10px;transform:rotate(-30deg) scale(1.8);opacity:0.12;">' + wmRow + wmRow + wmRow + '</div>'
      + '<div style="position:absolute;bottom:14px;right:16px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:1px;">' + wText + '</div>'
      + '<div style="position:absolute;top:14px;left:16px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:1px;">' + wText + '</div>'
      + '</div>'
      + '<div id="pdf-frame-container" style="width:100%;height:72vh;min-height:500px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;">'
      + '<span class="spinner" style="margin-right:10px;"></span>Loading worksheet…'
      + '</div>'
      + '</div>';
  } else if (a.instructions) {
    contentHTML = '<div style="position:relative;border-radius:10px;overflow:hidden;">'
      + '<div style="position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:40px;transform:rotate(-25deg) scale(1.4);opacity:0.08;">'
      + Array(20).fill('<span style="font-size:13px;font-weight:700;color:#c0a060;white-space:nowrap;">' + wText + '</span>').join('')
      + '</div>'
      + '<div style="position:relative;z-index:1;padding:24px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;font-size:14px;line-height:1.9;color:var(--cream);user-select:none;-webkit-user-select:none;" oncontextmenu="return false;" onselectstart="return false;">' + a.instructions + '</div>'
      + '</div>';
  } else {
    contentHTML = '<div style="padding:20px;text-align:center;color:var(--muted);">No content available.</div>';
  }
  const teacherComment = (sub && sub.teacher_remarks && sub.teacher_remarks.trim())
    ? '<div style="margin-top:12px;padding:14px 16px;background:rgba(0,184,180,0.08);border:1px solid rgba(0,184,180,0.28);border-radius:10px;">'
      + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--teal);font-weight:700;margin-bottom:6px;">📝 Teacher\'s Comment</div>'
      + '<div style="font-size:13.5px;color:var(--cream);line-height:1.65;">' + sub.teacher_remarks + '</div></div>'
    : '';
  const footerHTML = sub
    ? '<div style="padding:14px 18px;background:rgba(72,199,142,0.1);border:1px solid rgba(72,199,142,0.3);border-radius:10px;display:flex;align-items:center;gap:12px;"><span style="font-size:22px;">✅</span><div><div style="color:#68d391;font-weight:600;">Assignment Submitted</div><div style="font-size:12px;color:var(--muted);">' + new Date(sub.submitted_at).toLocaleString('en-IN') + '</div></div></div>' + teacherComment
    : overdue
      ? '<div style="padding:14px;background:rgba(252,129,129,0.1);border:1px solid rgba(252,129,129,0.3);border-radius:10px;color:#fc8181;font-weight:600;">Deadline passed — Submission closed</div>'
      : '<div style="text-align:right;"><button onclick="closeViewModal();openSubmitModal(\'' + a.id + '\',\'' + (a.title || '').replace(/'/g, "\\'") + '\');" style="padding:11px 28px;background:var(--gold);color:#111;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">Submit Assignment →</button></div>';
  /* ✅ If the teacher uploaded a checked worksheet, show it */
  const checkedBlock = (sub && sub.checked_file_url)
    ? '<div style="margin-top:18px;">'
      + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gold);font-weight:700;margin-bottom:8px;">📄 Checked Worksheet (by Teacher)</div>'
      + '<div id="checked-frame-container" style="width:100%;height:62vh;min-height:420px;display:flex;align-items:center;justify-content:center;background:#1a1a2e;border-radius:10px;color:#fff;font-size:13px;"><span class="spinner" style="margin-right:10px;"></span>Loading checked worksheet…</div>'
      + '</div>'
    : '';
  document.getElementById('view-modal-body').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">'
    + '<div><div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:5px;">' + (a.type || 'Assignment') + '</div>'
    + '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:700;color:var(--cream);">' + a.title + '</div></div>'
    + '<button onclick="closeViewModal()" style="background:rgba(255,255,255,0.07);border:none;color:var(--muted);font-size:18px;cursor:pointer;border-radius:50%;width:34px;height:34px;">&times;</button>'
    + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'
    + duePill + '<span style="background:rgba(255,255,255,0.07);color:var(--cream);padding:4px 12px;border-radius:20px;font-size:12px;">Max: ' + a.max_score + ' marks</span>'
    + '</div>'
    + contentHTML
    + '<div style="margin-top:18px;">' + footerHTML + '</div>'
    + checkedBlock;

  /* ✅ Make the modal a bit wider */
  const _vm = document.getElementById('view-modal');
  let _card = document.getElementById('view-modal-body');
  while (_card && _card.parentElement && _card.parentElement.id !== 'view-modal') _card = _card.parentElement;
  if (_card) { _card.style.maxWidth = '1150px'; _card.style.width = '94vw'; }

  document.getElementById('view-modal').style.display = 'flex';

  /* ✅ Show both the worksheet and (if any) the checked worksheet as blobs */
  if (a.file_url) loadPdfBlob(a.file_url, 'pdf-frame-container');
  if (sub && sub.checked_file_url) loadPdfBlob(sub.checked_file_url, 'checked-frame-container');
}

/* ════════════════════════════════════════════════
   ✅ NEW: Show the PDF via a blob (download fix)
════════════════════════════════════════════════ */
/* ✅ PDF.js ko ek hi baar load karo (mobile + desktop dono ke liye) */
async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    sc.onload = resolve;
    sc.onerror = () => reject(new Error('PDF.js load failed'));
    document.head.appendChild(sc);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return window.pdfjsLib;
}

/* ✅ PDF / IMAGE / OFFICE — sabko inline dikhao (mobile fix) */
async function loadPdfBlob(url, containerId = 'pdf-frame-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  /* pichla blob free karo */
  if (_blobUrls[containerId]) { try { URL.revokeObjectURL(_blobUrls[containerId]); } catch (e) {} _blobUrls[containerId] = null; }

  const cleanUrl = url.split('#')[0].split('?')[0].toLowerCase();
  const ext = (cleanUrl.split('.').pop() || '').trim();
  const isImage  = /^(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(ext);
  const isPdf    = ext === 'pdf';
  const isOffice = /^(doc|docx|ppt|pptx|xls|xlsx)$/.test(ext);

  container.style.display = 'block';

  /* ── WORD / PPT / EXCEL → Microsoft viewer ── */
  if (isOffice) {
    const officeSrc = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(url);
    container.innerHTML =
      '<iframe src="' + officeSrc + '" style="width:100%;height:72vh;min-height:500px;border:none;display:block;background:#fff;" title="Assignment Viewer"></iframe>';
    return;
  }

  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const raw = await resp.blob();
    const ctype = (resp.headers.get('content-type') || raw.type || '').toLowerCase();

    /* ── IMAGE ── */
    if (isImage || ctype.startsWith('image/')) {
      const blobUrl = URL.createObjectURL(raw);
      _blobUrls[containerId] = blobUrl;
      container.innerHTML =
        '<div style="width:100%;height:72vh;min-height:500px;overflow:auto;display:flex;align-items:flex-start;justify-content:center;background:#0d0d18;padding:16px;box-sizing:border-box;">'
        + '<img src="' + blobUrl + '" style="max-width:100%;height:auto;border-radius:6px;" oncontextmenu="return false;" draggable="false" alt="Worksheet" />'
        + '</div>';
      return;
    }

    /* ── PDF → PDF.js se canvas pe render (mobile + desktop) ── */
    if (isPdf || ctype.includes('pdf')) {
      const pdfjsLib = await ensurePdfJs();
      const arrayBuffer = await raw.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      container.innerHTML = '';
      const scroller = document.createElement('div');
      scroller.style.cssText =
        'width:100%;height:72vh;min-height:500px;overflow:auto;background:#0d0d18;padding:10px;box-sizing:border-box;-webkit-overflow-scrolling:touch;';
      scroller.oncontextmenu = () => false;
      container.appendChild(scroller);

      const dpr = window.devicePixelRatio || 1;
      const availW = (scroller.clientWidth || container.clientWidth || 350) - 20;

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const cssScale = availW / base.width;                 // screen width fit
        const vp = page.getViewport({ scale: cssScale * dpr }); // sharp render

        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.cssText =
          'display:block;margin:0 auto 12px;width:100%;max-width:' + (base.width * cssScale) + 'px;height:auto;border-radius:6px;';
        canvas.oncontextmenu = () => false;
        scroller.appendChild(canvas);

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      }
      return;
    }

    /* ── koi aur type ── */
    container.style.display = 'flex';
    container.innerHTML =
      '<div style="padding:30px;text-align:center;color:#cbd5e1;font-size:13px;line-height:1.7;">'
      + 'This file cannot be previewed here (type: ' + (ext || 'unknown') + ').<br><br>'
      + '<a href="' + url + '" target="_blank" rel="noopener" style="color:#f5c200;font-weight:600;">Open in new tab →</a></div>';
  } catch (e) {
    container.style.display = 'flex';
    container.innerHTML =
      '<div style="padding:30px;text-align:center;color:#fc8181;font-size:13px;line-height:1.7;">'
      + 'Could not load the worksheet.<br>(' + e.message + ')<br><br>'
      + '<a href="' + url + '" target="_blank" rel="noopener" style="color:#f5c200;font-weight:600;">Open in new tab →</a></div>';
  }
}
function closeViewModal() {
  document.getElementById('view-modal').style.display = 'none';
  /* free all viewer blobs from memory */
  if (_currentBlobUrl) { try { URL.revokeObjectURL(_currentBlobUrl); } catch (e) {} _currentBlobUrl = null; }
  Object.keys(_blobUrls).forEach(k => { try { URL.revokeObjectURL(_blobUrls[k]); } catch (e) {} });
  _blobUrls = {};
  const c = document.getElementById('pdf-frame-container');
  if (c) c.innerHTML = '';
}

function openSubmitModal(assignId, assignTitle) {
  CURR_ASSIGN_ID = assignId;
  document.getElementById('modal-assign-title').textContent = assignTitle;
  document.getElementById('submit-file-input').value = '';
  document.getElementById('submit-err').style.display = 'none';
  document.getElementById('submit-modal').style.display = 'flex';
}

function closeSubmitModal() {
  document.getElementById('submit-modal').style.display = 'none';
  CURR_ASSIGN_ID = null;
}

async function doSubmitAssignment() {
  const file = document.getElementById('submit-file-input').files[0];
  const err = document.getElementById('submit-err');
  err.style.display = 'none';
  if (!file) { err.textContent = 'Please select a file.'; err.style.display = 'block'; return; }
  if (!CURR_ASSIGN_ID) return;
  const btn = document.querySelector('#submit-modal button[onclick="doSubmitAssignment()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
  try {
    const path = PROFILE.id + '/' + CURR_ASSIGN_ID + '/' + Date.now() + '_' + file.name;
    let fileUrl = '';
    const { error: ue } = await sb.storage.from('peak-submissions').upload(path, file, { upsert: true });
    if (!ue) fileUrl = sb.storage.from('peak-submissions').getPublicUrl(path).data.publicUrl;
    const { error: ie } = await sb.from('assignment_submissions').upsert({
      assignment_id: CURR_ASSIGN_ID,
      student_id: PROFILE.id,
      file_url: fileUrl,
      file_name: file.name,
      file_size: file.size,
      status: 'submitted',
      submitted_at: new Date().toISOString()
    }, { onConflict: 'assignment_id,student_id' });
    if (ie) throw ie;
    closeSubmitModal();
    toast('Assignment submitted successfully!', 'ok');
    await loadAssignments(CUR_SUBJ.id);
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
  }
}