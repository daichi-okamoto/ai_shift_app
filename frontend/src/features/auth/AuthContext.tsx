import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setAuthToken } from '../../api/client'
import type { AuthUser, LoginResponse, RegisterPayload } from '../../api/types'

const TOKEN_STORAGE_KEY = 'ai-shift-app.token'

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY))
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    if (!token) {
      setAuthToken(null)
      setUser(null)
      setIsLoading(false)
      return
    }

    const initialize = async () => {
      try {
        setAuthToken(token)
        const response = await api.get<{ data: AuthUser }>('/me')
        setUser(response.data.data)
      } catch (error) {
        console.error('Failed to restore session', error)
        setAuthToken(null)
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        setToken(null)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    initialize()
  }, [token])

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
      })

      setToken(data.token)
      setAuthToken(data.token)
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token)
      setUser(data.user)
    } catch (error) {
      setAuthToken(null)
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      setToken(null)
      setUser(null)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const register = useCallback(async (payload: RegisterPayload) => {
    setIsLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/register', payload)

      setToken(data.token)
      setAuthToken(data.token)
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token)
      setUser(data.user)
    } catch (error) {
      setAuthToken(null)
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      setToken(null)
      setUser(null)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      console.warn('Logout request failed', error)
    } finally {
      setAuthToken(null)
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      setToken(null)
      setUser(null)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    if (!token) {
      return
    }

    try {
      const response = await api.get<{ data: AuthUser }>('/me')
      setUser(response.data.data)
    } catch (error) {
      console.error('Failed to refresh user profile', error)
    }
  }, [token])

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, token, isLoading, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
