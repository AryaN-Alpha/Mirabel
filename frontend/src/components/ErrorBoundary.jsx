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
        <div className="flex h-full items-center justify-center bg-zinc-900 text-zinc-300 p-8 text-center">
          <p className="text-lg">ugh, something broke. don&apos;t look at me like that.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
