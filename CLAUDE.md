# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (`frontend/`)
```bash
npm run dev      # Dev server on :5173, proxies /api and /hub to localhost:5000
npm run build    # TypeScript check + Vite production build → dist/
npm run preview  # Serve the production build locally
```

### Backend (`backend/`)
```bash
dotnet run --project Meets.Api/Meets.Api.csproj   # Run on :5000
dotnet build Meets.Api/Meets.Api.csproj            # Build only
dotnet publish Meets.Api/Meets.Api.csproj -c Release -o /app/publish
```

### Full Stack (Docker)
```bash
docker compose build            # Build all images (coturn, backend, frontend+nginx)
docker compose up -d            # Start all services
docker compose logs -f backend  # Follow backend logs
./setup.sh                      # First-time VPS setup (generates .env, installs Docker, opens firewall)
```

## Architecture

Three Docker services orchestrated via `docker-compose.yml`:

```
Browser ──HTTPS/WSS──► Nginx (443) ──► React SPA (static)
                                  ──► /api/*  ──► Backend :5000 (ASP.NET Core)
                                  ──► /hub/*  ──► Backend :5000 (SignalR WebSocket)
Browser ──TURN/TLS──► Coturn :5349 (media relay, host network)
Browser ──TURN/UDP──► Coturn :3478
```

**Media is always relayed** via Coturn — `iceTransportPolicy: 'relay'` is enforced, participant IPs are never exposed.

### Backend (`backend/Meets.Api/`)
- **`SignalingHub.cs`** — SignalR hub at `/hub/signaling`. Handles `JoinRoom`, `SendOffer`, `SendAnswer`, `SendIceCandidate`, `GetTurnCredentials`. On `JoinRoom` returns existing participants list + TURN credentials; broadcasts `ParticipantJoined` to others.
- **`RoomService.cs`** — Thread-safe in-memory room/participant state (`lock`). Auto-cleans empty rooms.
- **`TurnCredentialService.cs`** — Generates HMAC-SHA1 time-limited TURN credentials compatible with Coturn `use-auth-secret` mode. Returns 3 URLs in priority order: `turns:` TLS, `turn:` UDP, `turn:` TCP.
- **`RoomsController.cs`** — REST: `POST /api/rooms/create` (random 8-char ID), `GET /api/rooms/{id}`.

### Frontend (`frontend/src/`)
- **`App.tsx`** — Two-screen app: join screen → conference room. Parses `?room=` query param for invite links. Passes the local `MediaStream` between screens to avoid re-acquiring camera.
- **`hooks/useSignaling.ts`** — SignalR HubConnection with `withAutomaticReconnect([0,2000,10000,30000])`. Exposes `joinRoom`, `sendOffer`, `sendAnswer`, `sendIceCandidate`. On `onReconnected`, the caller is expected to re-join the room and recreate peer connections.
- **`hooks/useWebRTC.ts`** — Creates one `RTCPeerConnection` per remote peer. Glare prevention: only the **joiner** creates offers (via `existingParticipants`); existing participants wait for offers. Uses `trackMap` in `ontrack` to deduplicate tracks and always produce a new `MediaStream` ref to trigger React re-renders.
- **`components/ConferenceRoom.tsx`** — Wires signaling + WebRTC. Calls `resumeAudioContext()` on join and on container click (Chrome autoplay policy). Uses `h-screen overflow-hidden` to prevent portrait-video layout stretch.
- **`components/VideoTile.tsx`** — Video always `muted`; audio played via Web Audio API (`getAudioContext()` singleton, `MediaStreamAudioSourceNode`). All video mirrored with `[transform:scaleX(-1)]`.
- **`utils/audioContext.ts`** — Singleton `AudioContext` (`getAudioContext`) + `resumeAudioContext()` called during user-gesture to satisfy Chrome autoplay policy.

### Key Design Decisions
- **No direct P2P**: `iceTransportPolicy: 'relay'` hardcoded via `VITE_FORCE_RELAY=true` in production.
- **Glare prevention**: `onParticipantJoined` only caches the display name; offers are created only in response to `existingParticipants` returned by `JoinRoom`.
- **Audio via Web Audio API** (not `<audio>` element) to bypass Chrome's autoplay restrictions.
- **TURNS/TLS on port 5349** for mobile network compatibility (some carriers block UDP/plain TCP TURN).
- **`signalingRef` pattern** in ConferenceRoom: ref updated each render to avoid stale closures in SignalR callbacks.

### Environment Variables
| Variable | Where | Purpose |
|---|---|---|
| `VPS_IP` | `.env` | Server public IP |
| `TURN_SECRET` | `.env` | Shared secret for Coturn HMAC auth |
| `DOMAIN` | `.env` | Optional custom domain (affects CORS + redirects) |
| `TURN_HOST` | `.env` | Hostname for TURN URLs (defaults to `VPS_IP`) |
| `VITE_FORCE_RELAY` | build arg | Set `true` in prod to enforce relay-only ICE |
| `VITE_SIGNALING_URL` | build arg | Empty in Docker (uses relative URLs via nginx) |
