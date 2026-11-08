import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Boot = { mounted(): void; fail(reason?: string): void; retry(): void };
const boot = (): Boot | undefined =>
  (window as unknown as { squeekBoot?: Boot }).squeekBoot;
const retry = () =>
  boot()?.retry() ??
  location.replace(`${location.pathname}?retry=${Date.now()}${location.hash}`);

function BootError({ reason }: { reason: string }) {
  return (
    <div className="boot" role="alert">
      <h1>The game didn’t start</h1>
      <p>
        Something stopped the page from loading. Your saved calls are safe in
        this browser.
      </p>
      <button type="button" onClick={retry} autoFocus>
        Try again
      </button>
      {reason && <small>Details: {reason}</small>}
    </div>
  );
}

// Catches render errors after the bundle loads, so the page is never left blank.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return {
      error: (error instanceof Error ? error.message : String(error)).slice(
        0,
        200,
      ),
    };
  }
  componentDidMount() {
    boot()?.mounted();
  }
  render() {
    return this.state.error !== null ? (
      <BootError reason={this.state.error} />
    ) : (
      this.props.children
    );
  }
}

const container = document.getElementById("root")!;
// App (and the feed/validator modules it pulls in) loads through a dynamic import.
// If evaluating it throws, for example under a strict Content-Security-Policy,
// the error screen replaces the loading screen instead of a blank page.
import("./App")
  .then(({ default: App }) => {
    createRoot(container).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const reason = (error instanceof Error ? error.message : String(error)).slice(0, 200);
    if (boot()) boot()!.fail(reason);
    else createRoot(container).render(<BootError reason={reason} />);
  });
