import React from "react";
import { Img } from "remotion";

/**
 * A remote <Img> that degrades to nothing instead of failing the whole render
 * when the URL is dead, slow, or 404s. Used for third-party images the pipeline
 * doesn't control (section photos, YouTube channel avatars). The error boundary
 * catches render-time throws; `onError` catches async load failures — either way
 * the component renders null and the surrounding layout falls back gracefully.
 */
export class SafeImg extends React.Component<
  { src: string; style?: React.CSSProperties },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Swallow — the caller's fallback renders instead.
  }
  render() {
    if (this.state.failed) return null;
    return (
      <Img
        src={this.props.src}
        onError={() => this.setState({ failed: true })}
        style={this.props.style}
      />
    );
  }
}
