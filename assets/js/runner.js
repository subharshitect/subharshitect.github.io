// Drives one animation loop. It runs only while all of these hold:
// the caller wants it running, the element is on screen, the tab is visible,
// and (unless the visitor explicitly pressed play) motion is allowed by
// the reading/motion preferences and the system reduced-motion setting.

function motionAllowed() {
  return window.SRPrefs ? window.SRPrefs.motionAllowed() : true;
}

export class Runner {
  constructor(target, onTick, { respectPrefs = true } = {}) {
    this.target = target;
    this.onTick = onTick;
    this.respectPrefs = respectPrefs;
    this.wanted = true;
    this.onScreen = true;
    this.raf = 0;
    this.last = 0;
    this.onChange = null;
    this.loop = this.loop.bind(this);
    this.update = this.update.bind(this);
    if ("IntersectionObserver" in window) {
      this.io = new IntersectionObserver((entries) => {
        this.onScreen = entries[entries.length - 1].isIntersecting;
        this.update();
      });
      this.io.observe(target);
    }
    document.addEventListener("visibilitychange", this.update);
    window.addEventListener("sr:prefs", this.update);
  }

  get blockedByPrefs() {
    return this.respectPrefs && !motionAllowed();
  }

  get active() {
    return this.wanted && this.onScreen && !document.hidden && !this.blockedByPrefs;
  }

  setWanted(wanted, { explicit = false } = {}) {
    this.wanted = wanted;
    // An explicit play press overrides the motion preference for this runner.
    if (explicit && wanted) this.respectPrefs = false;
    this.update();
  }

  update() {
    const active = this.active;
    if (active && !this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.loop);
    } else if (!active && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (this.onChange) this.onChange(active);
  }

  loop(ts) {
    this.raf = 0;
    if (!this.active) return;
    // Clamp long gaps (tab switches, debugger pauses) so playback never jumps.
    const dt = this.last ? Math.min(ts - this.last, 100) / 1000 : 0;
    this.last = ts;
    this.onTick(dt);
    this.raf = requestAnimationFrame(this.loop);
  }
}

// Turns a steps-per-second rate into whole steps per animation frame.
export class StepClock {
  constructor() { this.carry = 0; }
  take(dt, stepsPerSecond) {
    this.carry += dt * stepsPerSecond;
    const n = Math.floor(this.carry);
    this.carry -= n;
    return n;
  }
  reset() { this.carry = 0; }
}
