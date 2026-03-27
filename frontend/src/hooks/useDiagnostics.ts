import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectionStats } from '../types'

const POLL_INTERVAL_MS = 2000

export function useDiagnostics(
  getPeerConnections: () => Map<string, RTCPeerConnection>
) {
  const [stats, setStats] = useState<Map<string, ConnectionStats>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const collectStats = useCallback(async () => {
    const pcs = getPeerConnections()
    const result = new Map<string, ConnectionStats>()

    for (const [peerId, pc] of pcs.entries()) {
      if (pc.connectionState === 'closed') continue

      try {
        const report = await pc.getStats()
        const parsed = parseStats(report)
        result.set(peerId, parsed)
      } catch {
        // Connection may have closed
      }
    }

    setStats(result)
  }, [getPeerConnections])

  useEffect(() => {
    intervalRef.current = setInterval(collectStats, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [collectStats])

  // Aggregate stats across all peer connections (worst-case values shown)
  const aggregated: ConnectionStats | null = (() => {
    if (stats.size === 0) return null

    let maxRtt: number | null = null
    let maxLoss: number | null = null
    let transport: ConnectionStats['transport'] = 'unknown'
    let candidateType = 'unknown'
    let bytesSent = 0
    let bytesReceived = 0
    let selectedCandidatePairUrl: string | undefined

    for (const s of stats.values()) {
      if (s.rtt !== null && (maxRtt === null || s.rtt > maxRtt)) maxRtt = s.rtt
      if (s.packetLoss !== null && (maxLoss === null || s.packetLoss > maxLoss))
        maxLoss = s.packetLoss
      if (s.transport !== 'unknown') transport = s.transport
      candidateType = s.candidateType
      bytesSent += s.bytesSent
      bytesReceived += s.bytesReceived
      if (s.selectedCandidatePairUrl) selectedCandidatePairUrl = s.selectedCandidatePairUrl
    }

    return { rtt: maxRtt, packetLoss: maxLoss, transport, candidateType, bytesSent, bytesReceived, selectedCandidatePairUrl }
  })()

  return { stats, aggregated }
}

function parseStats(report: RTCStatsReport): ConnectionStats {
  let rtt: number | null = null
  let packetLoss: number | null = null
  let transport: ConnectionStats['transport'] = 'unknown'
  let candidateType = 'unknown'
  let bytesSent = 0
  let bytesReceived = 0
  let selectedCandidatePairUrl: string | undefined

  let activePairId: string | null = null
  let activeLocalCandidateId: string | null = null

  for (const stat of report.values()) {
    if (stat.type === 'transport') {
      activePairId = (stat as RTCTransportStats & { selectedCandidatePairId?: string })
        .selectedCandidatePairId ?? null
    }
  }

  for (const stat of report.values()) {
    if (stat.type === 'candidate-pair') {
      const pair = stat as RTCIceCandidatePairStats
      if (activePairId && stat.id !== activePairId) continue
      if (pair.nominated || activePairId === stat.id) {
        if (pair.currentRoundTripTime !== undefined) {
          rtt = Math.round(pair.currentRoundTripTime * 1000)
        }
        if (pair.bytesSent) bytesSent = pair.bytesSent
        if (pair.bytesReceived) bytesReceived = pair.bytesReceived
        activeLocalCandidateId = (pair as unknown as { localCandidateId?: string }).localCandidateId ?? null
      }
    }

    if (stat.type === 'inbound-rtp') {
      const inbound = stat as RTCInboundRtpStreamStats
      if (inbound.kind === 'video') {
        const lost = inbound.packetsLost ?? 0
        const received = inbound.packetsReceived ?? 0
        const total = lost + received
        packetLoss = total > 0 ? Math.round((lost / total) * 100 * 10) / 10 : 0
      }
    }

    if (stat.type === 'remote-candidate') {
      const candidate = stat as {
        candidateType?: RTCIceCandidateType
        protocol?: string
        url?: string
      }
      candidateType = candidate.candidateType ?? 'unknown'

      if (candidate.candidateType === 'relay') {
        transport = 'relay'
      } else if (candidate.candidateType === 'host' || candidate.candidateType === 'srflx') {
        transport = candidate.protocol === 'udp' ? 'udp' : 'tcp'
      }
    }
  }

  // Extract the TURN URL used for the active local relay candidate
  if (activeLocalCandidateId) {
    for (const stat of report.values()) {
      if (stat.id === activeLocalCandidateId) {
        const localCand = stat as { url?: string; relayProtocol?: string }
        if (localCand.url) selectedCandidatePairUrl = localCand.url
        break
      }
    }
  }

  return { rtt, packetLoss, transport, candidateType, bytesSent, bytesReceived, selectedCandidatePairUrl }
}
