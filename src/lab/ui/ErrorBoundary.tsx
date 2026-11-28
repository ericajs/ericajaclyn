// Keeps one broken area of the lab from blanking the whole app. Each region
// (header, questions rail, test rig, canvas, review panel) gets its own
// boundary; when one throws, only that region shows the fallback and the rest
// keeps working. Changing `resetKey` (e.g. switching mode or tab) clears it.

import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  /** Names the region in the fallback, e.g. "Matrix view" */
  area: string
  /** Grid-area class so the fallback holds the region's place in the layout */
  className?: string
  /** Any change clears the error and renders the children again */
  resetKey?: string
  children: ReactNode
}

interface State {
  error: Error | null
  resetKey?: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State) {
    return props.resetKey !== state.resetKey
      ? { error: null, resetKey: props.resetKey }
      : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[AI Design Lab] ${this.props.area} crashed`, error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className={`lab-error ${this.props.className ?? ""}`} role="alert">
        <p className="lab-error-title">{this.props.area} hit an error</p>
        <p className="lab-error-detail">{error.message}</p>
        <button
          type="button"
          className="lab-btn lab-btn-outline"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    )
  }
}
