// Gapless MP3 playback. MediaSource would be lower-latency, but its MP3
// support is uneven across browsers. Decoding via AudioContext is universally
// supported — but decodeAudioData needs a complete, self-contained file, and
// the server streams raw MP3 in small chunks whose boundaries don't line up
// with MP3 frame boundaries. Decoding each chunk independently made most of
// them silently fail (caught below, dropped). Instead we buffer all chunks
// for one TTS sentence (the server sends an explicit boundary marker) and
// decode that complete blob once — the one-sentence wait costs a little
// latency but actually plays reliably.

export class AudioQueue {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.queue = [];
    this.playing = false;
    this.currentSource = null;
    this.startTime = 0;
    this._pendingChunks = [];
    // Bumped on every stop() so a decode that was in flight at cancel time
    // can tell it's stale once decodeAudioData resolves, instead of pushing
    // canceled audio back into the queue and restarting playback — see stop().
    this._generation = 0;
  }

  _ensureCtx() {
    if (!this.ctx || this.ctx.state === "closed") {
      // 24kHz matches edge-tts's default output sample rate; avoids resampling cost.
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      // Sits between every buffer source and the speakers so the visualizer
      // can read playback levels without touching the playback graph itself.
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.6;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  // Accumulate a raw MP3 chunk — not independently decodable, held until endSentence().
  addChunk(arrayBuffer) {
    this._pendingChunks.push(new Uint8Array(arrayBuffer));
  }

  // Decode everything accumulated since the last call as one complete file.
  async endSentence() {
    if (this._pendingChunks.length === 0) return;
    const chunks = this._pendingChunks;
    this._pendingChunks = [];
    const generation = this._generation;

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    this._ensureCtx();
    try {
      const decoded = await this.ctx.decodeAudioData(merged.buffer);
      // A stop() (barge-in) landed while decodeAudioData was in flight —
      // this sentence was canceled, so drop it instead of queuing/playing
      // audio the user already interrupted.
      if (generation !== this._generation) return;
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
    src.connect(this.analyser);

    const now = this.ctx.currentTime;
    const startAt = Math.max(now, this.startTime);
    src.start(startAt);
    this.startTime = startAt + buf.duration;
    this.currentSource = src;
    src.onended = () => this._playNext();
  }

  // Barge-in: cut audio immediately, drop the queue.
  async stop() {
    this._generation++;
    this.queue = [];
    this._pendingChunks = [];
    this.startTime = 0;
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch (_) { /* already stopped */ }
      this.currentSource = null;
    }
    this.playing = false;
  }
}
