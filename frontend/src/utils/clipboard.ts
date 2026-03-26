/**
 * Copy text to clipboard with fallback for older browsers.
 *
 * navigator.clipboard.writeText requires:
 * - HTTPS (or localhost)
 * - Document focus (Firefox)
 * - Clipboard API support
 *
 * Falls back to the legacy execCommand('copy') approach via a hidden textarea.
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Modern path — Clipboard API
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to legacy path
    }
  }

  // Legacy fallback — works in all browsers with DOM access
  const textarea = document.createElement('textarea')
  textarea.value = text
  // Prevent scrolling
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}
