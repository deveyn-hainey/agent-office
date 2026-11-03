// Bot character: glossy rounded shape (sphere / capsule / rounded cube / star / bell) with two black dot eyes.
// Same factory + applyRig contract as the old meeple rig (file name kept). Pure presentation; no world knowledge.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { hash } from '../core/util.js';

export const HIP = 0;
export const LIE_Y = 0;
export const SCALE = 1;

const BODY_SCALE = 1.3;
const CLEAR = 0.58; // gap between floor and the lowest point of the bot (hovering / sunk into the seat)

// shape kind per agent id: 0 sphere blob, 1 capsule, 2 rounded cube, 3 star, 4 lathe bell
const KINDS = { lead: 1, codex: 0, muse: 2, musecode: 3, grok: 4, cursor: 0, argon: 3, chatgpt: 1, reva: 2, revb: 0, ops: 4, scout: 0 };

export function createMeepleFactory(ctx) {
  const { THREE } = ctx.scene;

  function bodyGeo(kind) {
    switch (kind) {
      case 0: { const g = new THREE.SphereGeometry(0.5, 32, 24); g.scale(1, 0.95, 1); return { g, eye: { y: 0.1, x: 0.16, z: 0.455 } }; }
      case 1: return { g: new THREE.CapsuleGeometry(0.34, 0.45, 8, 20), eye: { y: 0.12, x: 0.12, z: 0.315 } };
      case 2: return { g: new RoundedBoxGeometry(0.85, 0.85, 0.85, 6, 0.2), eye: { y: 0.05, x: 0.19, z: 0.425 } };
      case 3: {
        const s = new THREE.Shape();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 0.3 : 0.65, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
          i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 5 });
        g.center();
        return { g, eye: { y: 0.0, x: 0.13, z: 0.205 } };
      }
      default: {
        const pts = [[0, -0.5], [0.3, -0.46], [0.5, -0.25], [0.44, 0.05], [0.28, 0.33], [0.12, 0.52], [0, 0.56]].map(([x, y]) => new THREE.Vector2(x, y));
        return { g: new THREE.LatheGeometry(pts, 32), eye: { y: 0.08, x: 0.15, z: 0.385 } };
      }
    }
  }

  const G = {
    eye: new THREE.SphereGeometry(0.058, 14, 10),
    disc: new THREE.CircleGeometry(0.75, 28),
    pick: new THREE.CylinderGeometry(0.8, 0.8, 2.6, 8),
  };
  G.disc.rotateX(-Math.PI / 2);

  // ballot textures (YES / NO) shared
  const ballotTex = {};
  function ballotTexture(choice) {
    if (ballotTex[choice]) return ballotTex[choice];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 90;
    const g = c.getContext('2d');
    const yes = choice === 'yes';
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 90);
    g.fillStyle = yes ? '#3fae5a' : '#e25a4f'; g.fillRect(8, 8, 112, 74);
    g.fillStyle = '#fff'; g.font = '700 40px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(yes ? 'YES' : 'NO', 64, 47);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    ballotTex[choice] = tex;
    return tex;
  }

  function build(team) {
    const mats = []; // everything that can fade
    const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }); mats.push(m); return m; };
    const kind = team.id in KINDS ? KINDS[team.id] : hash(team.id) % 5;
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: team.color || '#888', roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.3, side: kind === 4 ? THREE.DoubleSide : THREE.FrontSide });
    mats.push(bodyMat);
    const mBlack = std('#16181d', { roughness: 0.5 });

    const root = new THREE.Group();
    root.name = 'agent-' + team.id;
    const inner = new THREE.Group(); // scaled visual root (pop-in scale lives here)
    root.add(inner);

    // soft blob shadow on the ground (in root space so it doesn't tilt/bob) + invisible status ring kept for API compatibility
    const shadow = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.1, depthWrite: false }));
    shadow.position.y = 0.04; shadow.userData.noPick = true; shadow.renderOrder = 1;
    const ring = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: '#a49d90', transparent: true, opacity: 0, depthWrite: false }));
    ring.visible = false; ring.userData.noPick = true;
    root.add(shadow, ring);

    // body pivot (everything animated hangs off it)
    const { g, eye } = bodyGeo(kind);
    g.computeBoundingBox();
    const minY = g.boundingBox.min.y * BODY_SCALE, maxY = g.boundingBox.max.y * BODY_SCALE;
    const baseY = CLEAR - minY;
    const body = new THREE.Group();
    const bodyPivot = new THREE.Group(); // yaw / tilt / squash target, so body.position stays pure height
    body.add(bodyPivot);
    inner.add(body);
    const mesh = new THREE.Mesh(g, bodyMat);
    mesh.scale.setScalar(BODY_SCALE);
    mesh.castShadow = true;
    bodyPivot.add(mesh);
    const eyes = [];
    for (const sx of [-1, 1]) {
      const eb = new THREE.Mesh(G.eye, mBlack);
      eb.position.set(sx * eye.x * BODY_SCALE, eye.y * BODY_SCALE, eye.z * BODY_SCALE);
      eb.scale.set(BODY_SCALE, BODY_SCALE, BODY_SCALE * 0.7);
      eb.userData.noPick = true;
      bodyPivot.add(eb);
      eyes.push(eb);
    }
    // lathe/star front: nudge eyes out slightly so they never z-fight with the body
    body.position.y = baseY;

    /* ---- props (float beside / in front of the bot) ---- */
    const props = {};
    const mk = (name, build) => { const gp = new THREE.Group(); gp.visible = false; build(gp); bodyPivot.add(gp); props[name] = gp; return gp; };
    const lit = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const mWhite = std('#ffffff');
    mk('cup', (gp) => {
      lit(new THREE.CylinderGeometry(0.1, 0.075, 0.2, 14), mWhite, gp);
      lit(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 14), std('#6b4426'), gp, 0, 0.095, 0);
      gp.position.set(0.72, 0.0, 0.55);
    });
    mk('pen', (gp) => {
      lit(new THREE.CapsuleGeometry(0.035, 0.34, 3, 8), std('#16181d'), gp);
      gp.position.set(0.68, 0.05, 0.62); gp.rotation.set(0.6, 0, -0.5);
    });
    const pointer = mk('pointer', (gp) => {
      lit(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), std('#e8e9ec'), gp, 0, 0, 0.75).rotation.x = Math.PI / 2;
      lit(new THREE.SphereGeometry(0.05, 8, 8), std('#e25a4f'), gp, 0, 0, 1.5);
      gp.position.set(0.6, 0.05, 0.3);
    });
    mk('baton', (gp) => {
      const b = lit(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 12), std('#f2b632'), gp);
      b.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) lit(new THREE.CylinderGeometry(0.065, 0.065, 0.07, 12), mBlack, gp, s * 0.3, 0, 0).rotation.z = Math.PI / 2;
      gp.position.set(0.0, -0.35, 0.8);
    });
    // ballot card (both faces readable)
    const cards = {};
    mk('ballot', (gp) => {
      const cardGeo = new THREE.PlaneGeometry(0.78, 0.55);
      for (const k of ['yes', 'no']) {
        const m = new THREE.MeshBasicMaterial({ map: ballotTexture(k), transparent: true, side: THREE.DoubleSide });
        mats.push(m);
        const f = new THREE.Mesh(cardGeo, m);
        f.userData.noPick = true; f.visible = false; gp.add(f); cards[k] = f;
      }
      gp.position.set(0.55, 0.85, 0.35);
    });
    mk('binder', (gp) => {
      lit(new RoundedBoxGeometry(0.62, 0.8, 0.13, 3, 0.04), std('#3d7be0'), gp);
      lit(new THREE.BoxGeometry(0.5, 0.68, 0.02), mWhite, gp, 0, 0, 0.07);
      lit(new THREE.BoxGeometry(0.1, 0.1, 0.03), std('#f2b632'), gp, 0, 0.2, 0.09);
      gp.position.set(0, -0.15, 0.78); gp.rotation.x = -0.15;
    });

    // click target (invisible, generous)
    const pickM = new THREE.Mesh(G.pick, new THREE.MeshBasicMaterial({ visible: false }));
    pickM.position.y = 1.3; root.add(pickM);
    root.userData.pick = { type: 'agent', id: team.id };

    const rig = {
      root, inner, body, bodyPivot, mesh, eyes, pointer, baseY, topY: baseY + maxY, shadow, ring, props, cards, mats, pickM,
      setProp(names) { // names: array of prop keys to show
        for (const k in props) props[k].visible = names.includes(k);
      },
      showCard(choice) { cards.yes.visible = choice === 'yes'; cards.no.visible = choice === 'no'; },
      setFade(f) {
        for (const m of mats) { const tr = f < 0.999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = f; }
        shadow.material.opacity = 0.1 * f;
      },
      ringColor() { /* status is shown by the floating badge instead */ },
    };
    return rig;
  }

  return { build };
}

