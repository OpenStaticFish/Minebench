/** A quiet wind bed and short synthesized bird calls, opt-in. */
export class Ambience {
  private ctx?: AudioContext;
  private wind?: AudioBufferSourceNode;
  private timer?: number;
  on = false;
  async toggle() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const ctx = this.ctx,
        buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate),
        d = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) d[i] = last = (last + (Math.random() - 0.5) * 0.02) / 1.02;
      this.wind = ctx.createBufferSource();
      this.wind.buffer = buffer;
      this.wind.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 490;
      this.wind.connect(filter).connect(ctx.destination);
      this.wind.start();
    }
    if (this.on) {
      await this.ctx.suspend();
      clearInterval(this.timer);
    } else {
      await this.ctx.resume();
      this.timer = window.setInterval(() => this.chirp(), 5300);
    }
    this.on = !this.on;
    return this.on;
  }
  private chirp() {
    const ctx = this.ctx;
    if (!ctx || document.hidden) return;
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator(),
        g = ctx.createGain(),
        t = ctx.currentTime + i * 0.14;
      o.frequency.setValueAtTime(1900 + i * 330, t);
      o.frequency.exponentialRampToValueAtTime(2970, t + 0.085);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.025, t + 0.017);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.104);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.11);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    }
  }
  dispose() {
    clearInterval(this.timer);
    this.wind?.stop();
    void this.ctx?.close();
  }
}
