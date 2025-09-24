import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

const LoginPage = () => {
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      console.error(err)
      setError('ログインに失敗しました。メールアドレスとパスワードをご確認ください。')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-8 text-slate-100 shadow-xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.4em] text-indigo-300">
          AI Shift App
        </p>
        <h1 className="text-2xl font-bold">サインイン</h1>
        <p className="mt-2 text-sm text-slate-400">
          デモ用の初期ユーザーは <code className="rounded bg-slate-800 px-1">admin@example.com</code> /{' '}
          <code className="rounded bg-slate-800 px-1">password</code> です。
        </p>
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
              メールアドレス
            </label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
              パスワード
            </label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-rose-400">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {isLoading ? 'サインイン中…' : 'サインイン'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">
          アカウントをお持ちでない場合は{' '}
          <Link to="/register" className="text-indigo-300 hover:text-indigo-200">
            新規登録
          </Link>
          してください。
        </p>
      </div>
    </div>
  )
}

export default LoginPage
