'use strict';
const SUPABASE_URL = 'https://jcvqloukmjbkgxcufenz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdnFsb3VrbWpia2d4Y3VmZW56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTk5OTAsImV4cCI6MjA5NDIzNTk5MH0.aix0NiDBOkbPnSdEZugiMLSHglxFPUX8Mw1e8QVEwWs';
const IS_LIVE = !!(SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_URL.startsWith('https://'));
let sb = null;
if (IS_LIVE) { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); }

function saveSession(profile) { sessionStorage.setItem('pp_student', JSON.stringify(profile)); }
function loadSession() { try { return JSON.parse(sessionStorage.getItem('pp_student')); } catch { return null; } }
function clearSession() { sessionStorage.removeItem('pp_student'); }

const LOGO = '';

const DEMO = {
  profile: { id: '', username: '', full_name: '', class: '', board: '', roll_number: '' },
  notices: [
    { type: 'urgent', title: 'Mid-term schedule released — check your timetable.', created_at: 'Today, 09:15 AM' },
    { type: 'info',   title: 'New study material uploaded for Advanced Mathematics.', created_at: 'Yesterday, 2:30 PM' },
    { type: 'success',title: 'Physics Unit Test 3 results are now available.', created_at: '12 May 2026' },
    { type: 'info',   title: 'Holiday on 16th May. Make-up session on 18th May.', created_at: '10 May 2026' },
  ],
  subjects: [
    { id:'1', name:'Advanced Mathematics', code:'MATH 301', teacher:'Dr. R. Sharma', icon:'📐', color_class:'c1', fee_inr:4500, total_assessments:10, _status:'active',  _done:7, _avg:79, _due_in:2,  _last_paid:'01 May 2026', _valid_until:'31 May 2026', _validity_pct:6  },
    { id:'2', name:'Physics',              code:'PHY 201',  teacher:'Ms. P. Arora',  icon:'⚗️', color_class:'c2', fee_inr:4200, total_assessments:10, _status:'pending', _done:0, _avg:0,  _due_in:0,  _last_paid:'—',            _valid_until:'—',           _validity_pct:0  },
    { id:'3', name:'Biology',              code:'BIO 201',  teacher:'Mr. K. Mehta',  icon:'🧬', color_class:'c3', fee_inr:3800, total_assessments:10, _status:'active',  _done:8, _avg:85, _due_in:17, _last_paid:'01 May 2026', _valid_until:'31 May 2026', _validity_pct:45 },
    { id:'4', name:'Computer Science',     code:'CS 401',   teacher:'Ms. S. Verma',  icon:'💻', color_class:'c4', fee_inr:5000, total_assessments:10, _status:'locked',  _done:0, _avg:0,  _due_in:0,  _last_paid:'—',            _valid_until:'—',           _validity_pct:0  },
    { id:'5', name:'Chemistry',            code:'CHEM 201', teacher:'Dr. A. Nair',   icon:'🧪', color_class:'c5', fee_inr:4200, total_assessments:10, _status:'locked',  _done:0, _avg:0,  _due_in:0,  _last_paid:'—',            _valid_until:'—',           _validity_pct:0  },
    { id:'6', name:'English Literature',   code:'ENG 101',  teacher:'Ms. D. Kapoor', icon:'📖', color_class:'c6', fee_inr:3500, total_assessments:10, _status:'active',  _done:9, _avg:90, _due_in:17, _last_paid:'01 May 2026', _valid_until:'31 May 2026', _validity_pct:45 },
  ],
  monthly: {
    '1':[62,70,65,78,82,88], '2':[55,60,58,70,65,72],
    '3':[78,80,85,82,88,91], '4':[50,62,68,74,70,78],
    '5':[45,52,48,60,58,65], '6':[82,85,88,90,87,92],
  },
  assessments: {
    '1':[{name:'Unit Test 1',avg:71,score:78,remarks:'Good work!'},{name:'Unit Test 2',avg:68,score:82,remarks:'Excellent!'},{name:'Mid-Term',avg:65,score:74,remarks:'Keep it up'},{name:'Unit Test 3',avg:72,score:69,remarks:''},{name:'Project',avg:75,score:88,remarks:'Outstanding!'},{name:'Unit Test 4',avg:70,score:85,remarks:'Very good'},{name:'Quiz',avg:66,score:72,remarks:''}],
    '3':[{name:'Unit Test 1',avg:70,score:78,remarks:'Good'},{name:'Lab Report 1',avg:72,score:80,remarks:'Well done'},{name:'Unit Test 2',avg:74,score:85,remarks:'Excellent!'}],
    '6':[{name:'Unit Test 1',avg:76,score:82,remarks:'Brilliant!'},{name:'Essay Writing',avg:74,score:85,remarks:'Superb writing'}],
  },
};

