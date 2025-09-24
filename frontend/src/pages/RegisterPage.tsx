import { AxiosError } from 'axios'
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import type { RegisterPayload } from '../api/types'

const roleOptions: Array<{ value: RegisterPayload['role']; label: string; description: string }> = [
  { value: 'admin', label: '管理者', description: '事業所全体の設定、従業員管理、シフト承認が可能です。' },
  { value: 'leader', label: 'チームリーダー', description: '担当ユニットのシフト調整とメンバー管理が可能です。' },
  { value: 'member', label: '一般ユーザー', description: '自分のシフト確認や希望提出が中心の権限です。' },
]

const employmentOptions: Array<{ value: RegisterPayload['employment_type']; label: string }> = [
  { value: 'full_time', label: '正社員' },
  { value: 'part_time', label: 'パート' },
  { value: 'contract', label: 'アルバイト' },
]

const RegisterPage = () => {
  const { register, isLoading } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [role, setRole] = useState<RegisterPayload['role']>('member')
  const [employmentType, setEmploymentType] = useState<RegisterPayload['employment_type']>('full_time')
  const [canNightShift, setCanNightShift] = useState(false)
  const [contractHours, setContractHours] = useState('')
  const [organizationCode, setOrganizationCode] = useState('CARE001')
  const [organizationName, setOrganizationName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const requiresOrganizationName = useMemo(() => role === 'admin', [role])

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
      role,
      employment_type: employmentType,
      can_night_shift: canNightShift,
      contract_hours_per_week: contractHours ? Number(contractHours) : null,
      organization_code: organizationCode.trim(),
    }

    if (requiresOrganizationName) {
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
          <h1 className="text-2xl font-bold">アカウント登録</h1>
          <p className="text-sm text-slate-400">
            事業所コードをお持ちでない管理者の方は新しいコードと事業所名を指定してください（自動的に事業所を作成します）。
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
              パスワード（確認用）
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
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">権限ロール</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {roleOptions.map((option) => {
                const selected = role === option.value
                return (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setRole(option.value)}
                    className={`h-full rounded-lg border px-4 py-3 text-left transition ${
                      selected
                        ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                        : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-indigo-400/60'
                    }`}
                  >
                    <p className="text-sm font-semibold">{option.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{option.description}</p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              雇用区分
              <select
                value={employmentType}
                onChange={(event) => setEmploymentType(event.target.value as RegisterPayload['employment_type'])}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                {employmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              週あたり契約時間
              <input
                type="number"
                min={0}
                max={168}
                value={contractHours}
                onChange={(event) => setContractHours(event.target.value)}
                placeholder="例: 40"
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={canNightShift}
                onChange={(event) => setCanNightShift(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 text-indigo-500 focus:ring-indigo-500"
              />
              夜勤シフトに入れる
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
                  既存事業所に参加する場合は共有されたコードを入力してください。
                </span>
              </label>
              {requiresOrganizationName ? (
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  事業所名（新規作成用）
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    required
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                  />
                </label>
              ) : (
                <div className="flex items-end text-xs text-slate-500">
                  <p>
                    管理者以外は既存の事業所コードが必須です。コードが不明な場合は管理者にお問い合わせください。
                  </p>
                </div>
              )}
            </div>
          </section>

          {error ? <div className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

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
