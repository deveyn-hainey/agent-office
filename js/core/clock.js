// Simulation clock. t = sim seconds since boot. All animation/scenario time derives from tick().
import { TZ } from './util.js';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
});

// Real America/Denver wall-clock time (independent of sim speed).
export function denverNow(d = new Date()) {
  const p = {};
  for (const x of partsFmt.formatToParts(d)) p[x.type] = parseInt(x.value, 10);
  const h = p.hour % 24;
  return { year: p.year, month: p.month, day: p.day, h, m: p.minute, s: p.second, hours: h + p.minute / 60 + p.second / 3600, ms: d.getTime() };
}

export function createClock(bus) {
  const clock = {
    t: 0,
    speed: 1,
    paused: false,
    seeking: false, // true while the director fast-forwards; modules must snap, not animate
    baseMs: Date.now(),
    now() { return clock.t; },
    // advance by a real delta; returns the sim delta to use this frame (0 when paused)
    tick(realDt) {
      const dt = clock.paused ? 0 : realDt * clock.speed;
      clock.t += dt;
      return dt;
    },
    setSpeed(s) {
      clock.speed = Math.max(0.1, Math.min(16, +s || 1));
      bus?.emit('clock:speed', { speed: clock.speed });
    },
    pause() { if (!clock.paused) { clock.paused = true; bus?.emit('clock:pause', { paused: true }); } },
    play() { if (clock.paused) { clock.paused = false; bus?.emit('clock:pause', { paused: false }); } },
    toggle() { clock.paused ? clock.play() : clock.pause(); },
    simDate() { return new Date(clock.baseMs + clock.t * 1000); },
    denver() { return denverNow(); },
  };
  return clock;
}
