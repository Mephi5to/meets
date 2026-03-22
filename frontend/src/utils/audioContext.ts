/**
 * Shared AudioContext singleton.
 *
 * Chrome blocks audio playback (via <audio>.play() and new AudioContext())
 * when called outside a user-gesture context.  The key insight is that
 * AudioContext.resume() *can* succeed if the page already has "user gesture
 * activation credit" — i.e. the user has recently clicked something.
 *
 * We create the context lazily and call resume() at two points:
 *   1. In ConferenceRoom's join effect — runs right after the user clicked
 *      "Join Room", so gesture credit is still fresh.
 *   2. On any click inside the room container — belt-and-suspenders fallback.
 *
 * Remote audio is then routed through MediaStreamAudioSourceNode → destination,
 * bypassing <audio> autoplay restrictions entirely.
 */

let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext()
  }
  return ctx
}

/** Call this during or immediately after a user gesture to unlock the context. */
export function resumeAudioContext(): void {
  const c = getAudioContext()
  if (c.state === 'suspended') {
    c.resume().catch(() => {})
  }
}
