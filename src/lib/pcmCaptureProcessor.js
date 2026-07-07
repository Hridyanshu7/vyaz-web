// AudioWorklet processor: captures mic audio off the main thread, batches it to ~2048
// samples (~128ms at 16kHz), converts Float32 → Int16 PCM, and posts it to the main
// thread. Replaces the deprecated main-thread ScriptProcessorNode (see DECISIONS A9) so
// mic capture no longer competes with UI rendering. Loaded via audioWorklet.addModule().
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._chunks = []
    this._count = 0
    this._target = 2048
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) {
      this._chunks.push(ch.slice())
      this._count += ch.length
      if (this._count >= this._target) {
        const merged = new Float32Array(this._count)
        let offset = 0
        for (const c of this._chunks) { merged.set(c, offset); offset += c.length }
        const int16 = new Int16Array(merged.length)
        for (let i = 0; i < merged.length; i++) {
          const s = Math.max(-1, Math.min(1, merged[i]))
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        this.port.postMessage(int16.buffer, [int16.buffer])
        this._chunks = []
        this._count = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor)
