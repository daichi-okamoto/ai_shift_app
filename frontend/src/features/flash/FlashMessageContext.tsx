import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type FlashMessageType = 'success' | 'error' | 'info'

type FlashMessage = {
  type: FlashMessageType
  text: string
} | null

type FlashMessageContextValue = {
  message: FlashMessage
  showMessage: (message: { type: FlashMessageType; text: string }) => void
  clearMessage: () => void
}

const FlashMessageContext = createContext<FlashMessageContextValue | undefined>(undefined)

export const FlashMessageProvider = ({ children }: { children: ReactNode }) => {
  const [message, setMessage] = useState<FlashMessage>(null)

  const showMessage = useCallback((value: { type: FlashMessageType; text: string }) => {
    setMessage({ type: value.type, text: value.text })
  }, [])

  const clearMessage = useCallback(() => {
    setMessage(null)
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 5000)
    return () => window.clearTimeout(timer)
  }, [message])

  const value = useMemo(() => ({ message, showMessage, clearMessage }), [message, showMessage, clearMessage])

  return <FlashMessageContext.Provider value={value}>{children}</FlashMessageContext.Provider>
}

export const useFlashMessage = (): FlashMessageContextValue => {
  const context = useContext(FlashMessageContext)
  if (!context) {
    throw new Error('useFlashMessage must be used within a FlashMessageProvider')
  }
  return context
}
