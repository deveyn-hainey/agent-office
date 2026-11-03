// Behaviour state (FSM) derivation + human-readable activity / location strings for the UI.
import { STATES } from '../core/util.js';

export const FSM_STATES = ['hidden', 'idle', 'walking', 'at_desk', 'working', 'huddle', 'presenting', 'napping', 'needs_approval', 'thinking', 'stuck'];

export function deriveState(a) {
  if (!a.visible) return 'hidden';
  if (a.hasAlert) return 'needs_approval';
  if (a.status === 'error' || a.pose === 'stuck') return 'stuck';
  if (a.walk || a.riding || !a.arrived) return 'walking';
  if (a.pose === 'nap') return 'napping';
  if (a.pose === 'present') return 'presenting';
  if (a.thinking || a.pose === 'think') return 'thinking';
  const k = a.slotKind;
  if (k === 'desk') return a.status === 'working' ? 'working' : 'at_desk';
  if (k === 'huddle' || k === 'audience' || k === 'conf-seat' || k === 'whiteboard-front') return 'huddle';
  return 'idle';
}

export function statusColor(a) {
  if (a.hasAlert) return STATES.waiting.color;
  if (a.status === 'error') return STATES.error.color;
  return (STATES[a.status] || STATES.resting).color;
}

const KIND_DEST = {
  desk: 'a desk', sofa: 'the sofa', huddle: 'the huddle circle', 'whiteboard-front': 'the whiteboard', present: 'the presenter spot',
  audience: 'the team whiteboard', 'conf-seat': 'a conference room', coffee: 'the coffee bar', cooler: 'the water cooler', mural: 'the mural wall',
  elevator: 'the elevator', stairs: 'the stairs', ci: 'the CI wall', corkboard: 'the evidence board', xray: 'the Repo X-Ray', door: 'a conference room door',
  wander: 'a stroll', entrance: 'the entrance',
};

export function slotLabel(slot, world) {
  if (!slot) return 'somewhere';
  const room = slot.room && world?.room?.(slot.room);
  if (slot.kind === 'conf-seat' || slot.kind === 'present' || slot.kind === 'door') {
    const m = /3f-([ab])/.exec(slot.id);
    if (m) return `Conference Room ${m[1].toUpperCase()}`;
  }
  if (slot.kind === 'desk') {
    if (slot.id.startsWith('desk-4f-lead')) return 'the lead desk';
    if (slot.seat) return `the ${slot.seat} desk`;
    if (slot.id.startsWith('hot-')) return 'a hot desk';
  }
  if (slot.kind === 'sofa') return slot.floor === 0 ? 'the lobby sofa' : `the ${slot.floor + 1}F sofa`;
  if (slot.kind === 'huddle' && room?.label) return `the ${room.label.toLowerCase()}`;
  return KIND_DEST[slot.kind] || room?.label?.toLowerCase() || 'a spot';
}

export function locationLabel(a, world) {
  const floorNo = a.floor + 1;
  const fl = world?.data?.floors?.[a.floor];
  let place = '';
  const rooms = world?.rooms?.(a.floor) || [];
  let best = null;
  for (const r of rooms) {
    if (r.annot === false && !r.glass) continue;
    if (Math.abs(a.x - r.x) <= r.w / 2 && Math.abs(a.z - r.z) <= r.d / 2 && (!best || r.w * r.d < best.w * best.d)) best = r;
  }
  if (best?.label) place = best.label;
  return `${floorNo}F · ${place || fl?.name || 'Office'}`;
}

export function activityText(a, helpers) {
  const { world, slotOf } = helpers;
  const st = a.fsm;
  const task = (a.task || '').trim();
  if (st === 'hidden') return 'Not in the office';
  if (st === 'needs_approval') return task ? `Waiting for your call: ${task}` : 'Waiting for your call';
  if (st === 'stuck') return task ? `Stuck: ${task}` : 'Stuck, needs a hand';
  if (st === 'walking') {
    if (a.riding === 'elevator') return `Riding the elevator to ${a.rideTo + 1}F`;
    if (a.riding === 'stairs') return `Taking the stairs to ${a.rideTo + 1}F`;
    const d = a.destSlot ? world.slot(a.destSlot) : null;
    if (a.carry === 'binder') return 'Carrying a handoff binder' + (d ? ` to ${slotLabel(d, world)}` : '');
    if (a.carry === 'baton') return 'Passing the baton' + (d ? ` to ${slotLabel(d, world)}` : '');
    if (d && d.kind === 'coffee') return 'Heading for a coffee';
    return d ? `Heading to ${slotLabel(d, world)}` : 'Walking';
  }
  const slot = slotOf(a);
  switch (a.pose) {
    case 'nap': return `Napping on ${slot ? slotLabel(slot, world) : 'the sofa'}`.replace('on the sofa', 'on the sofa');
    case 'drink': return 'Grabbing a coffee';
    case 'draw': return 'Drawing on the lobby mural';
    case 'present': return task ? `Presenting: ${task}` : 'Presenting findings';
    case 'cheer': return 'Celebrating!';
    case 'wave': return 'Waving hello';
    case 'vote': return 'Casting a vote';
    case 'think': return 'Thinking it over';
    default: break;
  }
  if (a.speaking) return a.pose === 'stand' || a.pose === 'talk' ? 'Chatting' : 'Talking it through';
  if (st === 'thinking') return 'Thinking it over';
  if (st === 'working') {
    if (!task) return 'Typing at their desk';
    return /[\/.]/.test(task) && !/\s/.test(task) ? `Typing in ${task}` : `Working on ${task}`;
  }
  if (st === 'at_desk') return task ? `At the desk: ${task}` : 'At the desk';
  if (st === 'huddle') {
    if (slot?.kind === 'conf-seat') return `In ${slotLabel(slot, world)}`;
    if (slot?.kind === 'audience') return 'Listening at the team board';
    return 'Planning at the huddle circle';
  }
  if (slot) {
    if (slot.kind === 'cooler') return 'At the water cooler';
    if (slot.kind === 'coffee') return 'Grabbing a coffee';
    if (slot.kind === 'mural') return 'Studying the mural wall';
    if (slot.kind === 'ci') return 'Watching the CI wall';
    if (slot.kind === 'corkboard') return 'Studying the evidence board';
    if (slot.kind === 'xray') return 'Reading the Repo X-Ray';
    if (slot.kind === 'present') return 'Ready to present';
    if (slot.kind === 'wander') return 'Stretching legs';
  }
  return task || 'Standing by';
}
