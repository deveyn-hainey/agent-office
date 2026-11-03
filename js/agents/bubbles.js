// CSS2D speech bubbles / thinking dots / "!" badge / Zzz / ballot / emoji + name tag. Self-contained (injects its own CSS).
// Layout per agent (anchored above the head, grows upward):  [speech|think] / [icons: alert, emoji, ballot, zzz] / [name tag]
import { esc } from '../core/util.js';

const ICONS = {
  working: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2" fill="#fff"/><circle cx="12" cy="12" r="2" fill="#fff"/><circle cx="18" cy="12" r="2" fill="#fff"/></svg>',
  finished: '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  waiting: '<svg viewBox="0 0 24 24"><path d="M12 5v8" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.9" fill="#fff"/></svg>',
  error: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>',
};
const COLOR_STATE = { '#3fae5a': 'working', '#4c8dff': 'finished', '#f2b632': 'waiting', '#e25a4f': 'error' };

const CSS = `
.s2a{position:absolute;width:0;height:0;pointer-events:none}
.s2-stack{position:absolute;left:0;bottom:0;transform:translate(-50%,0);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;will-change:transform;font-family:Inter,-apple-system,"Segoe UI",system-ui,sans-serif}
.s2-bub{position:relative;background:#fff;border-radius:13px;padding:5px 12px 6px;font:500 13px/1.32 Inter,-apple-system,"Segoe UI",system-ui,sans-serif;color:#15171c;width:max-content;max-width:min(60ch,260px);white-space:pre-wrap;text-align:left;box-shadow:0 2px 12px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.03);animation:s2pop .18s ease-out;margin-bottom:9px}
.s2-bub:after{content:"";position:absolute;left:50%;top:100%;width:1px;height:9px;background:rgba(0,0,0,.28)}
.s2-bub .h{visibility:hidden}
.s2-bub .who{display:block;font-weight:700;font-size:10px;letter-spacing:.02em;margin-bottom:1px;opacity:.6}
.s2-bub.think{padding:7px 12px;display:flex;gap:4px;align-items:center}
.s2-bub.think i{width:6px;height:6px;border-radius:50%;background:#15171c;display:block;animation:s2dot 1.1s infinite ease-in-out}
.s2-bub.think i:nth-child(2){animation-delay:.18s}.s2-bub.think i:nth-child(3){animation-delay:.36s}
.s2-bub.alert{background:#fff;font-weight:600;box-shadow:0 2px 12px rgba(242,143,30,.35),0 0 0 1.5px #f28f1e}
.s2-ico{display:flex;gap:4px;align-items:center;justify-content:center;pointer-events:none}
.s2-ico:empty{display:none}
.s2-badge{width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.22);display:grid;place-items:center;box-sizing:border-box;transition:background .2s;flex:none}
.s2-badge svg{width:16px;height:16px;display:block}
.s2-badge.rest{width:9px;height:9px;margin:7px 0;border:0;box-shadow:none;opacity:.6}
.s2-badge.working{animation:s2pulse 1.6s ease-in-out infinite}
.s2-alert{width:26px;height:26px;border-radius:50%;background:#f28f1e;border:2px solid #fff;color:#fff;box-sizing:border-box;display:grid;place-items:center;pointer-events:auto;cursor:pointer;animation:s2wob 1.4s infinite ease-in-out;box-shadow:0 2px 8px rgba(242,143,30,.5)}
.s2-alert svg{width:16px;height:16px}
.s2-alert:hover{background:#ffa43a}
.s2-emoji{font-size:22px;line-height:1;animation:s2pop .25s ease-out;filter:drop-shadow(0 1px 2px rgba(0,0,0,.2))}
.s2-ballot{padding:1px 8px;border-radius:9px;font:700 11px/16px Inter,system-ui,sans-serif;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2);animation:s2pop .25s ease-out}
.s2-ballot.yes{background:#3fae5a}.s2-ballot.no{background:#e25a4f}
.s2-zzz{font:700 13px/1 Inter,system-ui,sans-serif;color:#8a8fa3;letter-spacing:1px;animation:s2z 2.4s infinite ease-in-out;text-shadow:0 1px 0 #fff}
.s2-zzz b{display:inline-block;animation:s2zf 2.4s infinite ease-in-out}
.s2-zzz b:nth-child(2){animation-delay:.4s;font-size:16px}.s2-zzz b:nth-child(3){animation-delay:.8s;font-size:19px}
.s2-tag{background:#fff;border-radius:9px;padding:0 7px;font:600 10.5px/16px Inter,-apple-system,"Segoe UI",system-ui,sans-serif;color:#15171c;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.14);transition:opacity .25s}
.s2-stack[data-tag="0"] .s2-tag{display:none}
@keyframes s2pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes s2dot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-4px);opacity:1}}
@keyframes s2wob{0%,100%{transform:rotate(0) scale(1)}25%{transform:rotate(-9deg) scale(1.08)}75%{transform:rotate(9deg) scale(1.08)}}
@keyframes s2pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
@keyframes s2zf{0%{transform:translateY(4px);opacity:0}30%{opacity:1}100%{transform:translateY(-9px);opacity:0}}
@media (prefers-reduced-motion: reduce){.s2-alert,.s2-zzz b,.s2-bub.think i,.s2-badge{animation:none!important}}
`;

