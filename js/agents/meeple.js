// Meeple character: mesh rig + pose application (procedural). Pure presentation; no world knowledge.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OUTLINE, hash } from '../core/util.js';

export const HIP = 0.8; // standing hip height (rig units)
export const LIE_Y = 0.22; // extra hip lift when lying on a sofa (hip ends up at HIP + this)
export const SCALE = 1.1;

// accessory per agent id (falls back to a hash pick)
const ACCESSORIES = {
  lead: ['headset'], codex: ['glasses'], musecode: ['beanie'], muse: ['antenna'], grok: ['headphones'],
  cursor: ['cap'], argon: ['glasses', 'bow'], chatgpt: ['sprout'], reva: ['cap'], revb: ['beanie'], ops: ['hardhat'], scout: ['tophat'],
};
const FALLBACK = [['headphones'], ['glasses'], ['antenna'], ['beanie'], ['cap'], ['bow'], ['sprout'], ['hardhat']];

export function createMeepleFactory(ctx) {
  const { THREE } = ctx.scene;
  const outlineMat = () => new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });

  const G = {
    torso: new THREE.CapsuleGeometry(0.36, 0.26, 4, 16),
    head: new THREE.SphereGeometry(0.42, 26, 18),
    arm: new THREE.CapsuleGeometry(0.1, 0.24, 3, 8),
    leg: new THREE.CapsuleGeometry(0.13, 0.17, 3, 8),
    hand: new THREE.SphereGeometry(0.115, 12, 10),
    foot: new THREE.SphereGeometry(0.15, 12, 8),
    eye: new THREE.SphereGeometry(0.1, 12, 10),
    pupil: new THREE.SphereGeometry(0.055, 8, 8),
    mouth: new THREE.CapsuleGeometry(0.03, 0.1, 2, 6),
    ring: new THREE.RingGeometry(0.62, 0.74, 40),
    disc: new THREE.CircleGeometry(0.62, 28),
    pick: new THREE.CylinderGeometry(0.7, 0.7, 2.4, 8),
  };
  G.arm.translate(0, -0.18, 0);
  G.leg.translate(0, -0.19, 0);
  G.foot.scale(1, 0.62, 1.5);
  G.foot.translate(0, -0.02, 0.06);
  G.ring.rotateX(-Math.PI / 2);
  G.disc.rotateX(-Math.PI / 2);

  // ballot textures (YES / NO) shared
  const ballotTex = {};
  function ballotTexture(choice) {
    if (ballotTex[choice]) return ballotTex[choice];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 90;
    const g = c.getContext('2d');
    const yes = choice === 'yes';
    g.fillStyle = '#fffdf6'; g.fillRect(0, 0, 128, 90);
    g.strokeStyle = '#2b2622'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 84);
    g.fillStyle = yes ? '#3fae5a' : '#e25a4f'; g.fillRect(10, 10, 108, 70);
    g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(yes ? 'YES' : 'NO', 64, 47);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    ballotTex[choice] = tex;
    return tex;
  }

  function build(team) {
    const base = new THREE.Color(team.color || '#888');
    const shirt = base.clone();
    const head = base.clone().lerp(new THREE.Color('#ffffff'), 0.22);
    const pants = base.clone().lerp(new THREE.Color('#1c1814'), 0.35);
    const hand = base.clone().lerp(new THREE.Color('#ffffff'), 0.4);
    const mats = []; // everything that can fade
    const lam = (c, extra = {}) => { const m = new THREE.MeshLambertMaterial({ color: c, ...extra }); mats.push(m); return m; };
    const hullM = outlineMat(true); mats.push(hullM);
    const mShirt = lam(shirt), mHead = lam(head), mPants = lam(pants), mHand = lam(hand);
    const mShoe = lam('#3a342f'), mWhite = lam('#ffffff'), mDark = lam(OUTLINE);
    const mAcc = lam(new THREE.Color(team.color).lerp(new THREE.Color('#ffffff'), 0.1));
    const mAccDark = lam('#3b3b46');
    const mGlow = new THREE.MeshBasicMaterial({ color: '#ffe27a' });

    const root = new THREE.Group();
    root.name = 'agent-' + team.id;
    const inner = new THREE.Group(); // scaled visual root (pop-in scale lives here)
    root.add(inner);

    // Everything on the animated skeleton is baked into ONE skinned mesh (vertex colours) + ONE skinned outline hull,
    // so an agent costs ~4 draw calls instead of ~40. Parts parented to a Bone are baked at flush(); parts on plain
    // groups (props that toggle visibility) stay loose meshes.
    const bones = [];
    const baked = [];
    const part = (geo, mat, parent, { hull = 1.09, pos, scale } = {}) => {
      if (parent.isBone) {
        const o = new THREE.Object3D();
        if (pos) o.position.set(...pos);
        if (scale) o.scale.set(...scale);
        baked.push({ geo, color: mat.color.clone(), bone: parent, o, hull });
        return o;
      }
      const m = new THREE.Mesh(geo, mat);
      if (hull) { const h = new THREE.Mesh(geo, hullM); h.scale.setScalar(hull); h.userData.noPick = true; m.add(h); }
      if (pos) m.position.set(...pos);
      if (scale) m.scale.set(...scale);
      parent.add(m);
      return m;
    };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Bone(); g.position.set(x, y, z); g.userData.idx = bones.length; parent.add(g); bones.push(g); return g; };

    // blob shadow + status ring (flat on ground, in root space so they don't tilt/bob)
    const shadow = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: '#2b2622', transparent: true, opacity: 0.16, depthWrite: false }));
    shadow.position.y = 0.03; shadow.userData.noPick = true; shadow.renderOrder = 1;
    const ring = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: '#a49d90', transparent: true, opacity: 0.75, depthWrite: false }));
    ring.position.y = 0.035; ring.userData.noPick = true; ring.renderOrder = 2;
    root.add(shadow, ring);

    // body pivot at the hip; torso/head/arms/legs hang off it so lying down rotates everything
    const body = grp(inner, 0, HIP, 0);
    const torso = grp(body, 0, 0.39, 0);
    part(G.torso, mShirt, torso);
    const headPivot = grp(body, 0, 0.98, 0);
    const headMesh = part(G.head, mHead, headPivot, { pos: [0, 0.2, 0], scale: [1, 0.94, 1] });
    const faceY = 0.24;
    const eyes = [];
    for (const sx of [-1, 1]) {
      const eb = grp(headPivot, sx * 0.16, faceY, 0.34);
      eb.scale.set(1, 1.1, 1);
      part(G.eye, mWhite, eb, { hull: 1.12, scale: [1, 1, 0.6] });
      part(G.pupil, mDark, eb, { hull: 0, pos: [0, -0.005, 0.07], scale: [1, 1, 0.7] });
      eyes.push(eb);
    }
    const mouth = grp(headPivot, 0, 0.03, 0.4);
    mouth.scale.set(1, 0.35, 0.6);
    mouth.rotation.z = Math.PI / 2;
    part(G.mouth, mDark, mouth, { hull: 0 });

    const mkArm = (side) => {
      const sh = grp(body, side * 0.46, 0.72, 0);
      sh.rotation.order = 'YXZ';
      part(G.arm, mShirt, sh, { hull: 1.1 });
      const el = grp(sh, 0, -0.38, 0);
      part(G.arm, mShirt, el, { hull: 1.1 });
      const hd = grp(el, 0, -0.4, 0);
      part(G.hand, mHand, hd, { hull: 1.12 });
      return { sh, el, hd };
    };
    const armL = mkArm(1), armR = mkArm(-1);
    const mkLeg = (side) => {
      const hp = grp(body, side * 0.19, 0.02, 0);
      part(G.leg, mPants, hp, { hull: 1.1 });
      const kn = grp(hp, 0, -0.4, 0);
      part(G.leg, mPants, kn, { hull: 1.1 });
      const ft = grp(kn, 0, -0.38, 0);
      part(G.foot, mShoe, ft, { hull: 1.1 });
      return { hp, kn };
    };
    const legL = mkLeg(1), legR = mkLeg(-1);

    /* ---- accessories ---- */
    const accs = ACCESSORIES[team.id] || FALLBACK[hash(team.id) % FALLBACK.length];
    let antenna = null;
    for (const acc of accs) {
      if (acc === 'headphones' || acc === 'headset') {
        part(new THREE.TorusGeometry(0.47, 0.045, 8, 22, Math.PI), mAccDark, headPivot, { hull: 0, pos: [0, 0.2, 0] });
        for (const sx of [-1, 1]) {
          const cup = part(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 14), mAcc, headPivot, { hull: 1.12, pos: [sx * 0.46, 0.2, 0] });
          cup.rotation.z = Math.PI / 2;
        }
        if (acc === 'headset') {
          const boom = part(new THREE.CapsuleGeometry(0.018, 0.3, 2, 6), mAccDark, headPivot, { hull: 0, pos: [-0.36, 0.05, 0.27] });
          boom.rotation.set(0.2, 0.8, 0.9);
          part(new THREE.SphereGeometry(0.05, 8, 8), mAccDark, headPivot, { hull: 0, pos: [-0.2, -0.06, 0.4] });
        }
      } else if (acc === 'glasses') {
        for (const sx of [-1, 1]) {
          part(new THREE.TorusGeometry(0.135, 0.028, 8, 20), mDark, headPivot, { hull: 0, pos: [sx * 0.16, faceY, 0.4] });
        }
        const br = part(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 6), mDark, headPivot, { hull: 0, pos: [0, faceY + 0.03, 0.41] });
        br.rotation.z = Math.PI / 2;
      } else if (acc === 'antenna') {
        antenna = grp(headPivot, 0, 0.44, 0);
        part(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), mDark, antenna, { hull: 0, pos: [0, 0.14, 0] });
        part(new THREE.SphereGeometry(0.085, 10, 8), mGlow, antenna, { hull: 1.25, pos: [0, 0.36, 0] });
      } else if (acc === 'beanie') {
        const dome = part(new THREE.SphereGeometry(0.46, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mAcc, headPivot, { hull: 1.07, pos: [0, 0.27, 0] });
        dome.rotation.x = -0.12;
        part(new THREE.SphereGeometry(0.09, 10, 8), mWhite, headPivot, { hull: 1.15, pos: [0, 0.74, -0.04] });
        const cuff = part(new THREE.TorusGeometry(0.43, 0.06, 8, 22), mAccDark, headPivot, { hull: 1.08, pos: [0, 0.3, 0] });
        cuff.rotation.x = Math.PI / 2 - 0.12;
      } else if (acc === 'cap') {
        part(new THREE.SphereGeometry(0.45, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.46), mAcc, headPivot, { hull: 1.07, pos: [0, 0.28, 0] });
        const brim = part(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16, 1, false, -Math.PI / 2, Math.PI), mAccDark, headPivot, { hull: 1.1, pos: [0, 0.3, 0.2] });
        brim.rotation.y = Math.PI / 2 * 0 + 0; brim.scale.set(1, 1, 0.9);
        brim.rotation.y = 0;
      } else if (acc === 'tophat') {
        part(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20), mAccDark, headPivot, { hull: 1.1, pos: [0, 0.54, 0] });
        part(new THREE.CylinderGeometry(0.3, 0.32, 0.38, 18), mAccDark, headPivot, { hull: 1.07, pos: [0, 0.74, 0] });
        part(new THREE.CylinderGeometry(0.325, 0.325, 0.07, 18), mAcc, headPivot, { hull: 1.07, pos: [0, 0.62, 0] });
      } else if (acc === 'hardhat') {
        const hh = lam('#f2c230');
        part(new THREE.SphereGeometry(0.46, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hh, headPivot, { hull: 1.07, pos: [0, 0.27, 0] });
        part(new THREE.CylinderGeometry(0.52, 0.52, 0.05, 20), hh, headPivot, { hull: 1.08, pos: [0, 0.3, 0] });
        part(new THREE.BoxGeometry(0.1, 0.1, 0.9), hh, headPivot, { hull: 1.1, pos: [0, 0.74, 0] });
      } else if (acc === 'bow') {
        for (const sx of [-1, 1]) {
          const w = part(new THREE.ConeGeometry(0.11, 0.2, 8), mAccDark, body, { hull: 1.1, pos: [sx * 0.11, 0.86, 0.34] });
          w.rotation.z = -sx * Math.PI / 2;
        }
        part(new THREE.SphereGeometry(0.05, 8, 8), mAccDark, body, { hull: 1.1, pos: [0, 0.86, 0.36] });
      } else if (acc === 'sprout') {
        part(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), mDark, headPivot, { hull: 0, pos: [0, 0.58, 0] });
        const leaf = lam('#5cbf62');
        for (const sx of [-1, 1]) {
          const l = part(new THREE.SphereGeometry(0.12, 10, 8), leaf, headPivot, { hull: 1.15, pos: [sx * 0.11, 0.7, 0], scale: [1.3, 0.5, 0.8] });
          l.rotation.z = sx * 0.5;
        }
      }
    }

    /* ---- props ---- */
    const props = {};
    // cup (right hand)
    const cup = new THREE.Group();
    part(new THREE.CylinderGeometry(0.1, 0.075, 0.2, 12), lam('#fffdf6'), cup, { hull: 1.1, pos: [0, -0.06, 0.04] });
    part(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 12), lam('#6b4426'), cup, { hull: 0, pos: [0, 0.035, 0.04] });
    cup.position.set(0, -0.05, 0.1); cup.visible = false; armR.hd.add(cup); props.cup = cup;
    // pen (draw)
    const pen = new THREE.Group();
    part(new THREE.CapsuleGeometry(0.03, 0.3, 2, 6), lam(team.color), pen, { hull: 1.2, pos: [0, -0.15, 0] });
    pen.visible = false; armR.hd.add(pen); props.pen = pen;
    // pointer stick (present)
    const pointer = new THREE.Group();
    part(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 6), lam('#d8c3a0'), pointer, { hull: 1.4, pos: [0, -0.75, 0] });
    part(new THREE.SphereGeometry(0.045, 6, 6), lam('#e25a4f'), pointer, { hull: 1.2, pos: [0, -1.5, 0] });
    pointer.visible = false; armR.hd.add(pointer); props.pointer = pointer;
    // baton (handoff)
    const baton = new THREE.Group();
    part(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 10), lam('#e8b630'), baton, { hull: 1.2 });
    for (const s of [-1, 1]) part(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 10), lam('#2b2622'), baton, { hull: 0, pos: [0, s * 0.3, 0] });
    baton.rotation.x = Math.PI / 2; baton.position.set(0, -0.02, 0.05); baton.visible = false; armR.hd.add(baton); props.baton = baton;
    // ballot card (both faces readable)
    const ballot = new THREE.Group();
    const bY = new THREE.MeshBasicMaterial({ map: ballotTexture('yes'), transparent: true });
    const bN = new THREE.MeshBasicMaterial({ map: ballotTexture('no'), transparent: true });
    const cardGeo = new THREE.PlaneGeometry(0.78, 0.55);
    const cards = {};
    for (const [k, m] of [['yes', bY], ['no', bN]]) {
      const g = new THREE.Group();
      const f = new THREE.Mesh(cardGeo, m); f.position.z = 0.012; g.add(f);
      const b = new THREE.Mesh(cardGeo, m); b.position.z = -0.012; b.rotation.y = Math.PI; g.add(b);
      g.userData.noPick = true; g.visible = false; ballot.add(g); cards[k] = g;
    }
    ballot.position.set(0, -0.42, 0); ballot.visible = false; armR.hd.add(ballot); props.ballot = ballot;
    mats.push(bY, bN);
    // binder / handoff folder (chest, both hands)
    const binder = new THREE.Group();
    part(new THREE.BoxGeometry(0.62, 0.8, 0.13), lam('#3d6fb8'), binder, { hull: 1.06 });
    part(new THREE.BoxGeometry(0.5, 0.68, 0.02), lam('#fffdf6'), binder, { hull: 0, pos: [0, 0, 0.075] });
    part(new THREE.BoxGeometry(0.1, 0.1, 0.03), lam('#e8b630'), binder, { hull: 0, pos: [0, 0.2, 0.09] });
    binder.position.set(0, 0.58, 0.58); binder.rotation.x = -0.15; binder.visible = false; body.add(binder); props.binder = binder;

    // click target (invisible, generous)
    const pickM = new THREE.Mesh(G.pick, new THREE.MeshBasicMaterial({ visible: false }));
    pickM.position.y = 1.1; root.add(pickM);
    root.userData.pick = { type: 'agent', id: team.id };

    // ---- bake the skeleton parts into one skinned fill mesh + one skinned outline hull
    inner.updateMatrixWorld(true);
    const fillGeos = [], hullGeos = [];
    for (const b of baked) {
      b.o.updateMatrix();
      const M = new THREE.Matrix4().multiplyMatrices(b.bone.matrixWorld, b.o.matrix);
      const skin = (g) => {
        const n = g.attributes.position.count;
        const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { si[i * 4] = b.bone.userData.idx; sw[i * 4] = 1; }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        g.deleteAttribute('uv');
      };
      const g = b.geo.clone();
      g.applyMatrix4(M);
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = b.color.r; col[i * 3 + 1] = b.color.g; col[i * 3 + 2] = b.color.b; }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      skin(g); fillGeos.push(g);
      if (b.hull) {
        const h = b.geo.clone();
        h.computeBoundingBox();
        const c = h.boundingBox.getCenter(new THREE.Vector3());
        h.translate(-c.x, -c.y, -c.z); h.scale(b.hull, b.hull, b.hull); h.translate(c.x, c.y, c.z);
        h.applyMatrix4(M);
        skin(h); hullGeos.push(h);
      }
    }
    const fillMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mats.push(fillMat);
    const skeleton = new THREE.Skeleton(bones);
    const mkSkinned = (geos, mat) => {
      const sm = new THREE.SkinnedMesh(mergeGeometries(geos, false), mat);
      sm.frustumCulled = false; sm.raycast = () => {}; sm.userData.noPick = true;
      inner.add(sm);
      sm.bind(skeleton, new THREE.Matrix4());
      return sm;
    };
    mkSkinned(fillGeos, fillMat);
    mkSkinned(hullGeos, hullM);
    inner.scale.setScalar(SCALE);

    const rig = {
      root, inner, body, torso, headPivot, headMesh, eyes, mouth, armL, armR, legL, legR, shadow, ring, props, cards, antenna,
      mats, hullM, pickM,
      setProp(names) { // names: array of prop keys to show
        for (const k in props) props[k].visible = names.includes(k);
      },
      showCard(choice) { cards.yes.visible = choice === 'yes'; cards.no.visible = choice === 'no'; },
      setFade(f) {
        for (const m of mats) { const tr = f < 0.999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = f; }
        shadow.material.opacity = 0.16 * f; ring.material.opacity = 0.75 * f;
      },
      ringColor(c) { ring.material.color.set(c); },
    };
    return rig;
  }

  return { build };
}