/* Apply channel values (c) to the rig. st: {t, ph (walk phase), headYaw, blink, aimR, seed}
   Pose -> motion: walk = hop + squash/stretch + forward lean; type = tiny forward tilt + jitter; talk = quick bounce;
   nap = tilted on the sofa; present = forward tilt toward the board; draw = bob + sway; cheer = jumps; stuck = shudder. */
export function applyRig(rig, c, st) {
  const s = Math.sin;
  const t = st.t, ph = st.ph;
  const wlk = c.walk;
  const hop = Math.abs(s(ph)) * 0.14 * wlk;
  const jump = Math.abs(s(t * 8)) * 0.8 * c.cheer;
  const talkB = Math.abs(s(t * 6.5)) * 0.05 * c.talk;
  const breathe = s(t * 2.2 + st.seed) * 0.018;
  const draw = s(t * 2.1) * 0.06 * c.draw;
  const typeJ = s(t * 13) * 0.012 * c.type;
  const float = (1 - c.sit) * (1 - c.lie) * (1 - wlk) * s(t * 1.6 + st.seed) * 0.03; // idle hover
  rig.body.position.y = rig.baseY + hop + jump + talkB + draw + typeJ + float + c.lie * 0.0 - 0.02 * c.sit;

  const bp = rig.bodyPivot;
  bp.rotation.order = 'YXZ';
  // turn the whole body toward the look target
  bp.rotation.y = st.headYaw + s(t * 18) * 0.22 * c.shake + s(t * 9) * 0.25 * c.wave * 0;
  // forward tilt: walking lean, working lean, presenting/looking down, sip leans back
  bp.rotation.x = 0.2 * wlk + c.lean * 1.2 + c.headP * 0.7 + 0.18 * c.aim + s(t * 4.4) * 0.1 * c.nod + s(t * 7 + 1) * 0.04 * c.talk
    - 0.15 * c.sip - 0.12 * c.cheer + s(t * 1.1 + st.seed) * 0.03 * c.type;
  // side tilt: sofa nap, head-cock (think), wobble while walking, shake / wave / draw sway
  bp.rotation.z = 0.95 * c.lie + c.headR * 1.1 + s(ph) * 0.07 * wlk + s(t * 1.3 + st.seed) * 0.012 * (1 - wlk)
    + s(t * 15) * 0.1 * c.shake + s(t * 9) * 0.22 * c.wave + s(t * 1.7) * 0.18 * c.draw + s(t * 3) * 0.03 * c.talk;
  // squash & stretch (volume-ish preserving) — walking hop, cheer landings, talk pulse, breathing
  const sq = -Math.cos(ph * 2) * 0.09 * wlk + (s(t * 8 - 1.2) * 0.5 + 0.1) * 0.1 * c.cheer + s(t * 6.5) * 0.025 * c.talk + breathe;
  bp.scale.set(1 - sq * 0.55, 1 + sq, 1 - sq * 0.55);
  bp.position.y = 0;

  // eyes: blink / sleep
  const eyeScale = 1 - 0.92 * Math.max(st.blink, c.eyeClose);
  for (const e of rig.eyes) e.scale.y = rig.eyes[0].scale.x * eyeScale;

  // pointer swings toward the board
  rig.pointer.rotation.y = st.aimR * c.aim * 0.6 + s(t * 1.2) * 0.03;
}