let PROFILE = null, SUBJECTS = [], CUR_SUBJ = null, CUR_METHOD = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}
let _toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'show ' + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.className = '', 2800);
}
function togglePass() { const i = document.getElementById('inp-pass'); i.type = i.type === 'password' ? 'text' : 'password'; }
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
  catch { return d; }
}
function initials(name) { return (name || 'ST').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }
function setHeaderUser(p) {
  const n = p.full_name || 'Student';
  const rol = [p.class, p.board].filter(Boolean).join(' — ');
  const ini = initials(n);
  ['tb-av','tb2-av','tb3-av'].forEach(id => { const e = document.getElementById(id); if(e) e.textContent = ini; });
  ['tb-un','tb2-un','tb3-un'].forEach(id => { const e = document.getElementById(id); if(e) e.textContent = n; });
  ['tb-ur','tb2-ur','tb3-ur'].forEach(id => { const e = document.getElementById(id); if(e) e.textContent = rol; });
  document.getElementById('greet-name').textContent = n.split(' ')[0];
}

/* ── AUTH ── */
async function doLogin() {
  const btn = document.getElementById('login-btn');
  const user = document.getElementById('inp-user').value.trim().toLowerCase().replace(/\s+/g, '');
  const pass = document.getElementById('inp-pass').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  if (!user || !pass) { errEl.textContent = '⚠ Username aur password dono daalo.'; errEl.style.display = 'block'; return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in…';
  try {
    if (!IS_LIVE) {
      await new Promise(r => setTimeout(r, 700));
      if (user !== 'aryan123' || pass !== 'demo1234') throw new Error('Demo: username = aryan123, password = demo1234');
      PROFILE = DEMO.profile;
    } else {
      const { data, error } = await sb.rpc('student_login', { p_username: user, p_password: pass });
      if (error) throw new Error('Login error: ' + error.message);
      if (!data || !data.success) throw new Error('Galat username ya password.');
      PROFILE = data;
    }
    saveSession(PROFILE);
    setHeaderUser(PROFILE);
    document.getElementById('subj-lbl').textContent = ['Enrolled Subjects —', PROFILE.class || '', PROFILE.board ? '(' + PROFILE.board + ')' : ''].filter(Boolean).join(' ');
    await Promise.all([loadNotices(), loadSubjects()]);
    showScreen('s-dash');
    toast('Welcome back, ' + (PROFILE.full_name || '').split(' ')[0] + '!', 'ok');
  } catch(e) {
    errEl.textContent = '⚠ ' + (e.message || 'Login failed.');
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign in to portal';
  }
}
async function doLogout() {
  clearSession(); PROFILE = null; SUBJECTS = []; CUR_SUBJ = null;
  showScreen('s-login'); toast('Signed out successfully.');
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
      <div class="ndott ${n.type||'info'}"></div>
      <div>
        <div class="ni-txt">${n.title}${n.body ? ' <span style="color:var(--muted)">— '+n.body+'</span>' : ''}</div>
        <div class="ni-date">${n.created_at}</div>
      </div>
    </div>`).join('');
}

/* ── SUBJECTS ── */
async function loadSubjects() {
  if (!IS_LIVE) { SUBJECTS = DEMO.subjects; renderSubjects(SUBJECTS); return; }
  try {
    const grade = PROFILE.class || '', board = PROFILE.board || '';
    const { data: rawSubjects, error: sErr } = await sb.from('subjects').select('*')
      .or(`grade.eq.${grade},grade.eq.All`).or(`board.eq.${board},board.eq.All`);
    if (sErr) throw sErr;
    if (!rawSubjects?.length) { SUBJECTS = []; renderSubjects([]); return; }
    const sids = rawSubjects.map(s => s.id);
    const { data: enrollments } = await sb.from('student_subjects').select('*')
      .eq('student_id', PROFILE.id).in('subject_id', sids);
    const enrollMap = {};
    (enrollments || []).forEach(e => { enrollMap[e.subject_id] = e; });
    const enriched = await Promise.all(rawSubjects.map(async s => {
      const enroll = enrollMap[s.id];
      const status = !enroll ? 'locked' : enroll.is_active ? 'active' : enroll.payment_status === 'pending' ? 'pending' : 'locked';
      let done = 0, avg = 0, dueIn = 0, lastPaid = '—', validUntil = '—', validityPct = 0;
      if (status === 'active') {
        const [{ count }, { data: scores }] = await Promise.all([
          sb.from('assessments').select('*', { count:'exact', head:true }).eq('subject_id', s.id).eq('student_id', PROFILE.id),
          sb.from('assessments').select('student_score').eq('subject_id', s.id).eq('student_id', PROFILE.id)
        ]);
        done = count || 0;
        const vals = (scores || []).map(r => Number(r.student_score));
        avg = vals.length ? Math.round(vals.reduce((a,b) => a+b, 0) / vals.length) : 0;
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
      return { ...s, _status:status, _done:done, _avg:avg, _due_in:dueIn, _last_paid:lastPaid, _valid_until:validUntil, _validity_pct:validityPct };
    }));
    SUBJECTS = enriched; renderSubjects(enriched);
  } catch(e) {
    console.error('loadSubjects error:', e);
    toast('Could not load subjects: ' + e.message, 'err');
    SUBJECTS = []; renderSubjects([]);
  }
}

function renderSubjects(list) {
  if (!list.length) {
    document.getElementById('subj-grid').innerHTML = '<div class="loading-state" style="grid-column:1/-1">No subjects found. Please contact admin.</div>';
    return;
  }
  document.getElementById('subj-grid').innerHTML = list.map(buildCard).join('');
}

function buildCard(s) {
  const cc = s.color_class || 'c1';
  if (s._status === 'active') {
    const pct = Math.round((s._done / s.total_assessments) * 100);
    const urgent = s._due_in > 0 && s._due_in <= 3;
    return `<div class="sub-card clickable active-card ${cc}" onclick="openSubject('${s.id}')">
      <div class="si ${cc}">${s.icon}</div>
      <div class="sn">${s.name}</div><div class="sm">${s.teacher}</div>
      <div class="spb"><div class="spf" style="width:${pct}%"></div></div>
      <div class="spl"><span>${s._done}/${s.total_assessments} assessments</span><span>${pct}%</span></div>
      ${s._due_in > 0 ? `<div class="due-chip ${urgent?'urgent':''}">
        ${urgent?'🔴':'💳'} Renewal in ${s._due_in}d</div>` : ''}
    </div>`;
  }
  if (s._status === 'pending') {
    return `<div class="sub-card ${cc}">
      <div class="si ${cc}">${s.icon}</div><div class="sn">${s.name}</div><div class="sm">${s.teacher}</div>
      <div class="lock-div"></div>
      <div class="pending-chip"><span class="pulse-dot"></span> Awaiting Verification</div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5;">Payment submitted. We'll activate within 24 hours.</div>
    </div>`;
  }
  return `<div class="sub-card ${cc}">
    <div class="si ${cc}">${s.icon}<span style="float:right;font-size:14px;color:var(--muted);">🔒</span></div>
    <div class="sn">${s.name}</div><div class="sm">${s.teacher}</div>
    <div class="lock-div"></div>
    <div class="fee-row"><span class="fee-key">Monthly Fee</span><span class="fee-val">₹${(s.fee_inr||0).toLocaleString('en-IN')}</span></div>
    <button class="pay-now-btn" onclick="openPayment('${s.id}')">Pay Now →</button>
  </div>`;
}

/* ── SUBJECT DETAIL ── */
async function openSubject(subjectId) {
  const s = SUBJECTS.find(x => x.id === subjectId);
  if (!s) return;
  if (s._status !== 'active') { openPayment(subjectId); return; }
  CUR_SUBJ = s;
  document.getElementById('bc-name').textContent = s.name;
  const di = document.getElementById('d-icon');
  di.textContent = s.icon; di.className = `dh-icon ${s.color_class||'c1'}`;
  document.getElementById('d-title').textContent = s.name;
  document.getElementById('d-meta').textContent = s.teacher;
  renderAssessmentWidget(s); renderAvgWidget(s); renderPayWidget(s);
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
  pb.innerHTML = `
    ${isDue ? `<div class="pay-due-banner">⚠️ <span class="pay-due-txt">Renewal due in ${due} day${due!==1?'s':''}. Renew to avoid interruption.</span></div>` : ''}
    <div class="pr"><span class="pk">Last payment</span><span class="pv">${s._last_paid}</span></div>
    <div class="pr"><span class="pk">Fee (monthly)</span><span class="pv">₹${(s.fee_inr||0).toLocaleString('en-IN')}</span></div>
    <hr class="pd">
    <div class="pr"><span class="pk">Valid until</span><span class="pv">${s._valid_until}</span></div>
    <div class="pvbar"><div class="pvfill" style="width:${s._validity_pct||0}%;background:${vc};"></div></div>
    <div class="pvlabel"><span>Active</span><span style="color:${vc};">${due} days left</span></div>
    ${!isDue ? '<div class="pay-status-chip">Subscription active</div>' :
      `<button class="renew-btn" onclick="openPayment('${s.id}')">Renew Now →</button>`}`;
}

/* ── MONTHLY CHART ── */
async function fetchMonthly(subjectId) {
  if (!IS_LIVE) {
    const bars = DEMO.monthly[subjectId] || [60,65,70,72,75,78];
    const m = ['Jan','Feb','Mar','Apr','May','Jun'];
    return m.map((month, i) => ({ month, score: bars[i]||0, avg: Math.round((bars[i]||0)*.87) }));
  }
  const { data } = await sb.from('assessments')
    .select('conducted_month,student_score,class_avg_score')
    .eq('subject_id', subjectId).eq('student_id', PROFILE.id)
    .order('conducted_at', { ascending: true });
  const map = {};
  (data || []).forEach(r => {
    const m = r.conducted_month || '—';
    if (!map[m]) map[m] = { scores:[], avgs:[] };
    map[m].scores.push(Number(r.student_score));
    map[m].avgs.push(Number(r.class_avg_score));
  });
  return Object.entries(map).map(([month, v]) => ({
    month,
    score: Math.round(v.scores.reduce((a,b) => a+b, 0) / v.scores.length),
    avg:   Math.round(v.avgs.reduce((a,b) => a+b, 0) / v.avgs.length),
  }));
}
function renderChart(data) {
  if (!data.length) { document.getElementById('chart-area').innerHTML = '<div class="loading-state">No assessment data yet.</div>'; return; }
  const maxVal = Math.max(...data.map(d => d.score), ...data.map(d => d.avg), 1);
  document.getElementById('chart-area').innerHTML = data.map(d => `
    <div class="cbg">
      <div class="cbars">
        <div class="cbar" style="height:${(d.avg/maxVal)*110}px;background:rgba(138,160,184,.32);"></div>
        <div class="cbar" style="height:${(d.score/maxVal)*110}px;background:var(--gold);"></div>
      </div>
      <div class="cmonth">${d.month}</div>
    </div>`).join('');
}

/* ══════════════════════════════════════════
   fetchAssessments — FIXED
   Teacher ki actual remarks return karta hai
   'good' default REMOVE kiya
══════════════════════════════════════════ */
async function fetchAssessments(subjectId) {
  if (!IS_LIVE) return DEMO.assessments[subjectId] || [];
  const { data, error } = await sb.from('assessments')
    .select('*')
    .eq('subject_id', subjectId)
    .eq('student_id', PROFILE.id)
    .order('conducted_at', { ascending: true });
  if (error) return [];
  return (data || []).map(r => ({
    name:      r.name,
    avg:       Number(r.class_avg_score),
    score:     Number(r.student_score),
    /* ✅ FIXED: Teacher ki actual remarks — 'good' default hata diya */
    remarks:   (r.remarks || '').trim()
  }));
}

/* ══════════════════════════════════════════
   renderTable — FIXED
   Remarks column mein teacher ka actual text
   dikhta hai, score-derived label nahi
══════════════════════════════════════════ */
function renderTable(s, assessments) {
  const done  = assessments.length;
  const total = s.total_assessments;
  document.getElementById('tbl-meta').textContent = `${done} completed · ${total - done} upcoming`;

  const rows = assessments.map((a, i) => {
    const bc = a.score >= 80 ? 'high' : a.score >= 65 ? 'mid' : 'low';
    const d  = a.score - a.avg;

    /* ✅ FIXED: Teacher ki actual remark text use karo */
    const teacherRemark = (a.remarks || '').trim();
    const remarkHTML = teacherRemark
      ? `<span style="display:inline-block;padding:4px 12px;
           background:rgba(0,184,180,0.1);border:1px solid rgba(0,184,180,0.25);
           border-radius:8px;color:var(--teal);font-size:12px;font-weight:500;
           white-space:nowrap;">${teacherRemark}</span>`
      : '<span style="color:var(--muted);font-size:12px;">—</span>';

    return `<tr>
      <td style="color:var(--muted);width:40px;">${String(i+1).padStart(2,'0')}</td>
      <td style="font-weight:500;">${a.name}</td>
      <td><div class="sbw"><span style="color:var(--muted);">${a.avg}%</span>
        <div class="smb"><div class="smf mid" style="width:${a.avg}%"></div></div></div></td>
      <td><div class="sbw"><span>${a.score}%</span>
        <div class="smb"><div class="smf ${bc}" style="width:${a.score}%"></div></div>
        <span class="dchip ${d>=0?'dpos':'dneg'}">${d>=0?'+':''}${d}</span></div></td>
      <td>${remarkHTML}</td>
    </tr>`;
  });

  const upcoming = Array.from({ length: total - done }, () => `<tr class="upcoming"></tr>`);
  document.getElementById('asmnt-body').innerHTML = [...rows, ...upcoming].join('');
}

