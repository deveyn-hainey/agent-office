// Pose table + channel blending. Each pose is a set of target channel values; channels ease toward them,
// so every pose change blends smoothly. Oscillating motion is applied from channel *amplitudes* in meeple.applyRig.

export const CHANNELS = {
  hipY: 0, lean: 0, lie: 0, sit: 0, headP: 0, headR: 0,
  aLx: 0, aLz: 0.12, aLe: -0.08, aRx: 0, aRz: 0.12, aRe: -0.08,
  walk: 0, type: 0, talk: 0, nod: 0, draw: 0, wave: 0, cheer: 0, sip: 0, shake: 0, eyeClose: 0, aim: 0, swing: 1,
};
// channels that should move slowly (posture changes)
const SLOW = new Set(['sit', 'lie', 'hipY', 'lean']);

const sitArms = { aLx: -0.7, aRx: -0.7, aLe: -0.5, aRe: -0.5, aLz: 0.14, aRz: 0.14 };

export const POSES = {
  stand: {},
  sit: { sit: 1, hipY: -0.3, headP: 0.04, ...sitArms },
  'sit-type': { sit: 1, hipY: -0.3, lean: 0.1, headP: 0.3, aLx: -1.0, aRx: -1.0, aLe: -0.9, aRe: -0.9, aLz: 0.12, aRz: 0.12, type: 1 },
  nap: { lie: 1, headP: 0.0, headR: 0.12, eyeClose: 1, aLx: -0.3, aRx: -0.3, aLe: -1.5, aRe: -1.5, aLz: -0.45, aRz: -0.45 },
  cheer: { cheer: 1, aLx: -2.9, aRx: -2.9, aLz: 0.5, aRz: 0.5, aLe: -0.1, aRe: -0.1 },
  drink: { sip: 1, aRx: -0.75, aRe: -1.95, aRz: 0.05, aLx: -0.4, aLe: -1.2, aLz: -0.1, headP: -0.05 },
  draw: { draw: 1, aRx: -2.55, aRe: -0.15, aRz: 0.15, aLx: 0, headP: -0.12, lean: 0.04 },
  present: { aim: 1, aRx: -1.5, aRe: -0.12, aRz: 0.05, aLx: -0.9, aLe: -0.9, aLz: 0.35, talk: 0.6 },
  wave: { wave: 1, aRx: -2.7, aRe: -0.2, aRz: 0.25, headR: -0.08 },
  think: { aRx: -1.75, aRe: -2.4, aRz: 0, aLx: -0.9, aLe: -1.5, aLz: -0.2, headP: 0.12, headR: 0.14 },
  talk: { talk: 1 },
  listen: { nod: 1, aLx: -0.5, aLe: -1.7, aLz: -0.2, aRx: -0.5, aRe: -1.7, aRz: -0.2 },
  vote: { aRx: -2.75, aRe: -0.12, aRz: 0.18, headP: -0.05 },
  carry: { swing: 0, aLx: -1.05, aRx: -1.05, aLe: -1.0, aRe: -1.0, aLz: -0.15, aRz: -0.15 },
  stuck: { shake: 1, aLx: -2.35, aRx: -2.35, aLe: -2.1, aRe: -2.1, aLz: -0.25, aRz: -0.25, headP: 0.25 },
};
// sitting variants that keep the talk/nod amplitude from the stand version
for (const k of ['talk', 'listen', 'think']) POSES['sit-' + k] = { ...POSES[k], sit: 1, hipY: -0.3, ...(k === 'talk' ? { aLx: -0.9, aRx: -0.9, aLe: -0.7, aRe: -0.7 } : {}) };

// which prop each pose shows
export const POSE_PROPS = { drink: ['cup'], draw: ['pen'], present: ['pointer'], vote: ['ballot'], wave: [], cheer: [] };

export const PUBLIC_POSES = ['stand', 'sit', 'sit-type', 'nap', 'cheer', 'drink', 'draw', 'present', 'wave', 'think', 'talk', 'listen', 'vote', 'carry', 'stuck'];

export function makeChannels() { return { ...CHANNELS }; }

export function targetFor(pose, extra) {
  const base = POSES[pose] || POSES.stand;
  const t = { ...CHANNELS, ...base };
  if (extra) for (const k in extra) t[k] = extra[k];
  return t;
}

// ease channels toward target (exponential), instant when snap
export function stepChannels(cur, tgt, dt, snap) {
  if (snap) { for (const k in tgt) cur[k] = tgt[k]; return; }
  const kFast = 1 - Math.exp(-9 * dt), kSlow = 1 - Math.exp(-4.2 * dt), kAmp = 1 - Math.exp(-6 * dt);
  for (const k in tgt) {
    const f = SLOW.has(k) ? kSlow : (k === 'walk' || k === 'type' || k === 'talk' || k === 'nod' || k === 'cheer' || k === 'draw' || k === 'wave' || k === 'sip' || k === 'shake' || k === 'aim') ? kAmp : kFast;
    cur[k] += (tgt[k] - cur[k]) * f;
  }
}
