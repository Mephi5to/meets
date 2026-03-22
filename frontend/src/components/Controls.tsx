import {
  Check,
  Copy,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react'
import { useState } from 'react'

interface ControlsProps {
  audioEnabled: boolean
  videoEnabled: boolean
  screenSharing: boolean
  roomId: string
  onToggleAudio: () => void
  onToggleVideo: () => void
  onToggleScreenShare: () => void
  onLeave: () => void
  screenShareSupported: boolean
}

export function Controls({
  audioEnabled,
  videoEnabled,
  screenSharing,
  roomId,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onLeave,
  screenShareSupported,
}: ControlsProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopyLink() {
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomId)
    await navigator.clipboard.writeText(url.toString())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-surface-900/90 backdrop-blur-md border-t border-white/10 flex items-center justify-center gap-3 px-4">
      {/* Mic */}
      <ControlButton
        active={audioEnabled}
        onClick={onToggleAudio}
        label={audioEnabled ? 'Mute' : 'Unmute'}
        activeIcon={<Mic className="w-5 h-5" />}
        inactiveIcon={<MicOff className="w-5 h-5" />}
        inactiveClass="bg-red-600 hover:bg-red-500"
      />

      {/* Camera */}
      <ControlButton
        active={videoEnabled}
        onClick={onToggleVideo}
        label={videoEnabled ? 'Stop video' : 'Start video'}
        activeIcon={<Video className="w-5 h-5" />}
        inactiveIcon={<VideoOff className="w-5 h-5" />}
        inactiveClass="bg-surface-600 hover:bg-surface-500"
      />

      {/* Screen share */}
      {screenShareSupported && (
        <ControlButton
          active={!screenSharing}
          onClick={onToggleScreenShare}
          label={screenSharing ? 'Stop sharing' : 'Share screen'}
          activeIcon={<Monitor className="w-5 h-5" />}
          inactiveIcon={<MonitorOff className="w-5 h-5" />}
          activeClass="bg-surface-700 hover:bg-surface-600"
          inactiveClass="bg-blue-600 hover:bg-blue-500"
        />
      )}

      {/* Copy invite link */}
      <button
        onClick={handleCopyLink}
        title="Copy invite link"
        className="w-12 h-12 rounded-full bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-white transition active:scale-95"
      >
        {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
      </button>

      {/* Leave */}
      <button
        onClick={onLeave}
        title="Leave meeting"
        className="w-12 h-12 rounded-full bg-red-700 hover:bg-red-600 flex items-center justify-center text-white transition active:scale-95"
      >
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  )
}

interface ControlButtonProps {
  active: boolean
  onClick: () => void
  label: string
  activeIcon: React.ReactNode
  inactiveIcon: React.ReactNode
  activeClass?: string
  inactiveClass?: string
}

function ControlButton({
  active,
  onClick,
  label,
  activeIcon,
  inactiveIcon,
  activeClass = 'bg-surface-700 hover:bg-surface-600',
  inactiveClass = 'bg-red-600 hover:bg-red-500',
}: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition active:scale-95 ${
        active ? activeClass : inactiveClass
      }`}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  )
}
