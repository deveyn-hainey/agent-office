// Furniture library: builds every `data.furniture` item (+ chairs at desk slots + extra decor) of ONE floor.
// Static things go into the floor's Batch (one mesh + one outline per floor); animated things are small separate objects.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, shade, mix } from './batch.js';
import { hash } from '../core/util.js';

const WOOD = '#e8d3ad', WOOD_D = '#c9a878', WOOD_DD = '#a98963', STEEL = '#c9ced6', DARK = '#34383f', INK = '#2b2622';
const SOFA = ['#e58aa5', '#7aa6d6', '#7fbf8e', '#a78be0'];
const BOOKS = ['#e25a4f', '#3d7be0', '#f2b632', '#3fae5a', '#9b6bff', '#ff8a4c', '#1fa3a3', '#ef5da8', '#f4ecdc'];
const POT = ['#d98c5f', '#e8c9a0', '#8fb6d9', '#e6a1b4', '#f4ecdc'];

export function buildProps(env) {
  const { T, floor, accent, data, group, b, mats, tex } = env;
  const fnum = floor + 1;
  const accD = shade(accent, -0.28);
  const sofaCol = SOFA[floor];
  const slotById = new Map(data.slots.filter((s) => s.floor === floor).map((s) => [s.id, s]));

  const planeCache = new Map();
  const screenGeo = (w, h, off) => {
    const k = w + 'x' + h + 'o' + off;
    if (!planeCache.has(k)) {
      const a = new T.PlaneGeometry(w, h); a.rotateY(Math.PI); a.translate(0, 0, -off);
      const c = new T.PlaneGeometry(w, h); c.translate(0, 0, off);
      planeCache.set(k, mergeGeometries([a, c]));
    }
    return planeCache.get(k);
  };
  /** a double-sided glowing screen (readable from the iso camera whichever way the desk faces) */
  const addScreen = (slotKey, parent, w, h, x, y, z, rx = 0, off = 0.034) => {
    const m = new T.Mesh(screenGeo(w, h, off), mats.screen.idle);
    m.position.set(x, y, z); m.rotation.x = rx;
    m.userData.noPick = true;
    parent.add(m);
    env.anim.screens.set(slotKey, { mesh: m, mode: 'idle', next: 0, variant: 0 });
    return m;
  };
  const frameGroup = (it, y = 0) => {
    const g = new T.Group();
    g.position.set(it.x, y, it.z); g.rotation.y = it.rot || 0;
    g.userData.noPick = true;
    group.add(g);
    return g;
  };
  const pool = (x, z, r, y = 0.07) => {
    const g = new T.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2); g.translate(x, y, z);
    env.poolGeos.push(g);
  };
  /** local -> floor-local point for a frame placed at (it.x, it.z, rot) */
  const toFloor = (it, lx, lz) => {
    const c = Math.cos(it.rot || 0), s = Math.sin(it.rot || 0);
    return [it.x + lx * c + lz * s, it.z - lx * s + lz * c];
  };

  /* ------------------------------ small parts ------------------------------ */
  const mug = (x, y, z, col = '#fffdf6') => {
    b.cyl(0.09, 0.08, 0.16, col, x, y, z, 12);
    b.box(0.05, 0.1, 0.03, col, x + 0.11, y + 0.09, z, 0, false);
  };
  const book = (x, y, z, w, h, d, col, ry = 0) => b.box(w, h, d, col, x, y + h / 2, z, ry);
  const papers = (x, y, z, ry = 0) => { b.box(0.5, 0.012, 0.36, '#fffdf6', x, y + 0.006, z, ry); b.box(0.46, 0.012, 0.34, '#eef2f7', x + 0.03, y + 0.018, z - 0.02, ry + 0.15); };

  function chair(x, z, facing, col) {
    b.at(x, 0, z, facing, () => {
      b.cyl(0.06, 0.06, 0.34, '#4a4640', 0, 0.12, 0, 10, false);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.box(0.34, 0.04, 0.06, '#4a4640', Math.cos(a) * 0.17, 0.1, Math.sin(a) * 0.17, -a, false);
        b.box(0.07, 0.07, 0.07, INK, Math.cos(a) * 0.33, 0.06, Math.sin(a) * 0.33, 0, false);
      }
      b.box(0.66, 0.12, 0.62, col, 0, 0.5, 0);
      b.box(0.62, 0.62, 0.1, col, 0, 0.9, -0.3, 0, true, -0.1);
      b.box(0.1, 0.05, 0.4, '#4a4640', 0.36, 0.72, -0.02, 0, false);
      b.box(0.1, 0.05, 0.4, '#4a4640', -0.36, 0.72, -0.02, 0, false);
    });
  }

  /* ------------------------------ desks ------------------------------ */
  function desk(it, slotId) {
    const w = it.w, d = it.d, h = it.h;
    const r = rng(hash(it.id));
    const left = r() < 0.5 ? -1 : 1;
    b.at(it.x, it.y || 0, it.z, it.rot, () => {
      b.box(w, 0.1, d, '#efdcb8', 0, h - 0.05, 0);
      b.box(w + 0.02, 0.05, d + 0.02, WOOD_D, 0, h - 0.12, 0, 0, false);
      b.box(0.09, h - 0.12, d - 0.14, WOOD_DD, -(w / 2 - 0.12), (h - 0.12) / 2, 0);
      b.box(0.09, h - 0.12, d - 0.14, WOOD_DD, w / 2 - 0.12, (h - 0.12) / 2, 0);
      b.box(w - 0.4, 0.55, 0.05, '#c3a577', 0, h - 0.45, d / 2 - 0.14);
      // drawers
      b.box(0.85, 0.72, d - 0.2, '#dcc194', left * (w / 2 - 0.6), 0.5, 0);
      for (let i = 0; i < 2; i++) { b.box(0.7, 0.3, 0.03, '#e9d4ab', left * (w / 2 - 0.6), 0.34 + i * 0.36, d / 2 - 0.1, 0, true); b.box(0.2, 0.04, 0.04, INK, left * (w / 2 - 0.6), 0.36 + i * 0.36, d / 2 - 0.07, 0, false); }
      // desk-top clutter
      const kind = r();
      if (kind < 0.55) {
        // monitor on a stand, laptop beside
        b.box(0.5, 0.03, 0.28, '#3b3f46', 0, h + 0.015, 0.1);
        b.box(0.08, 0.4, 0.06, '#3b3f46', 0, h + 0.2, 0.12);
        b.box(1.18, 0.72, 0.06, DARK, 0, h + 0.7, 0.1);
        b.box(0.7, 0.04, 0.5, STEEL, -left * 0.75, h + 0.02, -0.12);
      } else {
        // open laptop
        b.box(0.92, 0.04, 0.62, STEEL, 0, h + 0.02, -0.02);
        b.at(0, h + 0.04, 0.26, 0, () => b.box(0.92, 0.6, 0.03, '#aeb4bd', 0, 0.3, 0, 0, true), 0.38);
        b.box(0.45, 0.14, 0.28, '#3b3f46', left * 0.85, h + 0.07, 0.2);
      }
      mug(left * -1 * (w / 2 - 0.4), h, -0.15, ['#fffdf6', '#ffd37a', '#9bd0f0', '#f5a3b5'][Math.floor(r() * 4)]);
      if (r() < 0.6) papers(left * (w / 2 - 0.9), h, -0.3, 0.3);
      if (r() < 0.4) { // tiny desk plant
        b.cyl(0.1, 0.08, 0.14, '#d98c5f', left * -0.2 - 0.5, h, 0.35, 10);
        b.sphere(0.14, '#4aa35c', left * -0.2 - 0.5, h + 0.25, 0.35, 1, 1.1, 1, 1);
      }
      if (r() < 0.38) { // desk lamp
        const lx = -left * (w / 2 - 0.3), lz = 0.38;
        b.cyl(0.12, 0.14, 0.04, '#2f3339', lx, h, lz, 12);
        b.box(0.04, 0.5, 0.04, '#2f3339', lx, h + 0.27, lz, 0, false);
        b.cyl(0.05, 0.2, 0.2, '#ffe39a', lx, h + 0.46, lz + 0.05, 12);
        const [fx, fz] = toFloor(it, lx, lz + 0.05);
        pool(fx, fz, 1.3, h + 0.12);
      }
    });
    // animated screen
    const g = frameGroup(it);
    // the 2nd rng draw above decided monitor vs laptop
    const rr = rng(hash(it.id)); rr(); const k = rr();
    if (k < 0.55) addScreen(slotId, g, 1.08, 0.6, 0, h + 0.7, 0.1);
    else addScreen(slotId, g, 0.84, 0.5, 0, h + 0.04 + 0.3 * Math.cos(0.38) + 0.0, 0.26 + 0.3 * Math.sin(0.38) - 0.0, 0.38, 0.02);
  }

  /* ------------------------------ furniture types ------------------------------ */
  const builders = {
    desk(it) { desk(it, it.id.replace(/-furn$/, '')); },

    sofa(it) {
      const w = it.w, d = it.d;
      b.at(it.x, 0, it.z, it.rot, () => {
        b.box(w, 0.3, d, shade(sofaCol, -0.25), 0, 0.15, 0);
        b.box(w - 0.7, 0.22, d - 0.45, sofaCol, 0, 0.41, 0.2);
        const n = 2;
        for (let i = 0; i < n; i++) b.box((w - 0.74) / n - 0.03, 0.2, d - 0.5, shade(sofaCol, 0.12), -((w - 0.74) / 2) + (i + 0.5) * ((w - 0.74) / n), 0.6, 0.2);
        b.box(w, 0.62, 0.42, shade(sofaCol, -0.08), 0, 0.62, -d / 2 + 0.21);
        b.box(0.34, 0.55, d, shade(sofaCol, -0.15), -(w / 2 - 0.17), 0.52, 0);
        b.box(0.34, 0.55, d, shade(sofaCol, -0.15), w / 2 - 0.17, 0.52, 0);
        for (const sx of [-1, 1]) b.box(0.08, 0.14, 0.08, '#4a4640', sx * (w / 2 - 0.2), 0.04, d / 2 - 0.2, 0, false);
        b.box(0.5, 0.42, 0.14, '#fff2c9', -w / 2 + 0.85, 0.9, -d / 2 + 0.55, 0.3, true, -0.25);
        b.box(0.46, 0.4, 0.14, mix(accent, '#ffffff', 0.2), w / 2 - 0.85, 0.9, -d / 2 + 0.55, -0.25, true, -0.25);
      });
    },

    table(it) {
      b.at(it.x, 0, it.z, it.rot, () => {
        b.box(it.w, 0.1, it.d, '#f3e8d2', 0, it.h - 0.05, 0);
        b.box(it.w + 0.04, 0.06, it.d + 0.04, '#d6c19a', 0, it.h - 0.13, 0, 0, false);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, it.h - 0.1, 0.12, WOOD_DD, sx * (it.w / 2 - 0.25), (it.h - 0.1) / 2, sz * (it.d / 2 - 0.2));
        b.cyl(0.22, 0.26, 0.07, '#3b3f46', 0, it.h, 0, 16);   // speaker puck
        b.cyl(0.05, 0.05, 0.015, '#7ee0a0', 0, it.h + 0.07, 0, 12, false);
        papers(-1.5, it.h, 0.35, 0.2); papers(1.4, it.h, -0.3, -0.3);
        mug(-0.8, it.h, 0.5); mug(1.0, it.h, 0.45, '#9bd0f0'); mug(-0.3, it.h, -0.5, '#ffd37a');
      });
    },

    chair(it) { chair(it.x, it.z, it.rot, mix(accent, '#6b6f7a', 0.55)); },

    coffeetable(it) {
      b.at(it.x, 0, it.z, it.rot, () => {
        b.box(it.w, 0.07, it.d, '#dcc59f', 0, it.h - 0.035, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.07, it.h - 0.07, 0.07, WOOD_DD, sx * (it.w / 2 - 0.12), (it.h - 0.07) / 2, sz * (it.d / 2 - 0.1), 0, false);
        mug(-0.3, it.h, 0.05); book(0.2, it.h, -0.05, 0.42, 0.05, 0.3, BOOKS[hash(it.id) % 9], 0.3); book(0.2, it.h + 0.05, -0.05, 0.36, 0.04, 0.26, BOOKS[(hash(it.id) + 3) % 9], -0.2);
      });
    },

    rug(it) {
      const col = it.color || '#d9cdf3';
      if (it.shape === 'round') {
        b.cyl(it.r, it.r, 0.04, col, it.x, 0, it.z, 48);
        b.cyl(it.r * 0.86, it.r * 0.86, 0.05, shade(col, 0.35), it.x, 0, it.z, 48);
        b.cyl(it.r * 0.6, it.r * 0.6, 0.06, mix(col, accent, 0.5), it.x, 0, it.z, 48);
        b.cyl(it.r * 0.34, it.r * 0.34, 0.07, shade(col, 0.45), it.x, 0, it.z, 48);
      } else {
        b.at(it.x, 0, it.z, it.rot, () => {
          b.box(it.w, 0.04, it.d, col, 0, 0.02, 0);
          b.box(it.w - 0.5, 0.05, it.d - 0.5, shade(col, 0.4), 0, 0.025, 0);
          b.box(it.w - 1.0, 0.06, it.d - 1.0, mix(col, accent, 0.35), 0, 0.03, 0, 0, false);
        });
      }
    },

    plant(it) { plant(it); },

    clock(it) { clock(it); },
    window(it) { win(it); },

    rack(it) {
      const w = it.w, d = it.d, h = it.h;
      b.at(it.x, 0, it.z, it.rot, () => {
        b.box(w, h, d, '#3a3f47', 0, h / 2, 0);
        b.box(w + 0.1, 0.12, d + 0.1, '#2b2f36', 0, h + 0.06, 0);
        b.box(w + 0.1, 0.12, d + 0.1, '#2b2f36', 0, 0.06, 0);
        for (let i = 0; i < 6; i++) b.box(w - 0.3, 0.04, 0.03, '#1f2329', 0, 0.5 + i * 0.4, d / 2 + 0.01, 0, false);
        b.box(0.05, h, 0.05, '#1f2329', w / 2 + 0.02, h / 2, d / 2, 0, false);
      });
      const g = frameGroup(it);
      const m = new T.Mesh(new T.PlaneGeometry(w - 0.2, h - 0.5), mats.rack);
      m.position.set(0, h / 2, d / 2 + 0.02); m.userData.noPick = true; g.add(m);
      // cables over the top
      b.at(it.x, 0, it.z, it.rot, () => { b.box(0.08, 0.5, 0.08, '#e25a4f', -0.3, h + 0.35, 0.1, 0, false); b.box(0.08, 0.5, 0.08, '#3d7be0', 0.1, h + 0.35, 0, 0, false); });
    },

    coffeebar(it) {
      const w = it.w, d = it.d;
      b.at(it.x, 0, it.z, it.rot, () => {
        b.box(w, 1.0, d, '#9c7a58', 0, 0.5, 0);
        for (let i = 0; i < 4; i++) {
          b.box(w / 4 - 0.18, 0.78, 0.04, '#b78f65', -w / 2 + (i + 0.5) * (w / 4), 0.52, d / 2 + 0.01);
          b.box(0.28, 0.05, 0.05, INK, -w / 2 + (i + 0.5) * (w / 4), 0.78, d / 2 + 0.05, 0, false);
        }
        b.box(w + 0.12, 0.12, d + 0.1, '#f1e8d8', 0, 1.06, 0.02);
        b.box(w, 0.1, 0.12, '#7d5f43', 0, 0.05, d / 2 - 0.02, 0, false);
        // cups, jar, plate, kettle
        for (let i = 0; i < 4; i++) mug(-w / 2 + 0.7 + i * 0.32, 1.12, 0.2, ['#fffdf6', '#f5a3b5', '#9bd0f0', '#ffd37a'][i]);
        b.cyl(0.2, 0.2, 0.42, '#e8f4fb', -w / 2 + 2.3, 1.12, -0.1, 14);
        b.cyl(0.21, 0.21, 0.08, '#6b4f3a', -w / 2 + 2.3, 1.54, -0.1, 14);
        b.cyl(0.34, 0.3, 0.05, '#ffffff', -w / 2 + 2.9, 1.12, 0.3, 16);
        for (let i = 0; i < 3; i++) b.sphere(0.12, '#d49a5b', -w / 2 + 2.8 + i * 0.12, 1.24, 0.3, 1, 0.6, 1, 1);
        b.cyl(0.18, 0.22, 0.34, '#cfd5dc', w / 2 - 0.55, 1.12, 0.45, 14);
        b.box(0.04, 0.2, 0.04, INK, w / 2 - 0.3, 1.5, 0.45, 0, false);
        // shelf above with mugs
        b.box(w - 0.6, 0.08, 0.5, WOOD_D, 0.2, 3.0, -d / 2 + 0.05 - 0.3 + 0.0);
        b.box(0.06, 0.4, 0.4, WOOD_DD, -w / 2 + 0.6, 2.8, -d / 2 + 0.1 - 0.3, 0, false);
        b.box(0.06, 0.4, 0.4, WOOD_DD, w / 2 - 0.4, 2.8, -d / 2 + 0.1 - 0.3, 0, false);
        for (let i = 0; i < 6; i++) mug(-w / 2 + 1.0 + i * 0.55, 3.04, -d / 2 - 0.25, ['#fffdf6', '#f5a3b5', '#9bd0f0', '#ffd37a', '#b9e0a8', '#e0c4f5'][i]);
      });
      // chalk menu on wall
      const g = frameGroup(it);
      const m = new T.Mesh(new T.PlaneGeometry(2.0, 1.25), new T.MeshBasicMaterial({ map: tex.menu }));
      m.position.set(-w / 2 + 1.1, 4.2, -d / 2 + 0.7 - 0.02); m.userData.noPick = true; g.add(m);
      const fr = new T.Mesh(new T.BoxGeometry(2.14, 1.39, 0.06), new T.MeshLambertMaterial({ color: WOOD_DD }));
      fr.position.copy(m.position); fr.position.z -= 0.045; fr.userData.noPick = true; g.add(fr);
    },

    coffeemachine(it) {
      b.at(it.x, it.y || 0, it.z, it.rot, () => {
        b.box(1.0, 1.5, 0.85, '#3c4047', 0, 0.75, 0);
        b.box(1.06, 0.16, 0.9, '#2b2f36', 0, 1.58, 0);
        b.box(0.8, 0.5, 0.06, '#1f2329', 0, 1.0, 0.4, 0, false);
        b.box(0.6, 0.08, 0.5, '#8d949e', 0, 0.62, 0.38);
        b.cyl(0.07, 0.07, 0.2, '#8d949e', 0, 0.78, 0.2, 10);
        b.cyl(0.1, 0.08, 0.14, '#fffdf6', 0, 0.7, 0.38, 12);
        b.box(0.1, 0.1, 0.04, '#3fae5a', -0.3, 1.34, 0.43, 0, false);
        b.box(0.1, 0.1, 0.04, '#e25a4f', 0, 1.34, 0.43, 0, false);
        b.box(0.1, 0.1, 0.04, '#f2b632', 0.3, 1.34, 0.43, 0, false);
        b.box(0.5, 0.18, 0.7, '#555b64', 0, 1.74, -0.02);
      });
      const [fx, fz] = toFloor(it, 0, 0.38);
      env.steam.push({ x: fx, y: (it.y || 0) + 0.95, z: fz });
    },

    cooler(it) {
      b.at(it.x, 0, it.z, it.rot, () => {
        b.box(0.62, 1.0, 0.62, '#eef3f7', 0, 0.5, 0);
        b.box(0.66, 0.1, 0.66, '#c9d6e0', 0, 1.02, 0);
        b.box(0.5, 0.28, 0.04, '#9ec6e2', 0, 0.78, 0.32, 0, false);
        b.cyl(0.05, 0.05, 0.1, '#3d7be0', -0.12, 0.6, 0.37, 10, false, 0, Math.PI / 2);
        b.cyl(0.05, 0.05, 0.1, '#e25a4f', 0.12, 0.6, 0.37, 10, false, 0, Math.PI / 2);
        b.box(0.34, 0.04, 0.2, '#b8c7d4', 0, 0.42, 0.36, 0, false);
        b.cyl(0.04, 0.045, 0.14, '#ffffff', 0.2, 0.9, 0.2, 10, false);
        b.cyl(0.26, 0.26, 0.05, '#dfe9f1', 0, 1.1, 0, 20, false);
      });
      // translucent bottle + bubbles
      const g = frameGroup(it);
      const bottle = new T.Mesh(new T.CylinderGeometry(0.24, 0.27, 0.62, 20), new T.MeshLambertMaterial({ color: '#8fd0f0', transparent: true, opacity: 0.6, depthWrite: false }));
      bottle.position.y = 1.46; bottle.userData.noPick = true; g.add(bottle);
      const water = new T.Mesh(new T.CylinderGeometry(0.23, 0.26, 0.46, 20), new T.MeshLambertMaterial({ color: '#59b8e8', transparent: true, opacity: 0.55, depthWrite: false }));
      water.position.y = 1.4; water.userData.noPick = true; g.add(water);
      const cap = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.06, 12), new T.MeshLambertMaterial({ color: '#3d7be0' }));
      cap.position.y = 1.78; cap.userData.noPick = true; g.add(cap);
      const bubbles = new T.InstancedMesh(new T.SphereGeometry(0.035, 6, 5), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }), 6);
      bubbles.userData.noPick = true; g.add(bubbles);
      env.anim.bubbles.push({ mesh: bubbles, n: 6, phase: [...Array(6)].map((_, i) => i * 0.37 + 0.1) });
    },

    reception(it) {
      const w = it.w, d = it.d, h = it.h;
      b.at(it.x, 0, it.z, it.rot, () => {
        b.box(w, h - 0.1, d, '#e7d1b0', 0, (h - 0.1) / 2, 0);
        b.box(w + 0.3, 0.1, d + 0.22, '#f8f1e2', 0, h - 0.05, 0.05);
        b.box(w - 0.5, 0.62, 0.04, accD, 0, 0.55, d / 2 + 0.02);
        b.cyl(0.3, 0.3, 0.05, '#fffdf6', 0, 0.3, d / 2 + 0.06, 24, true, 0, Math.PI / 2);
        b.cyl(0.18, 0.18, 0.06, accent, 0, 0.3, d / 2 + 0.07, 24, false, 0, Math.PI / 2);
        b.cyl(0.14, 0.16, 0.06, '#d8b04a', 1.3, h, 0.35, 12);     // service bell
        b.sphere(0.05, '#d8b04a', 1.3, h + 0.09, 0.35, 1, 1, 1, 1);
        b.box(0.5, 0.012, 0.36, '#fffdf6', -1.3, h + 0.006, 0.2, 0.3);
        b.box(0.9, 0.5, 0.04, '#e8d3ad', -0.5, h + 0.28, 0.45, 0, true, -0.1);   // little sign
        mug(1.7, h, -0.3);
        b.box(0.5, 0.03, 0.28, '#3b3f46', 0.1, h + 0.015, -0.1);
        b.box(0.08, 0.35, 0.06, '#3b3f46', 0.1, h + 0.2, -0.08, 0, false);
        b.box(1.05, 0.62, 0.06, DARK, 0.1, h + 0.62, -0.08);
      });
      const g = frameGroup(it);
      addScreen('desk-1f-reception', g, 0.95, 0.52, 0.1, h + 0.62, -0.08);
    },

    entrance(it) {
      const w = it.w, h = it.h;
      b.at(it.x, 0, it.z, it.rot, () => {
        b.box(w + 0.5, h + 0.4, 0.22, '#7d5f43', 0, (h + 0.4) / 2, 0);
        b.box(w, h, 0.26, '#cfeaf5', 0, h / 2, 0.02);
        b.box(0.12, h, 0.3, '#5d4630', 0, h / 2, 0.04);
        for (const sx of [-1, 1]) {
          b.box(w / 2 - 0.2, h - 0.2, 0.06, '#e3f5fc', sx * (w / 4), h / 2, 0.14, 0, false);
          b.box(0.06, 0.8, 0.08, '#8d949e', sx * 0.3, 1.6, 0.2, 0, false);
        }
        b.box(w - 0.3, 0.5, 0.08, '#fffdf6', 0, h + 0.62, 0.05);
        b.box(w + 0.7, 0.2, 0.9, '#8a7a66', 0, 0.1, 0.6, 0, false);   // doormat step
        b.box(1.6, 0.04, 1.0, mix(accent, '#8a7a66', 0.4), 0, 0.2, 0.9, 0, true);
      });
      const g = frameGroup(it);
      const [c] = [document.createElement('canvas')];
      c.width = 256; c.height = 64;
      const cx = c.getContext('2d');
      cx.fillStyle = '#fffdf6'; cx.fillRect(0, 0, 256, 64);
      cx.fillStyle = '#2b2622'; cx.font = 'bold 34px Georgia,serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('Pitchside · Welcome', 128, 34);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
      const m = new T.Mesh(new T.PlaneGeometry(w - 0.3, 0.5 * (w - 0.3) / 3.1 * 1.0 + 0.0), new T.MeshBasicMaterial({ map: t }));
      m.geometry.dispose(); m.geometry = new T.PlaneGeometry(w - 0.5, 0.42);
      m.position.set(0, h + 0.62, 0.11); m.userData.noPick = true; g.add(m);
    },

    foosball(it) {
      b.at(it.x, 0, it.z, it.rot, () => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.14, 0.7, 0.14, '#5b3e2b', sx * (it.w / 2 - 0.2), 0.35, sz * (it.d / 2 - 0.2));
        b.box(it.w, 0.3, it.d, '#6b4a34', 0, 0.82, 0);
        b.box(it.w - 0.3, 0.05, it.d - 0.3, '#4aa35c', 0, 0.99, 0);
        b.box(0.05, 0.02, it.d - 0.3, '#e6f6e8', 0, 1.02, 0, 0, false);
        b.cyl(0.22, 0.22, 0.02, '#e6f6e8', 0, 1.0, 0, 20, false);
        for (let i = 0; i < 6; i++) {
          const x = -1.1 + i * 0.44;
          b.box(0.05, 0.05, it.d + 0.7, '#cfd5dc', x, 1.2, 0, 0, false);
          const team = i % 2 ? '#3d7be0' : '#e25a4f';
          for (let k = -1; k <= 1; k++) if ((i === 0 || i === 5) ? k === 0 : true) { b.box(0.14, 0.26, 0.1, team, x, 1.14, k * 0.35); b.sphere(0.06, '#f2d2b0', x, 1.34, k * 0.35, 1, 1, 1, 1); }
          b.box(0.12, 0.1, 0.1, INK, x, 1.2, it.d / 2 + 0.38, 0, false);
          b.box(0.12, 0.1, 0.1, INK, x, 1.2, -it.d / 2 - 0.38, 0, false);
        }
        b.sphere(0.07, '#ffffff', 0.3, 1.07, 0.1, 1, 1, 1, 1);
      });
    },

    bookshelf(it) {
      const w = it.w, d = it.d, h = it.h;
      const r = rng(hash(it.id));
      b.at(it.x, 0, it.z, it.rot, () => {
        b.box(w, h, 0.06, '#b8946a', 0, h / 2, -d / 2 + 0.03);
        for (const sx of [-1, 1]) b.box(0.07, h, d, '#a98963', sx * (w / 2 - 0.035), h / 2, 0);
        b.box(w, 0.08, d, '#a98963', 0, h - 0.04, 0);
        b.box(w, 0.14, d, '#8d6f4f', 0, 0.07, 0);
        const rows = 4;
        for (let s = 0; s < rows; s++) {
          const y = 0.14 + s * ((h - 0.2) / rows);
          b.box(w - 0.1, 0.06, d - 0.04, '#b8946a', 0, y + 0.03, 0);
          let x = -w / 2 + 0.14;
          while (x < w / 2 - 0.3) {
            const bw = 0.08 + r() * 0.1, bh = 0.34 + r() * 0.18;
            if (r() < 0.07) { x += 0.3; continue; }
            b.box(bw, bh, d - 0.18, BOOKS[Math.floor(r() * BOOKS.length)], x + bw / 2, y + 0.06 + bh / 2, 0.02);
            x += bw + 0.01;
          }
          if (s === 1) { b.box(0.1, 0.4, d - 0.2, '#3d7be0', w / 2 - 0.28, y + 0.27, 0.02, 0, true, 0, -0.35); }
        }
        b.cyl(0.14, 0.12, 0.2, '#d98c5f', -0.7, h, 0, 10);
        b.sphere(0.2, '#4aa35c', -0.7, h + 0.34, 0, 1, 1, 1, 1);
        b.sphere(0.2, '#8fb6d9', 0.5, h + 0.2, 0, 1, 1, 1, 1);
        b.cyl(0.04, 0.06, 0.08, '#8d949e', 0.5, h, 0, 10);
      });
    },
  };

  /* ---------- plants (sway) ---------- */
  function plant(it) {
    const r = rng(hash(it.id));
    const kind = Math.floor(r() * 4);
    const g = new T.Group();
    g.position.set(it.x, 0, it.z); g.userData.noPick = true;
    group.add(g);
    const pb = new env.Batch(T);
    const pot = POT[Math.floor(r() * POT.length)];
    pb.cyl(0.42, 0.32, 0.55, pot, 0, 0, 0, 16);
    pb.cyl(0.44, 0.44, 0.07, shade(pot, -0.12), 0, 0.5, 0, 16);
    pb.cyl(0.36, 0.36, 0.03, '#5b4331', 0, 0.56, 0, 16, false);
    const greens = ['#3f9a58', '#4aa35c', '#5bb86c', '#2f8a4f'];
    if (kind === 0) {           // fiddle-leaf
      pb.cyl(0.04, 0.07, 1.0, '#8a6a45', 0, 0.55, 0, 8, false);
      for (let i = 0; i < 9; i++) {
        const a = r() * 6.28, hh = 0.9 + r() * 0.8, rad = 0.22 + r() * 0.2;
        pb.sphere(0.27, greens[i % 4], Math.cos(a) * rad, hh + 0.4, Math.sin(a) * rad, 1, 0.5, 0.75, 1);
      }
    } else if (kind === 1) {    // round bush
      for (let i = 0; i < 4; i++) pb.sphere(0.42, greens[i], (i % 2 ? 1 : -1) * 0.14, 0.95 + (i > 1 ? 0.35 : 0), (i < 2 ? 0.1 : -0.12), 1, 1, 1, 1);
      pb.sphere(0.1, '#ff8a9a', 0.3, 1.5, 0.2, 1, 1, 1, 1); pb.sphere(0.1, '#ff8a9a', -0.25, 1.1, 0.35, 1, 1, 1, 1);
    } else if (kind === 2) {    // snake plant
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * 6.28, hh = 0.9 + r() * 0.8;
        pb.cone(0.12, hh, i % 2 ? '#3a8f55' : '#4aa35c', Math.cos(a) * 0.14, 0.5, Math.sin(a) * 0.14, 5, true, Math.cos(a) * 0.12, -Math.sin(a) * 0.12);
      }
    } else {                    // palm
      pb.cyl(0.05, 0.08, 1.3, '#8a6a45', 0, 0.5, 0, 8, false);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 6.28 + r() * 0.3;
        pb.at(Math.cos(a) * 0.05, 1.75, Math.sin(a) * 0.05, -a + Math.PI / 2, () => {
          pb.box(0.2, 0.04, 0.8, greens[i % 4], 0, 0.02, 0.4, 0, true, 0.35);
          pb.box(0.16, 0.04, 0.5, greens[(i + 1) % 4], 0, -0.2, 0.95, 0, true, 0.9);
        });
      }
    }
    pb.build(g, mats.vc, env.lineMat, 'plant');
    env.anim.plants.push({ g, phase: r() * 6.28, amp: 0.018 + r() * 0.02 });
  }

  /* ---------- clocks (real Denver time) ---------- */
  function clock(it) {
    const g = new T.Group();
    g.position.set(it.x, it.y, it.z + 0.02); g.userData.noPick = true;
    group.add(g);
    const R = it.w / 2;
    b.at(it.x, it.y, it.z, 0, () => {
      b.cyl(R + 0.06, R + 0.06, 0.1, INK, 0, 0, 0, 32, false, 0, Math.PI / 2);
      b.cyl(R + 0.03, R + 0.03, 0.14, '#f6f0e4', 0, 0, 0, 32, true, 0, Math.PI / 2);
    });
    b.at(it.x, it.y, it.z, 0, () => {});
    const face = new T.Mesh(new T.CircleGeometry(R - 0.02, 40), new T.MeshBasicMaterial({ map: tex.clockFace }));
    face.position.z = 0.1; face.userData.noPick = true; g.add(face);
    const hm = new T.MeshBasicMaterial({ color: INK });
    const hour = new T.Mesh(new T.BoxGeometry(0.07, R * 0.5, 0.02), hm);
    hour.geometry.translate(0, R * 0.25, 0);
    const min = new T.Mesh(new T.BoxGeometry(0.045, R * 0.78, 0.02), hm);
    min.geometry.translate(0, R * 0.39, 0);
    const sec = new T.Mesh(new T.BoxGeometry(0.02, R * 0.85, 0.02), new T.MeshBasicMaterial({ color: '#e25a4f' }));
    sec.geometry.translate(0, R * 0.3, 0);
    hour.position.z = 0.12; min.position.z = 0.135; sec.position.z = 0.15;
    for (const m of [hour, min, sec]) { m.userData.noPick = true; g.add(m); }
    env.anim.clocks.push({ hour, min, sec });
  }

  /* ---------- windows (frame in batch, sky + light patch merged) ---------- */
  function win(it) {
    const w = it.w, h = it.h;
    const ry = it.rot;
    b.at(it.x, it.y, it.z, ry, () => {
      const t = 0.14;
      b.box(w + 0.35, t, 0.2, '#fffdf6', 0, h / 2 + t / 2, 0);
      b.box(w + 0.35, t, 0.2, '#fffdf6', 0, -h / 2 - t / 2, 0);
      b.box(t, h + 0.28, 0.2, '#fffdf6', -w / 2 - t / 2, 0, 0);
      b.box(t, h + 0.28, 0.2, '#fffdf6', w / 2 + t / 2, 0, 0);
      b.box(0.06, h, 0.12, '#fffdf6', 0, 0, 0.02, 0, false);
      b.box(w, 0.06, 0.12, '#fffdf6', 0, 0.2, 0.02, 0, false);
      b.box(w + 0.7, 0.1, 0.5, '#f1e8d8', 0, -h / 2 - 0.2, 0.2);
      if (env.floor !== 99) {
        b.cyl(0.1, 0.08, 0.14, '#d98c5f', w / 2 - 0.6, -h / 2 - 0.15, 0.25, 10);
        b.sphere(0.13, '#4aa35c', w / 2 - 0.6, -h / 2 + 0.03, 0.25, 1, 1, 1, 1);
      }
    });
    // sky quad slightly in front of the wall, behind the frame
    const q = new T.PlaneGeometry(w, h);
    q.rotateY(ry); q.translate(it.x, it.y, it.z);
    const nx = Math.sin(ry), nz = Math.cos(ry);
    q.translate(nx * 0.03, 0, nz * 0.03);
    env.skyGeos.push(q);
    // sun patch on the floor: two slanted panes
    const nx2 = Math.sin(ry), nz2 = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
    const P = (u, d) => [it.x + tx * u + nx2 * d, 0.075, it.z + tz * u + nz2 * d];
    const len = 5.2, skew = 2.2;
    const quad = (u0, u1) => {
      const g = new T.BufferGeometry();
      const v = [...P(u0, 0.2), ...P(u1, 0.2), ...P(u1 + skew, len), ...P(u0 + skew, len)];
      g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      return g;
    };
    env.patchGeos.push(quad(-w / 2 + 0.05, -0.08), quad(0.08, w / 2 - 0.05));
  }

  /* ------------------------------ build ------------------------------ */
  for (const it of data.furniture) {
    if (it.floor !== floor) continue;
    const fn = builders[it.type];
    if (fn) fn(it);
  }

  // chairs at desk slots
  const cc = mix(accent, '#59606b', 0.62);
  for (const s of data.slots) {
    if (s.floor !== floor || s.kind !== 'desk') continue;
    const dir = [Math.sin(s.facing), Math.cos(s.facing)];
    chair(s.x - dir[0] * 0.12, s.z - dir[1] * 0.12, s.facing, s.hot ? mix(cc, '#e6c06a', 0.4) : cc);
  }

  /* ------------------------------ extra decor (non-solid / against walls) ------------------------------ */
  const floorLamp = (x, z, col = '#fff0c4') => {
    b.cyl(0.2, 0.22, 0.05, '#2f3339', x, 0, z, 14);
    b.box(0.05, 2.1, 0.05, '#2f3339', x, 1.1, z, 0, false);
    b.cyl(0.18, 0.34, 0.5, col, x, 2.0, z, 14);
    pool(x, z, 2.1);
  };
  const easel = (x, z, ry) => {
    b.at(x, 0, z, ry, () => {
      b.box(2.3, 1.7, 0.08, '#8d949e', 0, 2.1, 0);
      b.box(2.18, 1.58, 0.1, '#ffffff', 0, 2.1, 0.01, 0, false);
      b.box(0.06, 2.8, 0.06, '#5d646e', -0.9, 1.4, -0.35, 0.1, true, -0.2); b.box(0.06, 2.8, 0.06, '#5d646e', 0.9, 1.4, -0.35, -0.1, true, -0.2);
      b.box(0.06, 2.6, 0.06, '#5d646e', 0, 1.3, 0.45, 0, true, 0.22);
      b.box(2.2, 0.08, 0.3, '#8d949e', 0, 1.25, 0.2);
      for (let i = 0; i < 3; i++) b.cyl(0.03, 0.03, 0.2, ['#3d7be0', '#e25a4f', '#3fae5a'][i], -0.3 + i * 0.2, 1.33, 0.22, 8, false, 0, 0, Math.PI / 2);
    });
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.userData.noPick = true; group.add(g);
    const m = new T.Mesh(new T.PlaneGeometry(2.1, 1.5), new T.MeshBasicMaterial({ map: tex.easel }));
    m.position.set(0, 2.1, 0.07); m.userData.noPick = true; g.add(m);
  };
  const poster = (x, y, z, ry, i, w = 1.3) => {
    const h = w * 1.375;
    b.at(x, y, z, ry, () => b.box(w + 0.16, h + 0.16, 0.06, '#fffdf6', 0, 0, 0));
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex.posters[i % 4] }));
    const nx = Math.sin(ry), nz = Math.cos(ry);
    m.position.set(x + nx * 0.04, y, z + nz * 0.04); m.rotation.y = ry; m.userData.noPick = true; group.add(m);
  };
  const bin = (x, z, col = '#8d949e') => { b.cyl(0.26, 0.21, 0.62, col, x, 0, z, 14); b.cyl(0.28, 0.28, 0.05, shade(col, -0.2), x, 0.6, z, 14); };
  const printer = (x, z, ry) => b.at(x, 0, z, ry, () => {
    b.box(1.5, 0.75, 0.95, '#c3a577', 0, 0.375, 0);
    b.box(1.4, 0.5, 0.9, '#f1f3f6', 0, 1.0, 0);
    b.box(1.2, 0.18, 0.6, '#e8ebf0', 0, 1.34, -0.05);
    b.box(0.6, 0.02, 0.4, '#ffffff', 0.05, 1.42, 0.2, 0.1, false);
    b.box(0.4, 0.1, 0.06, '#3d7be0', 0.3, 0.92, 0.47, 0, false);
    b.box(0.5, 0.05, 0.3, '#ffffff', -0.35, 0.8, 0.55, 0.2, false);
  });
  const crates = (x, z, ry) => b.at(x, 0, z, ry, () => {
    b.box(0.9, 0.6, 0.7, '#c3a577', 0, 0.3, 0); b.box(0.8, 0.5, 0.6, '#b8946a', 0.1, 0.85, 0.05, 0.3);
  });

  // left-wall posters (z) per floor
  const LEFT = { 0: [[1.6, 0, 1.2]], 1: [[-3.6, 1, 1.1]], 2: [[-4.0, 2, 1.1]], 3: [[5.2, 0, 1.1]] };
  for (const [z, i, w] of LEFT[floor] || []) poster(-21.94, 4.3, z, Math.PI / 2, i, w);

  const D = {
    0: () => {   // 1F lobby
      floorLamp(-20.9, 11.6); floorLamp(20.9, -2.2);
      bin(10.6, -12.6); bin(-20.9, -0.2); bin(20.9, 2.2, '#6b8e7f');
      b.at(-20.9, 0, 2.6, Math.PI / 2, () => { b.box(2.6, 0.5, 0.9, '#cbb89a', 0, 0.25, 0); mug(0.5, 0.5, 0); book(-0.5, 0.5, 0, 0.5, 0.06, 0.35, '#e25a4f'); });
    },
    1: () => {   // 2F build/ops
      floorLamp(20.9, 2.4); floorLamp(-20.9, 13.0);
      printer(-20.9, -11.6, Math.PI / 2);
      bin(-20.9, 0.4); bin(15, 12.5); bin(7.4, -4.0, '#6b8e7f');
      easel(-14, 13.0, 0.3);
      crates(21.0, -4.2, -0.4);
    },
    2: () => {   // 3F review
      floorLamp(20.9, 2.4); floorLamp(-20.9, 12.9);
      bin(-12.0, 6.7); bin(21.0, -2.0, '#6b8e7f');
      easel(-8.5, 5.0, 0.6);
    },
    3: () => {   // 4F strategy
      floorLamp(-20.9, 6.4); floorLamp(20.9, 9.4);
      bin(-16.6, 0.0, '#8d949e'); bin(20.9, 2.2);
      easel(-3.4, -5.6, 0.45);
    },
  };
  D[floor]?.();

  // back-wall windows / posters in the free stretches of wall
  {
    const blocked = [[-22, -21.2]];
    for (const sf of data.surfaces) if (sf.floor === floor && Math.abs(sf.rot) < 0.1) blocked.push([sf.x - sf.w / 2 - 0.5, sf.x + sf.w / 2 + 0.5]);
    for (const it of data.furniture) if (it.floor === floor && ['clock', 'rack', 'coffeebar', 'coffeemachine', 'bookshelf'].includes(it.type) && it.z < -11.5 && Math.abs(it.rot || 0) < 0.1) blocked.push([it.x - it.w / 2 - 0.7, it.x + it.w / 2 + 0.7]);
    blocked.push([data.stairs.x - data.stairs.w / 2 - 0.3, data.stairs.x + data.stairs.w / 2 + 0.3], [data.elevator.x - data.elevator.w / 2 - 0.2, 22]);
    blocked.sort((p, q) => p[0] - q[0]);
    let cur = -22.0, pi = 0;
    const gaps = [];
    for (const [s0, e0] of blocked) { if (s0 > cur) gaps.push([cur, s0]); cur = Math.max(cur, e0); }
    for (const [s0, e0] of gaps) {
      const len = e0 - s0, cx = (s0 + e0) / 2;
      if (len >= 3.5) builders.window({ x: cx, y: 3.6, z: -13.94, rot: 0, w: Math.min(3.0, len - 0.9), h: 2.8 });
      else if (len >= 1.7) poster(cx, 3.9, -13.95, 0, floor + pi++, Math.min(1.2, len - 0.5));
    }
  }

  void fnum;
}
