import type { TurnCredentials } from '../types'

/**
 * Tests TURN server reachability by creating a disposable RTCPeerConnection
 * and checking whether a relay ICE candidate appears within the timeout.
 *
 * Returns 'ok' if at least one relay candidate is gathered, 'unreachable'
 * if the timeout expires with no relay candidate, or 'error' on exceptions.
 *
 * This check runs BEFORE joining the room so the user gets early feedback
 * instead of a silent black screen when TURN is blocked (e.g. by DPI in Russia).
 */
export type TurnCheckResult = 'ok' | 'unreachable' | 'error'

export async function checkTurnConnectivity(
  creds: TurnCredentials,
  timeoutMs = 5000,
): Promise<TurnCheckResult> {
  let pc: RTCPeerConnection | null = null

  try {
    pc = new RTCPeerConnection({
      iceServers: [{
        urls: creds.turnUrls,
        username: creds.username,
        credential: creds.credential,
      }],
      iceTransportPolicy: 'relay',
    })

    const result = await new Promise<TurnCheckResult>((resolve) => {
      const timer = setTimeout(() => resolve('unreachable'), timeoutMs)

      pc!.onicecandidate = (e) => {
        if (e.candidate?.type === 'relay') {
          clearTimeout(timer)
          resolve('ok')
        }
      }

      // Gathering needs a data channel or media to start
      pc!.createDataChannel('turn-check')
      pc!.createOffer()
        .then((offer) => pc!.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timer)
          resolve('error')
        })
    })

    return result
  } catch {
    return 'error'
  } finally {
    pc?.close()
  }
}
