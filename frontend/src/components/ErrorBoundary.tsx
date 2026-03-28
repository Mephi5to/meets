import React from 'react'

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: '#0d0f12', color: '#fff',
          fontFamily: 'system-ui, sans-serif', flexDirection: 'column',
          gap: '16px', padding: '24px', textAlign: 'center',
        }}>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Something went wrong</h2>
          <p style={{ opacity: 0.6, fontSize: '14px', margin: 0, maxWidth: '400px' }}>
            {this.state.error.message}
          </p>
          <pre style={{
            opacity: 0.3, fontSize: '11px', maxWidth: '90vw', overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
          }}>
            {this.state.error.stack?.split('\n').slice(0, 5).join('\n')}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px', padding: '8px 24px', background: '#3b82f6',
              color: '#fff', border: 'none', borderRadius: '8px',
              cursor: 'pointer', fontSize: '14px',
            }}
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
