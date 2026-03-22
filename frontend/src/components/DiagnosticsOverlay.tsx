import { Activity, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { ConnectionStats } from '../types'

interface DiagnosticsOverlayProps {
  stats: ConnectionStats | null
  signalingState: string
}

export function DiagnosticsOverlay({ stats, signalingState }: DiagnosticsOverlayProps) {
  const [expanded, setExpanded] = useState(false)

  const rttColor =
    !stats || stats.rtt === null
      ? 'text-white/40'
      : stats.rtt < 150
      ? 'text-green-400'
      : stats.rtt < 400
      ? 'text-yellow-400'
      : 'text-red-400'

  const lossColor =
    !stats || stats.packetLoss === null
      ? 'text-white/40'
      : stats.packetLoss < 2
      ? 'text-green-400'
      : stats.packetLoss < 8
      ? 'text-yellow-400'
      : 'text-red-400'

  const transportLabel = () => {
    if (!stats) return '—'
    switch (stats.transport) {
      case 'relay': return 'TURNS/TLS ✓'
      case 'udp': return 'UDP'
      case 'tcp': return 'TCP'
      default: return 'Unknown'
    }
  }

  const transportColor =
    stats?.transport === 'relay'
      ? 'text-green-400'
      : stats?.transport === 'udp'
      ? 'text-yellow-400'
      : 'text-white/40'

  function fmtBytes(b: number): string {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="fixed bottom-20 right-4 z-50">
      <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden text-xs">
        {/* Collapsed header — always visible */}
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-2 px-3 py-2 w-full hover:bg-white/5 transition"
        >
          <Activity className="w-3.5 h-3.5 text-white/50" />
          <span className={`font-mono font-bold ${rttColor}`}>
            {stats?.rtt !== null && stats?.rtt !== undefined ? `${stats.rtt}ms` : '—'}
          </span>
          <span className={`font-mono ${lossColor}`}>
            {stats?.packetLoss !== null && stats?.packetLoss !== undefined
              ? `${stats.packetLoss}% loss`
              : '—'}
          </span>
          <span className={`font-mono ${transportColor}`}>{transportLabel()}</span>
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-white/30 ml-auto" />
          ) : (
            <ChevronUp className="w-3 h-3 text-white/30 ml-auto" />
          )}
        </button>

        {/* Expanded details */}
        {expanded && (
          <div className="px-3 pb-3 pt-1 border-t border-white/10 space-y-1.5 min-w-[220px]">
            <Row label="Signaling" value={signalingState} valueClass="text-white/70 capitalize" />
            <Row
              label="RTT"
              value={stats?.rtt !== null && stats?.rtt !== undefined ? `${stats.rtt} ms` : '—'}
              valueClass={rttColor}
            />
            <Row
              label="Packet loss"
              value={
                stats?.packetLoss !== null && stats?.packetLoss !== undefined
                  ? `${stats.packetLoss}%`
                  : '—'
              }
              valueClass={lossColor}
            />
            <Row label="Transport" value={transportLabel()} valueClass={transportColor} />
            <Row
              label="Candidate type"
              value={stats?.candidateType ?? '—'}
              valueClass="text-white/70"
            />
            <Row
              label="Sent"
              value={stats ? fmtBytes(stats.bytesSent) : '—'}
              valueClass="text-white/70"
            />
            <Row
              label="Received"
              value={stats ? fmtBytes(stats.bytesReceived) : '—'}
              valueClass="text-white/70"
            />
            <p className="text-white/25 pt-1">
              iceTransportPolicy: <span className="text-green-400">relay</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass: string
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-white/40">{label}</span>
      <span className={`font-mono ${valueClass}`}>{value}</span>
    </div>
  )
}
