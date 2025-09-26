import { AxiosError } from 'axios'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import type { RegisterPayload } from '../api/types'

const RegisterPage = () => {
  const { register, isLoading } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [organizationCode, setOrganizationCode] = useState('CARE001')
  const [organizationName, setOrganizationName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (password !== passwordConfirmation) {
      setError('確認用パスワードが一致しません。')
      return
    }

    const payload: RegisterPayload = {
      name,
      email,
      password,
      password_confirmation: passwordConfirmation,
      organization_code: organizationCode.trim(),
    }

    if (organizationName.trim()) {
      payload.organization_name = organizationName.trim()
    }

    try {
      await register(payload)
      navigate('/', { replace: true })
    } catch (err) {
      console.error(err)
      if (err instanceof AxiosError) {
        const responseData = err.response?.data as { message?: string; errors?: Record<string, string[]> }
        const message =
          responseData?.errors
            ? Object.values(responseData.errors)
                .flat()
                .join('\n')
            : responseData?.message
        setError(message ?? '登録に失敗しました。入力内容をご確認ください。')
      } else {
        setError('登録に失敗しました。時間を置いて再度お試しください。')
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10">
      <div className="w-full max-w-3xl rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-8 text-slate-100 shadow-2xl">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-300">AI Shift App</p>
          <h1 className="text-2xl font-bold">管理者アカウント登録</h1>
          <p className="text-sm text-slate-400">
            このフォームでは管理者アカウントのみ登録できます。既存事業所に参加する場合は共有されたコードを、新しい事業所を作成する場合はコードと事業所名の両方を入力してください。
          </p>
        </div>

        <form className="mt-6 space-y-8" onSubmit={handleSubmit}>
          <section className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              氏名
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              メールアドレス
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              パスワード
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              パスワード（確認）
              <input
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                required
                minLength={8}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </label>
          </section>

          <section className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">事業所情報</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                事業所コード
                <input
                  type="text"
                  value={organizationCode}
                  onChange={(event) => setOrganizationCode(event.target.value.toUpperCase())}
                  required
                  maxLength={32}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-500">
                  既存事業所へ参加する場合は共有されたコードを入力してください。
                </span>
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                事業所名（新規作成時のみ入力）
                <input
                  type="text"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="新しい事業所を作成する場合のみ入力"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </label>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              ※ 入力したコードの事業所が存在しない場合、上記の事業所名で新規作成されます。
            </p>
          </section>

          {error ? (
            <div className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {isLoading ? '登録中…' : '登録する'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          既にアカウントをお持ちですか？{' '}
          <Link to="/login" className="text-indigo-300 hover:text-indigo-200">
            ログインページへ
          </Link>
        </p>
      </div>
    </div>
  )
}

export default RegisterPage
