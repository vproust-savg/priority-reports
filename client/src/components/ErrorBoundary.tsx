// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ErrorBoundary.tsx
// PURPOSE: Root-level error boundary. Catches unhandled React render
//          errors and shows a recovery UI instead of white-screening
//          the Airtable iframe.
// USED BY: App.tsx (wraps entire component tree)
// EXPORTS: ErrorBoundary
// ═══════════════════════════════════════════════════════════════

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// WHY: Class component required — React has no hook equivalent for
// componentDidCatch / getDerivedStateFromError.
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // WHY: Log to console so Railway server logs capture it.
    // No external monitoring (Sentry) yet — console is our only signal.
    console.error('[ErrorBoundary] Uncaught render error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  private handleReload = () => {
    // WHY: Full page reload, not in-app navigation. The component tree
    // is in a broken state — React Router may not be functional.
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--color-bg-page)] flex items-center justify-center">
          <div className="text-center max-w-sm px-6">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-red)]/5 flex items-center justify-center mx-auto mb-4">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--color-red)]"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
              Something went wrong
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5">
              The dashboard encountered an unexpected error.
            </p>
            <button
              onClick={this.handleReload}
              className="text-sm font-medium text-[var(--color-gold-primary)] hover:underline"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
