import '@testing-library/jest-dom/vitest'

class ResizeObserver {
  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

// @ts-expect-error assign to window
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  // @ts-expect-error custom assign
  window.ResizeObserver = ResizeObserver
}
