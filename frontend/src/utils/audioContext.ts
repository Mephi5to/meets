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
 *
 * NOTE: On WebKit (Safari / iOS), remote WebRTC audio is played via <audio>
 * elements instead of Web Audio API, because WebKit's MediaStreamAudioSourceNode
 * has a known bug that silences remote WebRTC streams.  See VideoTile.tsx.
 */

// Safari 14.0 and older expose `webkitAudioContext` instead of `AudioContext`.
// All iOS browsers (Chrome-iOS, Firefox-iOS) also use WebKit and may need this.
const AudioCtx =
  typeof AudioContext !== 'undefined'
    ? AudioContext
    : typeof (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext !== 'undefined'
      ? (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      : null

let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    if (!AudioCtx) throw new Error('AudioContext is not supported in this browser')
    ctx = new AudioCtx()
  }
  return ctx
}

/** Call this during or immediately after a user gesture to unlock the context. */
export function resumeAudioContext(): void {
  try {
    const c = getAudioContext()
    if (c.state === 'suspended') {
      c.resume().catch(() => {})
    }
  } catch {
    // AudioContext not supported — audio will be handled via <audio> element fallback
  }
}
