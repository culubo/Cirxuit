import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error boundary wrapping the 3D canvas.
 * A solver or render failure shows a readable message instead of a blank screen.
 */
export default class SceneErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface in console so the Playwright test can catch it
    console.error("[SceneErrorBoundary]", error, info.componentStack);
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#f0a030",
            fontFamily: "monospace",
            fontSize: "0.9rem",
            gap: "0.5rem",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "1.1rem", fontWeight: "bold" }}>Scene error</span>
          <span style={{ color: "#cc4444", maxWidth: "40rem" }}>
            {this.state.error.message}
          </span>
          <button
            style={{
              marginTop: "1rem",
              padding: "0.4rem 1rem",
              background: "transparent",
              border: "1px solid #f0a030",
              color: "#f0a030",
              fontFamily: "monospace",
              cursor: "pointer",
            }}
            onClick={() => this.setState({ error: null })}
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
