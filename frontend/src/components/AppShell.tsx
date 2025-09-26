import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { useUnitsQuery } from '../features/units/hooks'
import { useTheme } from '../features/theme/ThemeContext'
import { useFlashMessage } from '../features/flash/FlashMessageContext'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition backdrop-blur ${
    isActive
      ? 'bg-indigo-500/20 text-indigo-700 shadow-sm shadow-indigo-200/50 dark:bg-indigo-500/35 dark:text-indigo-100'
      : 'text-slate-500 hover:bg-white/40 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-100'
  }`

const AppShell = () => {
  const { user, logout, refreshUser } = useAuth()
  const { data: unitsData } = useUnitsQuery(!!user)
  const { theme, toggleTheme } = useTheme()
  const { showMessage } = useFlashMessage()
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false,
  )
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false,
  )
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(min-width: 768px)')
    const handler = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches)
      setSidebarOpen(event.matches)
    }
    mediaQuery.addEventListener('change', handler)
    setIsDesktop(mediaQuery.matches)
    setSidebarOpen(mediaQuery.matches)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const sidebarClasses = [
    'glass-panel fixed inset-y-0 left-0 z-30 flex h-screen max-h-screen w-72 transform flex-col px-6 py-8 transition-[transform,width,opacity] duration-300 text-slate-900 dark:text-slate-100',
    'md:static md:h-screen md:max-h-screen md:shadow-none',
    sidebarOpen ? 'translate-x-0' : '-translate-x-full',
    sidebarOpen
      ? 'pointer-events-auto md:w-72 md:translate-x-0 md:border-r md:border-white/20 md:px-6 md:opacity-100 md:pointer-events-auto dark:md:border-slate-700/60'
      : 'pointer-events-none md:w-0 md:-translate-x-full md:border-r md:border-transparent md:px-0 md:opacity-0 md:pointer-events-none',
    'overflow-hidden',
  ].join(' ')

  return (
    <div className="flex h-screen bg-transparent text-slate-900 transition-colors dark:text-slate-100">
      <aside id="primary-sidebar" className={sidebarClasses}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-500">AI SHIFT</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">介護シフト管理</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">ユニットのカバー状況とAIドラフトを一元管理</p>
        </div>
        <nav className="mt-10 flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto pr-2 text-sm">
          <NavLink to="/" end className={navLinkClass}>
            ダッシュボード
          </NavLink>
          {['admin', 'leader'].includes(user?.role ?? '') ? (
            <NavLink to="/units/manage" className={navLinkClass}>
              ユニット管理
            </NavLink>
          ) : null}
          {user?.role === 'admin' ? (
            <NavLink to="/employees" className={navLinkClass}>
              従業員管理
            </NavLink>
          ) : null}
          {unitsData?.data?.length ? (
            <div className="mt-6 space-y-2">
              <p className="px-4 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">ユニット</p>
              <div className="space-y-1">
                {unitsData.data.slice(0, 6).map((unit) => (
                  <NavLink
                    key={unit.id}
                    to={`/units/${unit.id}`}
                    className={navLinkClass}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/30 dark:text-indigo-200">
                      {unit.code}
                    </span>
                    <div>
                      <p className="leading-tight text-slate-900 dark:text-slate-100">{unit.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">メンバー {unit.member_count} 名</p>
                    </div>
                  </NavLink>
                ))}
              </div>
            </div>
          ) : null}
        </nav>
        {user ? (
          <div className="glass-panel mt-6 shrink-0 rounded-2xl border border-white/30 p-4 text-xs text-slate-600 dark:border-slate-700/60 dark:text-slate-300">
            <p className="text-slate-900 dark:text-slate-100">{user.name}</p>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {user.role_label ?? user.role}
            </p>
            {user.organization ? (
              <p className="mt-2 text-slate-500 dark:text-slate-400">{user.organization.name}</p>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="mt-4 w-full rounded-xl border border-indigo-100/50 bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100/80 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-100 dark:hover:bg-indigo-500/30"
            >
              ログアウト
            </button>
          </div>
        ) : null}
      </aside>

      {!isDesktop && sidebarOpen ? (
        <div
          className="fixed inset-0 z-20 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-white/20 bg-white/30 backdrop-blur-xl transition-colors dark:border-slate-800/60 dark:bg-slate-900/40">
          <div className="flex items-center justify-between px-4 py-3 md:px-10">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur transition hover:bg-white/80 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70"
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label={sidebarOpen ? 'メニューを閉じる' : 'メニューを開く'}
                aria-expanded={sidebarOpen}
                aria-controls="primary-sidebar"
              >
                <span className="text-base">{sidebarOpen ? '×' : '☰'}</span>
                <span className="hidden sm:inline">{sidebarOpen ? 'メニューを閉じる' : 'メニューを開く'}</span>
              </button>
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-400 dark:text-slate-500">シフトポータル</p>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{user?.organization?.name ?? 'ダッシュボード'}</h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur transition hover:bg-white/80 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70"
              >
                <span className="text-base" aria-hidden>
                  {theme === 'dark' ? '🌞' : '🌙'}
                </span>
                <span className="hidden sm:inline">{theme === 'dark' ? 'ライトモード' : 'ダークモード'}</span>
              </button>
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(true)
                    setPasswordError(null)
                  }}
                  className="flex items-center gap-3 rounded-full border border-white/40 bg-white/70 px-4 py-2 text-sm shadow-sm backdrop-blur transition hover:border-indigo-200/60 hover:bg-white/90 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-slate-700/60 dark:bg-slate-900/60 dark:hover:border-indigo-400/60 dark:text-slate-100"
                  aria-haspopup="dialog"
                >
                  <div className="text-left">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{user.role_label ?? user.role}</p>
                  </div>
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto px-4 py-8 md:px-10 md:py-12">
          <div
            className={`mx-auto w-full min-w-0 transition-[max-width] duration-300 ${
              sidebarOpen ? 'max-w-6xl' : 'max-w-none'
            }`}
          >
            <Outlet />
          </div>
        </main>
      </div>

      {showProfileModal && user ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !passwordLoading) {
              setShowProfileModal(false)
              setPasswordError(null)
              setCurrentPassword('')
              setNewPassword('')
              setConfirmPassword('')
            }
          }}
        >
          <div className="glass-panel w-full max-w-md rounded-3xl border border-white/25 p-6 shadow-2xl dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ユーザー情報</h3>
              <button
                type="button"
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                onClick={() => {
                  if (passwordLoading) return
                  setShowProfileModal(false)
                  setPasswordError(null)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                }}
                aria-label="プロフィールモーダルを閉じる"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-500">氏名</p>
                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-500">メールアドレス</p>
                <p className="mt-1 text-base text-slate-800 dark:text-slate-100">{user.email}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-500">役割</p>
                  <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{user.role_label ?? user.role}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-500">雇用区分</p>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">{user.employment_type}</p>
                </div>
              </div>
              {user.organization ? (
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-500">所属組織</p>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">{user.organization.name}</p>
                </div>
              ) : null}
            </div>

            <form
              className="mt-8 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700"
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault()
                if (passwordLoading) return

                if (!currentPassword || !newPassword || !confirmPassword) {
                  setPasswordError('すべての項目を入力してください。')
                  return
                }

                if (newPassword !== confirmPassword) {
                  setPasswordError('新しいパスワードと確認用が一致しません。')
                  return
                }

                setPasswordError(null)
                setPasswordLoading(true)

                try {
                  await api.put('/auth/password', {
                    current_password: currentPassword,
                    password: newPassword,
                    password_confirmation: confirmPassword,
                  })

                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  await refreshUser()
                  setShowProfileModal(false)
                  showMessage({ type: 'success', text: 'パスワードを更新しました。' })
                } catch (error: any) {
                  const responseData = error?.response?.data
                  const message =
                    responseData?.errors?.current_password?.[0] ??
                    responseData?.errors?.password?.[0] ??
                    responseData?.message ??
                    'パスワードの更新に失敗しました。'
                  setPasswordError(message)
                } finally {
                  setPasswordLoading(false)
                }
              }}
            >
              <div className="space-y-3">
                <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  現在のパスワード
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  新しいパスワード
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  新しいパスワード（確認）
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              {passwordError ? (
                <p className="text-xs text-rose-500">{passwordError}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ※ パスワードは8文字以上で設定してください。
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (passwordLoading) return
                    setShowProfileModal(false)
                    setPasswordError(null)
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                  }}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  disabled={passwordLoading}
                >
                  閉じる
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  {passwordLoading ? '更新中…' : 'パスワードを更新'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default AppShell
