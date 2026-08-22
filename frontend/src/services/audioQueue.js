// Gapless MP3 chunk playback. MediaSource would be lower-latency, but its
// MP3 support is uneven across browsers. Decoding each chunk via AudioContext
// is universally supported and the latency cost is ~30ms per chunk — fine.

export class AudioQueue {
  constructor() {
    this.ctx = null;
    this.queue = [];
    this.playing = false;
    this.currentSource = null;
    this.startTime = 0;
  }

  _ensureCtx() {
    if (!this.ctx || this.ctx.state === "closed") {
      // 24kHz matches edge-tts's default output sample rate; avoids resampling cost.
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  async enqueue(arrayBuffer) {
    this._ensureCtx();
    try {
      const decoded = await this.ctx.decodeAudioData(arrayBuffer);
      this.queue.push(decoded);
      if (!this.playing) this._playNext();
    } catch (err) {
      console.warn("audio decode failed", err);
    }
  }

  _playNext() {
    const buf = this.queue.shift();
    if (!buf) {
      this.playing = false;
      this.currentSource = null;
      return;
    }
    this.playing = true;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    const startAt = Math.max(now, this.startTime);
    src.start(startAt);
    this.startTime = startAt + buf.duration;
    this.currentSource = src;
    src.onended = () => this._playNext();
  }

  // Barge-in: cut audio immediately, drop the queue.
  async stop() {
    this.queue = [];
    this.startTime = 0;
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch (_) { /* already stopped */ }
      this.currentSource = null;
    }
    this.playing = false;
  }
}
