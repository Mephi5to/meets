/**
 * Browser detection utilities.
 *
 * Used to route around engine-specific WebRTC and Web Audio bugs
 * (e.g. Safari's broken MediaStreamAudioSourceNode with remote streams).
 */

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

/**
 * True in Safari (desktop & mobile), false in all Chromium-based browsers
 * (Chrome, Edge, Opera, Yandex, Arc, etc.) and Firefox.
 *
 * Safari identifies itself with "Safari/" but NOT "Chrome/" or "Chromium/".
 * Chromium-based browsers include both "Chrome/" and "Safari/" in their UA.
 */
export const IS_SAFARI =
  /safari/i.test(ua) && !/chrome|chromium|edg|opr|yabrowser/i.test(ua)

/**
 * True on any iOS browser (Safari, Chrome on iOS, Firefox on iOS).
 * ALL iOS browsers use WebKit under the hood, so they share Safari's quirks.
 */
export const IS_IOS =
  /iPad|iPhone|iPod/.test(ua) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/**
 * True on Firefox (desktop & mobile).
 */
export const IS_FIREFOX = /firefox/i.test(ua)

/**
 * Whether the browser uses the WebKit engine (Safari + all iOS browsers).
 * These share the same Web Audio API limitations with remote WebRTC streams.
 */
export const IS_WEBKIT = IS_SAFARI || IS_IOS