/* ── PAYMENT ── */
function openPayment(subjectId) {
  const s = SUBJECTS.find(x => x.id === subjectId);
  if (!s) return;
  CUR_SUBJ = s; CUR_METHOD = null;
  ['upi','bank','cash'].forEach(m => {
    document.getElementById(`mc-${m}`).classList.remove('sel');
    document.getElementById(`body-${m}`).style.display = 'none';
  });
  const upiUtr = document.getElementById('utr-upi');
  const bankUtr = document.getElementById('utr-bank');
  if (upiUtr) upiUtr.value = '';
  if (bankUtr) bankUtr.value = '';
  const btn = document.getElementById('pay-submit-btn');
  btn.disabled = true; btn.textContent = 'Select a payment method to continue';
  const fee = (s.fee_inr || 0).toLocaleString('en-IN');
  document.getElementById('pay-fee').textContent = fee;
  document.getElementById('pay-sname').textContent = s.name;
  document.getElementById('pay-sname2').textContent = s.name;
  document.getElementById('pay-sicon').textContent = s.icon;
  document.getElementById('pay-bc').textContent = s.name + ' — Payment';
  document.getElementById('upi-fee').textContent = fee;
  document.getElementById('bank-fee').textContent = fee;
  document.getElementById('cash-fee').textContent = fee;
  document.getElementById('bank-roll').textContent = PROFILE?.roll_number || '—';
  showScreen('s-pay');
}
function selectMethod(m) {
  CUR_METHOD = m;
  ['upi','bank','cash'].forEach(x => {
    document.getElementById(`mc-${x}`).classList.toggle('sel', x === m);
    document.getElementById(`body-${x}`).style.display = x === m ? 'block' : 'none';
  });
  const btn = document.getElementById('pay-submit-btn');
  btn.disabled = false; btn.textContent = 'Submit & Notify Finance Team →';
}
async function submitPayment() {
  if (!CUR_SUBJ || !CUR_METHOD) return;
  const btn = document.getElementById('pay-submit-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Submitting…';
  const utr = CUR_METHOD === 'upi'  ? (document.getElementById('utr-upi').value.trim() || null) :
              CUR_METHOD === 'bank' ? (document.getElementById('utr-bank').value.trim() || null) : null;
  try {
    if (IS_LIVE) {
      const today = new Date().toISOString().split('T')[0];
      const validUntil = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
      const { error: payErr } = await sb.from('payments').insert({
        student_id: PROFILE.id, subject_id: CUR_SUBJ.id, amount_inr: CUR_SUBJ.fee_inr,
        payment_method: CUR_METHOD, utr_reference: utr, status: 'pending',
        payment_date: today, valid_until: validUntil
      });
      if (payErr) throw payErr;
      const { error: enErr } = await sb.from('student_subjects').upsert({
        student_id: PROFILE.id, subject_id: CUR_SUBJ.id, is_active: false, payment_status: 'pending',
      }, { onConflict: 'student_id,subject_id' });
      if (enErr) throw enErr;
    }
    const subj = SUBJECTS.find(x => x.id === CUR_SUBJ.id);
    if (subj) subj._status = 'pending';
    toast("Payment submitted! We'll verify within 24 hours.", 'ok');
    await new Promise(r => setTimeout(r, 400));
    renderSubjects(SUBJECTS);
    showScreen('s-dash');
  } catch(e) {
    toast('Submission failed: ' + e.message, 'err');
    btn.disabled = false; btn.textContent = 'Submit & Notify Finance Team →';
  }
}
function goBack() { showScreen('s-dash'); }

/* ── SESSION RESTORE ── */
(function restoreSession() {
  const saved = loadSession();
  if (!saved) return;
  PROFILE = saved;
  setHeaderUser(saved);
  document.getElementById('subj-lbl').textContent = ['Enrolled Subjects —', saved.class||'', saved.board ? '('+saved.board+')' : ''].filter(Boolean).join(' ');
  Promise.all([loadNotices(), loadSubjects()]).then(() => showScreen('s-dash'));
})();

/* ════════════════════════════════════════════════
   ASSIGNMENTS SECTION
════════════════════════════════════════════════ */
let CURR_ASSIGN_ID = null, CURR_ASSIGN_DATA = null;

(function applyProtections() {
  document.addEventListener('contextmenu', function(e) {
    if (document.getElementById('view-modal') && document.getElementById('view-modal').style.display === 'flex') e.preventDefault();
  });
  document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('view-modal');
    if (!modal || modal.style.display !== 'flex') return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ['s','p','c','a','u'].includes(key)) { e.preventDefault(); return false; }
    if (key === 'printscreen' || key === 'f12') { e.preventDefault(); return false; }
  });
})();

