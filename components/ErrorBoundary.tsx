'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    this.setState({ errorInfo });

    // Send error to server for logging
    try {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          errorInfo: {
            componentStack: errorInfo.componentStack,
          },
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          url: typeof window !== 'undefined' ? window.location.href : 'unknown',
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {
        // Ignore fetch errors
      });
    } catch {
      // Ignore any errors in error reporting
    }
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h1 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
              Something went wrong
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              An error occurred while loading the application. Please try refreshing the page.
            </p>

            <div className="mb-4">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Refresh Page
              </button>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                Technical Details (for debugging)
              </summary>
              <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-auto">
                <p className="text-sm font-mono text-red-600 dark:text-red-400 mb-2">
                  {error?.name}: {error?.message}
                </p>
                {error?.stack && (
                  <pre className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                    {error.stack}
                  </pre>
                )}
                {errorInfo?.componentStack && (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-4 mb-1">
                      Component Stack:
                    </p>
                    <pre className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                      {errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            </details>

            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              If this problem persists, please report it at{' '}
              <a
                href="https://github.com/anthropics/claude-code/issues"
                className="text-blue-500 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Issues
              </a>
              {' '}with the technical details above.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
