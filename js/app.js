(function () {
  'use strict';

  var TZ = 'America/Denver';
  var STATES = ['working', 'idle', 'stuck', 'needs-you'];
  var LABEL = { working: 'Working', idle: 'Idle', stuck: 'Stuck', 'needs-you': 'Needs you', unknown: 'No data' };
  var STALE_MS = 2 * 3600 * 1000;
  var REFRESH_MS = 60 * 1000;

  var fmtFull = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
  var fmtShort = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });

  var $ = function (id) { return document.getElementById(id); };

  var agents = [];
  var status = null;        // latest status.json (or null)
  var fetchFailed = false;
  var openId = null;
  var opener = null;
  var deskEls = {};
  var chipSig = null;

  /* ---------- helpers ---------- */
  function parseTime(s) {
    var t = Date.parse(s);
    return isNaN(t) ? null : t;
  }
  function rel(ms) {
    var d = Date.now() - ms;
    if (d < 45000) return 'just now';
    var m = Math.round(d / 60000);
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') + ' ago';
    var days = Math.floor(h / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }
  function fetchJSON(url) {
    return fetch(url + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function hashColor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return 'hsl(' + (h % 360) + ' 60% 52%)';
  }
  function validAgents(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    return list.filter(function (a) {
      if (!a || typeof a.id !== 'string' || !a.id || seen[a.id]) return false;
      seen[a.id] = true;
      return true;
    });
  }
  function agentById(id) {
    for (var i = 0; i < agents.length; i++) if (agents[i].id === id) return agents[i];
    return null;
  }
  function entryFor(id) {
    var e = status && status.agents && typeof status.agents === 'object' ? status.agents[id] : null;
    if (!e || STATES.indexOf(e.state) < 0) return null;
    return e;
  }

  /* ---------- desks ---------- */
  var SKELETON =
    '<div class="scene">' +
      '<div class="glow"></div><div class="desk-surface"></div>' +
      '<div class="monitor"><div class="screen"><div class="lines"></div></div></div>' +
      '<div class="lamp"><i></i></div><div class="mug"></div><div class="keyboard"></div>' +
      '<div class="chair"></div>' +
      '<div class="avatar"><div class="arm l"></div><div class="arm r"></div><div class="body"></div>' +
        '<div class="head"><div class="hair"></div></div></div>' +
      '<div class="bubble b-alert">!</div><div class="bubble b-ask">?</div>' +
      '<div class="zzz">z<b>z</b><i>z</i></div>' +
    '</div>' +
    '<div class="plate"><span class="pname"></span><span class="psrc"></span></div>' +
    '<span class="chip"></span><span class="ptask"></span><span class="ptime"></span>';

  function makeDesk(a) {
    var b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = SKELETON;
    var html = '';
    for (var i = 0; i < 24; i++) html += '<i></i>';
    b.querySelector('.lines').innerHTML = html; // 12 lines repeated twice for seamless scroll
    b.querySelector('.pname').textContent = a.name || a.id;
    b.querySelector('.psrc').textContent = a.source || '';
    var c = a.color && window.CSS && CSS.supports('color', a.color) ? a.color : hashColor(a.id);
    b.style.setProperty('--c', c);
    b.addEventListener('click', function () { openDetails(a.id, b); });
    return b;
  }

  function syncDesks() {
    var host = $('desks');
    var ids = agents.map(function (a) { return a.id; });
    Object.keys(deskEls).forEach(function (id) {
      if (ids.indexOf(id) < 0 || deskEls[id].sig !== JSON.stringify(agentById(id))) {
        deskEls[id].el.remove();
        delete deskEls[id];
      }
    });
    agents.forEach(function (a, i) {
      if (!deskEls[a.id]) deskEls[a.id] = { el: makeDesk(a), sig: JSON.stringify(a) };
      var el = deskEls[a.id].el;
      if (host.children[i] !== el) host.insertBefore(el, host.children[i] || null);
    });
    $('empty').hidden = agents.length > 0;
  }

  function renderDesks(counts, attention) {
    agents.forEach(function (a) {
      var el = deskEls[a.id].el;
      var e = entryFor(a.id);
      var st = e ? e.state : 'unknown';
      counts[st]++;
      if (st === 'stuck' || st === 'needs-you') attention.push({ id: a.id, name: a.name || a.id, state: st });
      var cls = 'desk state-' + st;
      if (el.className !== cls) el.className = cls;
      var task = e ? (e.task || '') : 'No data';
      var t = e ? parseTime(e.updated) : null;
      var when = t === null ? 'Updated: unknown' : 'Updated ' + rel(t);
      el.querySelector('.chip').textContent = LABEL[st];
      el.querySelector('.ptask').textContent = task;
      el.querySelector('.ptime').textContent = when;
      el.setAttribute('aria-label', (a.name || a.id) + ', ' + LABEL[st] + (task ? ': ' + task : '') + '. ' + when + '. Open details.');
    });
  }

  /* ---------- top bar ---------- */
  function renderAttention(attention) {
    var n = attention.length;
    var box = $('attnBox');
    box.classList.toggle('hot', n > 0);
    $('attnCount').textContent = n;
    $('attnLabel').textContent = n === 0 ? 'Nothing needs you right now' :
      (n === 1 ? 'agent needs attention' : 'agents need attention');
    document.title = (n > 0 ? '(' + n + ') ' : '') + 'Agent Office';
    var sig = JSON.stringify(attention);
    if (sig === chipSig) return;
    chipSig = sig;
    var host = $('attnChips');
    host.textContent = '';
    attention.forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'attn-chip ' + x.state;
      b.textContent = (x.state === 'stuck' ? '! ' : '? ') + x.name + ' · ' + LABEL[x.state];
      b.addEventListener('click', function () { openDetails(x.id, b); });
      host.appendChild(b);
    });
  }

  function renderTop(counts, attention) {
    STATES.concat('unknown').forEach(function (s) { $('n-' + s).textContent = counts[s]; });
    $('unkWrap').hidden = counts.unknown === 0;
    renderAttention(attention);

    var t = status ? parseTime(status.updated) : null;
    $('updatedText').textContent = t === null ? 'no data' : fmtShort.format(new Date(t)) + ' (' + rel(t) + ')';
    $('staleWarn').hidden = t === null || Date.now() - t <= STALE_MS;
    $('fetchWarn').hidden = !fetchFailed;
  }

  /* ---------- details ---------- */
  function fillDetails() {
    var a = agentById(openId);
    if (!a) { closeDetails(); return; }
    var e = entryFor(a.id);
    var st = e ? e.state : 'unknown';
    $('dName').textContent = a.name || a.id;
    var pill = $('dState');
    pill.textContent = LABEL[st];
    pill.className = 'state-pill ' + st;
    $('dSource').textContent = a.source || '—';
    $('dRole').textContent = a.role || '—';
    $('dTask').textContent = e ? (e.task || '—') : 'No data for this agent yet';
    var t = e ? parseTime(e.updated) : null;
    $('dUpdated').textContent = t === null ? 'unknown' : fmtFull.format(new Date(t)) + ' (' + rel(t) + ')';
  }
  function openDetails(id, el) {
    openId = id;
    opener = el;
    fillDetails();
    $('backdrop').hidden = false;
    $('closeBtn').focus();
  }
  function closeDetails() {
    if (openId === null) return;
    openId = null;
    $('backdrop').hidden = true;
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
  }

  /* ---------- render / refresh ---------- */
  function render() {
    syncDesks();
    var counts = { working: 0, idle: 0, stuck: 0, 'needs-you': 0, unknown: 0 };
    var attention = [];
    renderDesks(counts, attention);
    renderTop(counts, attention);
    if (openId !== null) fillDetails();
  }

  function refresh() {
    var pa = fetchJSON('data/agents.json').then(function (l) { agents = validAgents(l); }, function () {});
    var ps = fetchJSON('data/status.json').then(function (s) { status = s; fetchFailed = false; },
      function () { fetchFailed = true; });
    return Promise.all([pa, ps]).then(render);
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('closeBtn').addEventListener('click', closeDetails);
    $('backdrop').addEventListener('click', function (e) { if (e.target === $('backdrop')) closeDetails(); });
    document.addEventListener('keydown', function (e) {
      if (openId === null) return;
      if (e.key === 'Escape') { e.preventDefault(); closeDetails(); }
      else if (e.key === 'Tab') { e.preventDefault(); $('closeBtn').focus(); } // only focusable control in the dialog
    });
    refresh();
    setInterval(refresh, REFRESH_MS);
    setInterval(render, 15000); // keep relative times and stale warning fresh
  });
})();