function paint(sp, force) {
  const n = Math.floor(sp.n);
  if (n === sp.last && !force) return;
  sp.last = n;
  sp.v.textContent = sp.text.slice(0, n);
  sp.hh.textContent = sp.text.slice(n);
}

export function createBubbles(ctx) {
  const { scene, bus } = ctx;
  if (!document.getElementById('s2-bubble-css')) {
    const st = document.createElement('style');
    st.id = 's2-bubble-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const items = new Map(); // id -> controller
  let tagsOn = true;
  let frame = 0;

  function attach(id, anchor, { name, color }) {
    const outer = document.createElement('div');
    outer.className = 's2a';
    const stack = document.createElement('div');
    stack.className = 's2-stack';
    stack.dataset.tag = '1';
    const bubHost = document.createElement('div'); // holds 0..1 speech/think bubble
    bubHost.style.cssText = 'display:flex;flex-direction:column;align-items:center';
    const ico = document.createElement('div'); ico.className = 's2-ico';
    const badge = document.createElement('div'); badge.className = 's2-badge rest';
    const tag = document.createElement('div'); tag.className = 's2-tag';
    tag.textContent = name;
    stack.append(bubHost, ico, badge, tag);
    outer.appendChild(stack);
    const label = scene.css2d(outer);
    label.position.set(0, 0, 0);
    anchor.add(label);

    const c = {
      id, label, outer, stack, bubHost, ico, tag, off: 0, offT: 0, w: 0, h: 0,
      bub: null, speech: null, alertEl: null, emoji: null, ballotEl: null, zzzEl: null,
      hidden: false,
    };

    c.setStatusColor = (col) => {
      const st = COLOR_STATE[col];
      badge.className = 's2-badge ' + (st || 'rest');
      badge.style.background = col;
      badge.innerHTML = ICONS[st] || '';
      badge.style.display = c.alertEl ? 'none' : '';
    };
    c.setVisible = (v) => { c.hidden = !v; label.visible = v; };
    c.setTagVisible = (v) => { stack.dataset.tag = v ? '1' : '0'; };

    function clearSpeech() {
      if (c.bub) { c.bub.remove(); c.bub = null; }
      c.speech = null;
    }
    // style: speech | think | alert | cheer(emoji handled elsewhere)
    c.say = (text, style, until, instant, who) => {
      clearSpeech();
      const el = document.createElement('div');
      if (style === 'think') {
        el.className = 's2-bub think'; el.innerHTML = '<i></i><i></i><i></i>';
        c.speech = { until, kind: 'think' };
      } else {
        el.className = 's2-bub' + (style === 'alert' ? ' alert' : '');
        const t = String(text ?? '');
        el.innerHTML = (who ? `<span class="who">${esc(who)}</span>` : '') + '<span class="v"></span><span class="h"></span>';
        c.speech = { until, kind: style, text: t, n: instant ? t.length : 0, v: el.querySelector('.v'), hh: el.querySelector('.h'), last: -1 };
        paint(c.speech, true);
      }
      c.bub = el; bubHost.appendChild(el);
    };
    c.clearSpeech = clearSpeech;
    c.alert = (on) => {
      if (on && !c.alertEl) {
        const a = document.createElement('div'); a.className = 's2-alert'; a.innerHTML = ICONS.waiting; a.title = 'Needs your approval';
        a.addEventListener('click', (e) => {
          e.stopPropagation();
          bus.emit('agent:alert-click', { id });
          bus.emit('agent:click', { id, pick: { type: 'agent', id }, via: 'alert' });
        });
        a.addEventListener('pointerdown', (e) => e.stopPropagation());
        c.alertEl = a; ico.prepend(a); badge.style.display = 'none';
      } else if (!on && c.alertEl) { c.alertEl.remove(); c.alertEl = null; badge.style.display = ''; }
    };
    c.emojiShow = (e, until) => {
      c.emoji?.el.remove();
      const el = document.createElement('span'); el.className = 's2-emoji'; el.textContent = e;
      ico.appendChild(el); c.emoji = { el, until };
    };
    c.ballot = (choice, until) => {
      c.ballotEl?.el.remove();
      const el = document.createElement('span'); el.className = 's2-ballot ' + choice; el.textContent = choice === 'yes' ? 'YES' : 'NO';
      ico.appendChild(el); c.ballotEl = { el, until };
    };
    c.zzz = (on) => {
      if (on && !c.zzzEl) { const z = document.createElement('span'); z.className = 's2-zzz'; z.innerHTML = '<b>z</b><b>Z</b><b>Z</b>'; ico.appendChild(z); c.zzzEl = z; }
      else if (!on && c.zzzEl) { c.zzzEl.remove(); c.zzzEl = null; }
    };
    c.clear = () => {
      clearSpeech(); c.alert(false); c.zzz(false);
      c.emoji?.el.remove(); c.emoji = null; c.ballotEl?.el.remove(); c.ballotEl = null;
    };
    c.hasContent = () => !!(c.bub || c.alertEl || c.emoji || c.ballotEl || c.zzzEl);
    c.isSpeaking = () => !!(c.speech && c.speech.kind !== 'think');
    c.isThinking = () => !!(c.speech && c.speech.kind === 'think');
    c.dispose = () => { anchor.remove(label); outer.remove(); items.delete(id); };
    c.setStatusColor(color || '#a49d90');
    items.set(id, c);
    return c;
  }

  function setTags(on) {
    tagsOn = on;
    for (const c of items.values()) c.setTagVisible(on);
  }

  const v3 = new scene.THREE.Vector3();
  function layout(dt) {
    const el = scene.container;
    const W = el.clientWidth, Hh = el.clientHeight;
    const cam = scene.camera;
    const rects = [], movers = [];
    for (const c of items.values()) {
      if (c.hidden || !c.label.visible) continue;
      c.label.getWorldPosition(v3).project(cam);
      const sx = (v3.x + 1) / 2 * W, sy = (1 - v3.y) / 2 * Hh;
      if (sx < -200 || sx > W + 200 || sy < -200 || sy > Hh + 200) continue;
      const w = c.stack.offsetWidth || 40, h = c.stack.offsetHeight || 16;
      c.w = w; c.h = h;
      const item = { c, sx, sy, w, h };
      if (c.bub || c.alertEl || c.emoji || c.ballotEl) movers.push(item);
      else if (tagsOn) rects.push({ x0: sx - w / 2, x1: sx + w / 2, y0: sy - h, y1: sy });
    }
    // lower on screen first; each mover pushes up until free
    movers.sort((a, b) => b.sy - a.sy);
    const placed = [];
    for (const m of movers) {
      let off = 0;
      for (let n = 0; n < 30; n++) {
        const r = { x0: m.sx - m.w / 2 - 3, x1: m.sx + m.w / 2 + 3, y0: m.sy - off - m.h - 2, y1: m.sy - off + 2 };
        const hit = placed.find((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)
          || rects.find((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
        if (!hit) break;
        off = m.sy - hit.y0 + 4; // lift so our bottom sits above the obstacle's top
      }
      m.c.offT = off;
      placed.push({ x0: m.sx - m.w / 2, x1: m.sx + m.w / 2, y0: m.sy - off - m.h, y1: m.sy - off });
    }
    for (const c of items.values()) {
      if (!c.hasContent()) c.offT = 0;
      const k = 1 - Math.exp(-10 * dt);
      c.off += (c.offT - c.off) * k;
      if (Math.abs(c.offT - c.off) < 0.3) c.off = c.offT;
      c.stack.style.transform = `translate(-50%, ${(-c.off).toFixed(1)}px)`;
    }
  }

  // now = sim seconds; dt = sim dt; rdt = real dt
  function update(now, dt, rdt, seeking) {
    for (const c of items.values()) {
      const sp = c.speech;
      if (sp) {
        if (sp.text != null && sp.n < sp.text.length) { sp.n = Math.min(sp.text.length, sp.n + (seeking ? 1e9 : Math.max(dt, rdt * 0.5) * 62)); paint(sp); }
        if (now > sp.until) c.clearSpeech();
      }
      if (c.emoji && now > c.emoji.until) { c.emoji.el.remove(); c.emoji = null; }
      if (c.ballotEl && now > c.ballotEl.until) { c.ballotEl.el.remove(); c.ballotEl = null; }
    }
    if ((frame++ & 1) === 0) layout(Math.max(rdt, 0.016) * 2);
  }

  return { attach, update, setTags, items };
}