async function loadAssignments(subjectId) {
  const section = document.getElementById('assign-section');
  const list    = document.getElementById('assign-list-student');
  const lbl     = document.getElementById('assign-count-lbl');
  if (!section) return;
  section.style.display = 'block';
  list.innerHTML = '<div class="loading-state">Loading assignments...</div>';
  try {
    const { data: assigns, error } = await sb.from('assignments').select('*')
      .eq('subject_id', subjectId).eq('status', 'published').order('due_date');
    if (error) throw error;
    if (!assigns || assigns.length === 0) {
      lbl.textContent = '0 assignments';
      list.innerHTML = '<div class="loading-state">Abhi koi assignment nahi hai.</div>';
      return;
    }
    const { data: subs } = await sb.from('assignment_submissions').select('*')
      .eq('student_id', PROFILE.id).in('assignment_id', assigns.map(a => a.id));
    const subMap = {};
    (subs || []).forEach(s => subMap[s.assignment_id] = s);
    window._assignCache = {}; assigns.forEach(a => { window._assignCache[a.id] = a; });
    window._subCache = subMap;
    lbl.textContent = assigns.length + ' assignment' + (assigns.length !== 1 ? 's' : '');
    let rows = '';
    assigns.forEach((a, i) => {
      const sub = subMap[a.id];
      const daysLeft = Math.ceil((new Date(a.due_date) - new Date()) / 86400000);
      const overdue  = daysLeft < 0;
      const dueLbl = overdue
        ? '<span style="color:var(--red);">Overdue '+Math.abs(daysLeft)+'d</span>'
        : daysLeft === 0
          ? '<span style="color:var(--orange);">Due today!</span>'
          : '<span style="color:var(--muted);">'+new Date(a.due_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+'</span>';
      const statusHTML = sub ? '<span class="rmk excellent">Submitted</span>'
        : overdue ? '<span class="rmk below">Missed</span>'
                  : '<span class="rmk average">Pending</span>';
      const safeTitle = (a.title || '').replace(/'/g, "\\'");
      const viewBtn = '<button onclick="viewAssignment(\''+a.id+'\')" style="padding:5px 14px;background:transparent;color:var(--gold);border:1px solid var(--gold);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-right:6px;">👁 View</button>';
      const submitBtn = (!sub && !overdue)
        ? '<button onclick="openSubmitModal(\''+a.id+'\',\''+safeTitle+'\')" style="padding:5px 14px;background:var(--gold);color:#111;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">Submit</button>'
        : (sub && sub.file_url
            ? '<a href="'+sub.file_url+'" target="_blank" style="padding:5px 12px;background:transparent;color:var(--green);border:1px solid var(--green);border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">My Work</a>'
            : '<span style="font-size:12px;color:var(--muted);">No file</span>');
      rows += '<tr>'
        + '<td style="color:var(--muted);width:36px;">'+String(i+1).padStart(2,'0')+'</td>'
        + '<td style="font-weight:500;">'+a.title+'</td>'
        + '<td style="color:var(--muted);font-size:13px;">'+(a.type||'Assignment')+'</td>'
        + '<td>'+dueLbl+'</td>'
        + '<td style="text-align:center;">'+a.max_score+'</td>'
        + '<td>'+statusHTML+'</td>'
        + '<td style="white-space:nowrap;">'+viewBtn+submitBtn+'</td>'
        + '</tr>';
    });
    list.innerHTML = '<div style="overflow-x:auto;"><table><thead><tr>'
      + '<th>#</th><th>Assignment</th><th>Type</th><th>Due Date</th><th>Max</th><th>Status</th><th>Action</th>'
      + '</tr></thead><tbody>'+rows+'</tbody></table></div>';
  } catch(e) {
    list.innerHTML = '<div class="loading-state" style="color:var(--red);">Error: '+e.message+'</div>';
  }
}

function viewAssignment(assignId) {
  const a = (window._assignCache||{})[assignId];
  const sub = (window._subCache||{})[assignId];
  if (!a) return;
  CURR_ASSIGN_DATA = a;
  const daysLeft = Math.ceil((new Date(a.due_date) - new Date()) / 86400000);
  const overdue = daysLeft < 0;
  const duePill = overdue
    ? '<span style="background:rgba(252,129,129,.15);color:#fc8181;padding:4px 12px;border-radius:20px;font-size:12px;">Overdue by '+Math.abs(daysLeft)+' day(s)</span>'
    : daysLeft === 0
      ? '<span style="background:rgba(246,173,85,.15);color:#f6ad55;padding:4px 12px;border-radius:20px;font-size:12px;">Due Today!</span>'
      : '<span style="background:rgba(104,211,145,.15);color:#68d391;padding:4px 12px;border-radius:20px;font-size:12px;">Due in '+daysLeft+' day(s)</span>';
  const wName = (PROFILE.full_name || 'Student').toUpperCase();
  const wRoll = PROFILE.roll_number || '';
  const wText = wName + (wRoll ? '  |  '+wRoll : '');
  let contentHTML = '';
  if (a.file_url) {
    const pdfSrc = a.file_url + '#toolbar=0&navpanes=0&scrollbar=1&view=FitH';
    const wmRow = Array(30).fill('<span style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap;letter-spacing:1px;padding:0 20px;">'+wText+'</span>').join('');
    contentHTML = '<div style="position:relative;border-radius:10px;overflow:hidden;background:#1a1a2e;">'
      + '<div style="position:absolute;inset:0;z-index:20;pointer-events:none;">'
      + '<div style="position:absolute;inset:0;overflow:hidden;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:30px 10px;transform:rotate(-30deg) scale(1.8);opacity:0.12;">'+wmRow+wmRow+wmRow+'</div>'
      + '<div style="position:absolute;bottom:14px;right:16px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:1px;">'+wText+'</div>'
      + '<div style="position:absolute;top:14px;left:16px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:1px;">'+wText+'</div>'
      + '</div>'
      + '<iframe src="'+pdfSrc+'" style="width:100%;height:72vh;min-height:500px;border:none;display:block;" title="Assignment Viewer"></iframe>'
      + '</div>';
  } else if (a.instructions) {
    contentHTML = '<div style="position:relative;border-radius:10px;overflow:hidden;">'
      + '<div style="position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:40px;transform:rotate(-25deg) scale(1.4);opacity:0.08;">'
      + Array(20).fill('<span style="font-size:13px;font-weight:700;color:#c0a060;white-space:nowrap;">'+wText+'</span>').join('')
      + '</div>'
      + '<div style="position:relative;z-index:1;padding:24px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;font-size:14px;line-height:1.9;color:var(--cream);user-select:none;-webkit-user-select:none;" oncontextmenu="return false;" onselectstart="return false;">'+a.instructions+'</div>'
      + '</div>';
  } else {
    contentHTML = '<div style="padding:20px;text-align:center;color:var(--muted);">No content available.</div>';
  }
  const footerHTML = sub
    ? '<div style="padding:14px 18px;background:rgba(72,199,142,0.1);border:1px solid rgba(72,199,142,0.3);border-radius:10px;display:flex;align-items:center;gap:12px;"><span style="font-size:22px;">✅</span><div><div style="color:#68d391;font-weight:600;">Assignment Submitted</div><div style="font-size:12px;color:var(--muted);">'+new Date(sub.submitted_at).toLocaleString('en-IN')+'</div></div></div>'
    : overdue
      ? '<div style="padding:14px;background:rgba(252,129,129,0.1);border:1px solid rgba(252,129,129,0.3);border-radius:10px;color:#fc8181;font-weight:600;">Deadline passed — Submission closed</div>'
      : '<div style="text-align:right;"><button onclick="closeViewModal();openSubmitModal(\''+a.id+'\',\''+(a.title||'').replace(/'/g,"\\'")+'\');" style="padding:11px 28px;background:var(--gold);color:#111;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">Submit Assignment →</button></div>';
  document.getElementById('view-modal-body').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">'
    + '<div><div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:5px;">'+(a.type||'Assignment')+'</div>'
    + '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:700;color:var(--cream);">'+a.title+'</div></div>'
    + '<button onclick="closeViewModal()" style="background:rgba(255,255,255,0.07);border:none;color:var(--muted);font-size:18px;cursor:pointer;border-radius:50%;width:34px;height:34px;">&times;</button>'
    + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'
    + duePill+'<span style="background:rgba(255,255,255,0.07);color:var(--cream);padding:4px 12px;border-radius:20px;font-size:12px;">Max: '+a.max_score+' marks</span>'
    + '</div>'
    + contentHTML
    + '<div style="margin-top:18px;">'+footerHTML+'</div>';
  document.getElementById('view-modal').style.display = 'flex';
}
function closeViewModal() { document.getElementById('view-modal').style.display = 'none'; }

function openSubmitModal(assignId, assignTitle) {
  CURR_ASSIGN_ID = assignId;
  document.getElementById('modal-assign-title').textContent = assignTitle;
  document.getElementById('submit-file-input').value = '';
  document.getElementById('submit-err').style.display = 'none';
  document.getElementById('submit-modal').style.display = 'flex';
}
function closeSubmitModal() { document.getElementById('submit-modal').style.display = 'none'; CURR_ASSIGN_ID = null; }

async function doSubmitAssignment() {
  const file = document.getElementById('submit-file-input').files[0];
  const err  = document.getElementById('submit-err');
  err.style.display = 'none';
  if (!file) { err.textContent = 'Please select a file.'; err.style.display = 'block'; return; }
  if (!CURR_ASSIGN_ID) return;
  const btn = document.querySelector('#submit-modal button[onclick="doSubmitAssignment()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
  try {
    const path = PROFILE.id+'/'+CURR_ASSIGN_ID+'/'+Date.now()+'_'+file.name;
    let fileUrl = '';
    const { error: ue } = await sb.storage.from('peak-submissions').upload(path, file, { upsert: true });
    if (!ue) fileUrl = sb.storage.from('peak-submissions').getPublicUrl(path).data.publicUrl;
    const { error: ie } = await sb.from('assignment_submissions').upsert({
      assignment_id: CURR_ASSIGN_ID, student_id: PROFILE.id,
      file_url: fileUrl, file_name: file.name, file_size: file.size,
      status: 'submitted', submitted_at: new Date().toISOString()
    }, { onConflict: 'assignment_id,student_id' });
    if (ie) throw ie;
    closeSubmitModal();
    toast('Assignment submitted successfully!', 'ok');
    await loadAssignments(CUR_SUBJ.id);
  } catch(e) {
    err.textContent = e.message; err.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
  }
}