/* Apply channel values (c) to the rig. st: {t, ph (walk phase), headYaw, blink, aimR (yaw of right arm), prop...} */
export function applyRig(rig, c, st) {
  const s = Math.sin;
  const t = st.t, ph = st.ph;
  const PI = Math.PI;
  const wlk = c.walk;
  const bob = Math.abs(s(ph)) * 0.1 * wlk;
  const jump = Math.abs(s(t * 8)) * 0.85 * c.cheer;
  const talkB = Math.abs(s(t * 6.5)) * 0.035 * c.talk;
  const breathe = s(t * 2.2 + st.seed) * 0.014;
  rig.body.position.y = HIP + c.hipY + c.lie * LIE_Y + bob + jump + talkB;
  rig.body.rotation.x = -PI / 2 * c.lie + c.lean + 0.07 * wlk;
  rig.body.rotation.z = s(ph) * 0.05 * wlk + s(t * 1.3 + st.seed) * 0.012 * (1 - wlk);
  rig.torso.scale.set(1 + breathe * 0.8, 1 + breathe, 1 + breathe * 0.8);

  // head
  const h = rig.headPivot;
  h.rotation.order = 'YXZ';
  h.rotation.y = st.headYaw + s(t * 18) * 0.22 * c.shake;
  h.rotation.x = c.headP + s(t * 4.4) * 0.15 * c.nod + s(t * 7 + 1) * 0.05 * c.talk + s(t * 1.1 + st.seed) * 0.06 * c.type - 0.06 * c.cheer + breathe;
  h.rotation.z = c.headR + s(t * 3 + st.seed) * 0.03 * c.talk;
  // face
  const eyeScale = (1 - 0.92 * Math.max(st.blink, c.eyeClose)) * 1.1;
  for (const e of rig.eyes) e.scale.y = eyeScale;
  const open = Math.max(0, s(t * 15)) * c.talk + c.cheer * 0.9;
  rig.mouth.scale.set(1 + open * 0.2, 0.35 + open * 1.6, 0.6);
  rig.mouth.rotation.z = open > 0.05 ? PI / 2 : PI / 2;
  if (rig.antenna) rig.antenna.rotation.z = s(t * 3 + st.seed) * 0.25;

  // arms
  const sw = c.swing * wlk;
  const gest = c.talk;
  const lift = 0.5 + 0.5 * s(t * 0.85 + st.seed);
  const L = rig.armL, R = rig.armR;
  L.sh.rotation.x = c.aLx + s(ph) * 0.7 * sw + s(t * 3.3) * 0.34 * gest + s(t * 2.3) * 0.08 * c.type;
  L.sh.rotation.z = c.aLz + 0.06 * Math.abs(s(ph)) * sw + (s(t * 2.1 + 1) * 0.2 + 0.15) * gest;
  L.sh.rotation.y = 0;
  L.el.rotation.x = c.aLe + s(t * 13) * 0.24 * c.type + s(t * 3.3 + 1) * 0.4 * gest - Math.max(0, -s(ph)) * 0.35 * sw;
  R.sh.rotation.x = c.aRx - s(ph) * 0.7 * sw + s(t * 2.9 + 2) * 0.36 * gest + s(t * 2.1) * 0.18 * c.draw - 0.55 * lift * c.sip + s(t * 2.4) * 0.07 * c.type;
  R.sh.rotation.z = -(c.aRz + 0.06 * Math.abs(s(ph)) * sw + (s(t * 2.4) * 0.2 + 0.15) * gest) + s(t * 1.7) * 0.45 * c.draw;
  R.sh.rotation.y = st.aimR * c.aim;
  R.el.rotation.x = c.aRe + s(t * 13 + 2.1) * 0.24 * c.type + s(t * 3.1 + 2) * 0.4 * gest + s(t * 9) * 0.6 * c.wave - 0.6 * lift * c.sip - Math.max(0, s(ph)) * 0.35 * sw;

  // legs
  const cheerTuck = c.cheer * (0.5 + 0.5 * s(t * 8)) * 0.5;
  const sitA = -PI / 2 * c.sit;
  const lw = -s(ph) * 0.8 * wlk, rw = s(ph) * 0.8 * wlk;
  rig.legL.hp.rotation.x = sitA + lw - cheerTuck;
  rig.legR.hp.rotation.x = sitA + rw - cheerTuck;
  rig.legL.hp.rotation.z = 0.04 + c.sit * 0.04;
  rig.legR.hp.rotation.z = -0.04 - c.sit * 0.04;
  const sitK = PI / 2 * c.sit, lieK = 0.18 * c.lie;
  rig.legL.kn.rotation.x = sitK + lieK + Math.max(0, Math.cos(ph)) * 0.95 * wlk + cheerTuck * 1.4;
  rig.legR.kn.rotation.x = sitK + Math.max(0, -Math.cos(ph)) * 0.95 * wlk + cheerTuck * 1.4;
  // lying: legs rest, slight cross
  rig.legR.hp.rotation.y = -0.1 * c.lie;
}
