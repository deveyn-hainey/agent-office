// End-of-demo summary card (self-contained DOM overlay; the UI module can ignore it or listen to 'scenario:summary').
const fmt = (s) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export function showSummary(ctx, data) {
  hideSummary();
  if (typeof document === 'undefined') return;
  const host = document.getElementById('ui-root') || document.body;
  const el = document.createElement('div');
  el.id = 's3-summary';
  el.className = 'ui-overlay';
  el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;pointer-events:auto;min-width:340px;max-width:440px;' +
    'background:rgba(255,251,242,.96);border:1px solid #d9ccb3;border-radius:14px;padding:20px 24px 16px;box-shadow:0 18px 50px rgba(43,38,34,.28);' +
    'font:14px/1.4 system-ui,sans-serif;color:#2b2622;opacity:0;transition:opacity .5s ease;';
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:24px;padding:6px 0;border-bottom:1px dashed #e4d9c3"><span style="color:#6b6258">${k}</span><b style="font-variant-numeric:tabular-nums">${v}</b></div>`;
  const extra = (data.lines || []).map((l) => `<li style="margin:2px 0">${escHtml(l)}</li>`).join('');
  el.innerHTML =
    `<div style="font:600 22px Georgia,'Iowan Old Style',serif;margin-bottom:2px">${escHtml(data.title)}</div>` +
    '<div style="color:#6b6258;margin-bottom:10px">Pitchside · PR #214 · dark-mode toggle</div>' +
    row('Time, request to green CI', fmt(data.elapsed)) + row('Agents involved', data.agents) + row('Findings caught in review', data.findings) +
    row('Human taps needed', data.taps) +
    (extra ? `<ul style="margin:10px 0 0;padding-left:18px;color:#4a423a">${extra}</ul>` : '') +
    '<div style="text-align:right;margin-top:12px"><button type="button" data-act="close" style="font:inherit;padding:6px 14px;border-radius:8px;border:1px solid #d9ccb3;background:#fff;cursor:pointer">Close</button> ' +
    '<button type="button" data-act="again" style="font:inherit;padding:6px 14px;border-radius:8px;border:1px solid #2b2622;background:#2b2622;color:#fff;cursor:pointer">Replay</button></div>';
  el.addEventListener('click', (ev) => {
    const a = ev.target?.dataset?.act;
    if (a === 'close') hideSummary();
    if (a === 'again') { hideSummary(); ctx.director?.seek(0); ctx.replay?.play(); }
  });
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  ctx.bus.once('replay:reset', hideSummary);
}

export function hideSummary() {
  if (typeof document === 'undefined') return;
  document.getElementById('s3-summary')?.remove();
}
