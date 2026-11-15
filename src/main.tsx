import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

window.addEventListener('unhandledrejection', (event) => {
  console.warn('Unhandled Promise Rejection:', event.reason);
  event.preventDefault();
});

try {
  if (typeof window !== 'undefined' && window.location.search) {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('_v')) {
      url.searchParams.delete('_v');
      changed = true;
    }
    if (url.searchParams.has('_t')) {
      url.searchParams.delete('_t');
      changed = true;
    }
    if (changed) {
      const cleanPath =
        url.pathname +
        (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') +
        url.hash;
      window.history.replaceState(window.history.state, document.title, cleanPath);
    }
  }
} catch {
  // URL 파라미터 정리 예외 무시
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return { hasError: true, message: err?.message || '알 수 없는 화면 오류' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            backgroundColor: 'var(--bg-app)',
            color: 'var(--text-main)',
            padding: '24px',
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--danger)' }}>
            화면 처리 중 오류가 발생했습니다
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {this.state.message}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);
