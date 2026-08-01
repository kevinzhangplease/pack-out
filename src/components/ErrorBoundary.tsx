import { Component, type ErrorInfo, type ReactNode } from 'react';
import { dumpEverything } from '../state/storage';

/**
 * The first thing this offers is "export my data" — before reload, before
 * anything. If the app is broken, the library is the only thing that matters
 * and it is the only thing that cannot be rebuilt.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; saved: boolean }
> {
  state = { error: null as Error | null, saved: false };

  static getDerivedStateFromError(error: Error) {
    return { error, saved: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Pack Out crashed:', error, info.componentStack);
  }

  private exportData = () => {
    const blob = new Blob([dumpEverything()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pack-out-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.setState({ saved: true });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="crash">
        <h1 className="crash__title">Pack Out hit an error</h1>
        <p className="crash__lede">
          Your library and trips are still in this browser. Save them before doing anything else.
        </p>
        <div className="crash__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={this.exportData}>
            {this.state.saved ? 'Saved — download again' : 'Export my data'}
          </button>
          <button
            type="button"
            className="btn btn--lg"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
        <pre className="crash__detail">{this.state.error.message}</pre>
      </div>
    );
  }
}
