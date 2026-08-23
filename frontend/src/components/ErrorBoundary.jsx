import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Mirabel crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center" style={{ color: "rgba(243,233,226,0.6)" }}>
          <p className="text-lg font-light">ugh, something broke. don&apos;t look at me like that.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
