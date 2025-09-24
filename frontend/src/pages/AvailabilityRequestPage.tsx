import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { useAvailabilityRequestsQuery, useAvailabilityScheduleQuery, useDeleteAvailabilityRequestMutation, useSendAvailabilityReminderMutation } from '../features/availability/hooks'
import { useCreateAvailabilityRequest } from '../features/units/hooks'

const today = new Date().toISOString().slice(0, 10)

const AvailabilityRequestPage = () => {
  const params = useParams()
  const unitId = Number(params.unitId)
  const navigate = useNavigate()
  const { user } = useAuth()

  if (!Number.isFinite(unitId)) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
        ユニットが見つかりませんでした。
      </div>
    )
  }

  const mutation = useCreateAvailabilityRequest(unitId)
  const [workDate, setWorkDate] = useState(today)
  const [type, setType] = useState<'wish' | 'unavailable' | 'vacation'>('wish')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canViewUnit = useMemo(
    () => ['admin', 'leader'].includes(user?.role ?? ''),
    [user?.role],
  )

  const [scope, setScope] = useState<'self' | 'unit'>(canViewUnit ? 'unit' : 'self')
  const [memberId, setMemberId] = useState<number | undefined>(undefined)

  const scheduleQuery = useAvailabilityScheduleQuery(unitId)
  const period = scheduleQuery.data?.data.period

  const requestParams = useMemo(
    () => ({
      period,
      scope,
      memberId,
    }),
    [memberId, period, scope],
  )

  const requestsQuery = useAvailabilityRequestsQuery(unitId, requestParams)

  const deleteMutation = useDeleteAvailabilityRequestMutation(unitId)
  const reminderMutation = useSendAvailabilityReminderMutation(unitId, period)

  const timezone = scheduleQuery.data?.data.timezone ?? 'Asia/Tokyo'
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    [timezone],
  )

  const targetMembers = useMemo(() => {
    const submissions = scheduleQuery.data?.data.submissions ?? []
    const pending = scheduleQuery.data?.data.pending_members ?? []

    const merged = new Map<number, { id: number; name: string; role: string | null }>()

    submissions.forEach((item) => {
      merged.set(item.user_id, {
        id: item.user_id,
        name: item.user_name ?? '不明なメンバー',
        role: item.role ?? null,
      })
    })

    pending.forEach((member) => {
      merged.set(member.id, {
        id: member.id,
        name: member.name,
        role: member.role ?? null,
      })
    })

    return Array.from(merged.values())
  }, [scheduleQuery.data?.data.pending_members, scheduleQuery.data?.data.submissions])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    try {
      await mutation.mutateAsync({
        work_date: workDate,
        type,
        start_at: startAt || null,
        end_at: endAt || null,
        reason: reason || null,
      })
      setSuccess('希望/休暇申請を登録しました。')
      setStartAt('')
      setEndAt('')
      setReason('')
    } catch (err) {
      console.error(err)
      setError('申請の登録に失敗しました。入力内容を確認してください。')
    }
  }

  const handleDelete = async (requestId: number) => {
    if (!window.confirm('この申請を削除します。よろしいですか？')) {
      return
    }

    try {
      await deleteMutation.mutateAsync(requestId)
    } catch (err) {
      console.error(err)
      setError('申請の削除に失敗しました。')
    }
  }

  const handleSendReminder = async () => {
    try {
      await reminderMutation.mutateAsync()
    } catch (err) {
      console.error(err)
      setError('リマインドの送信に失敗しました。')
    }
  }

  if (scheduleQuery.isLoading) {
    return (
      <div className="glass-panel rounded-xl border border-white/25 p-6 text-sm text-slate-600 shadow-lg">
        希望・休暇申請情報を読み込み中です…
      </div>
    )
  }

  if (scheduleQuery.isError || !scheduleQuery.data) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
        希望申請情報の取得に失敗しました。再度お試しください。
      </div>
    )
  }

  const schedule = scheduleQuery.data.data

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">希望・休暇申請</h1>
        <p className="text-sm text-slate-500">
          希望勤務や勤務不可、休暇の申請を登録すると、締切前のリマインドとAI編成時に反映されます。
        </p>
      </header>

      <section className="glass-panel rounded-3xl border border-white/20 p-6 shadow-lg">
        <div className="grid gap-4 md:grid-cols-4">
          <DeadlineStat
            title="対象月"
            value={`${schedule.period_start.slice(0, 7)}`}
            helper={`${schedule.period_start} 〜 ${schedule.period_end}`}
          />
          <DeadlineStat
            title="提出締切"
            value={dateFormatter.format(new Date(schedule.deadline_at))}
            helper={schedule.is_deadline_passed ? '締切を過ぎています' : '締切前'}
            tone={schedule.is_deadline_passed ? 'warning' : 'info'}
          />
          <DeadlineStat
            title="リマインド"
            value={dateFormatter.format(new Date(schedule.reminder_at))}
            helper={
              schedule.reminder_sent_at
                ? `${dateFormatter.format(new Date(schedule.reminder_sent_at))} に送信`
                : schedule.is_reminder_due
                  ? 'リマインド送信を推奨'
                  : '自動送信待ち'
            }
            tone={schedule.reminder_sent_at ? 'success' : schedule.is_reminder_due ? 'warning' : 'info'}
          />
          <DeadlineStat
            title="未申請"
            value={`${schedule.pending_members.length} 名`}
            helper="申請が未完了のメンバー数"
            tone={schedule.pending_members.length > 0 ? 'warning' : 'success'}
          />
        </div>
        {canViewUnit ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSendReminder}
              disabled={reminderMutation.isPending || Boolean(schedule.reminder_sent_at)}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-60"
            >
              {schedule.reminder_sent_at ? 'リマインド送信済み' : reminderMutation.isPending ? '送信中…' : '未申請者にリマインド'}
            </button>
            {schedule.pending_members.length ? (
              <span className="text-xs text-slate-500">
                リマインド対象: {schedule.pending_members.map((member) => member.name).join(', ')}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="glass-panel space-y-4 rounded-3xl border border-white/20 p-6 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">申請一覧</h2>
              <p className="text-xs text-slate-500">
                {requestsQuery.data?.data.length ?? 0} 件の申請が登録されています。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canViewUnit ? (
                <select
                  value={scope}
                  onChange={(event) => {
                    const nextScope = event.target.value as 'self' | 'unit'
                    setScope(nextScope)
                    if (nextScope === 'self') {
                      setMemberId(undefined)
                    }
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                >
                  <option value="unit">ユニット全体</option>
                  <option value="self">自分の申請のみ</option>
                </select>
              ) : null}
              {canViewUnit && scope === 'unit' ? (
                <select
                  value={memberId ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    setMemberId(value ? Number(value) : undefined)
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                >
                  <option value="">全メンバー</option>
                  {targetMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          {requestsQuery.isLoading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              申請データを読み込み中です…
            </div>
          ) : null}

          {requestsQuery.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-500">
              申請一覧の取得に失敗しました。
            </div>
          ) : null}

          {!requestsQuery.isLoading && !requestsQuery.isError ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-sm">
                <thead className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">メンバー</th>
                    <th className="px-4 py-2 text-left">勤務日</th>
                    <th className="px-4 py-2 text-left">種別</th>
                    <th className="px-4 py-2 text-left">時間帯</th>
                    <th className="px-4 py-2 text-left">メモ</th>
                    <th className="px-4 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {requestsQuery.data?.data.length ? (
                    requestsQuery.data.data.map((request) => {
                      const canDelete =
                        user?.role === 'admin' || request.user_id === user?.id
                      const label =
                        request.type === 'wish'
                          ? '希望'
                          : request.type === 'vacation'
                            ? '休暇'
                            : '勤務不可'

                      const timeRange = request.start_at || request.end_at
                        ? `${request.start_at ?? '--:--'} 〜 ${request.end_at ?? '--:--'}`
                        : '終日'

                      return (
                        <tr key={request.id} className="rounded-2xl bg-white/65 shadow-sm backdrop-blur dark:bg-slate-900/60">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{request.user?.name ?? '自分'}</div>
                            <div className="text-xs text-slate-400">{request.user?.role ?? ''}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {dateFormatter.format(new Date(request.work_date))}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                request.type === 'vacation'
                                  ? 'bg-emerald-50 text-emerald-600'
                                  : request.type === 'unavailable'
                                    ? 'bg-rose-50 text-rose-600'
                                    : 'bg-indigo-50 text-indigo-600'
                              }`}
                            >
                              {label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{timeRange}</td>
                          <td className="px-4 py-3 text-slate-500">
                            {request.reason ? request.reason : <span className="text-xs text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canDelete ? (
                              <button
                                type="button"
                                onClick={() => handleDelete(request.id)}
                                disabled={deleteMutation.isPending}
                                className="inline-flex items-center rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                              >
                                削除
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                        現在登録されている申請はありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-3xl border border-white/20 bg-white/60 p-6 shadow-lg backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/55"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900">新しい申請を登録</h2>
            <p className="text-xs text-slate-500">
              締切後も提出・修正は可能ですが、早めの登録を推奨します。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              勤務日
              <input
                type="date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
                className="mt-1 w-full glass-input focus:border-indigo-400 focus:outline-none"
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              申請種別
              <select
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
                className="mt-1 w-full glass-input focus:border-indigo-400 focus:outline-none"
              >
                <option value="wish">希望勤務</option>
                <option value="unavailable">勤務不可</option>
                <option value="vacation">休暇</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              開始時刻
              <input
                type="time"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                className="mt-1 w-full glass-input focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="text-sm text-slate-600">
              終了時刻
              <input
                type="time"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
                className="mt-1 w-full glass-input focus:border-indigo-400 focus:outline-none"
              />
            </label>
          </div>
          <label className="text-sm text-slate-600">
            メモ（任意）
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-1 w-full glass-input focus:border-indigo-400 focus:outline-none"
              placeholder="通院のため 14:00 まで勤務希望 など"
            />
          </label>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {mutation.isPending ? '送信中…' : '申請を登録'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-full border border-slate-200 px-5 py-2 text-sm text-slate-600 transition hover:border-slate-400"
            >
              戻る
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

type DeadlineStatProps = {
  title: string
  value: string
  helper: string
  tone?: 'info' | 'warning' | 'success'
}

const toneClasses: Record<NonNullable<DeadlineStatProps['tone']>, string> = {
  info: 'border-indigo-100 bg-indigo-50 text-indigo-600',
  warning: 'border-amber-100 bg-amber-50 text-amber-600',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-600',
}

const DeadlineStat = ({ title, value, helper, tone = 'info' }: DeadlineStatProps) => (
  <div className="space-y-2">
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</p>
    <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${toneClasses[tone]}`}>
      {value}
    </div>
    <p className="text-xs text-slate-500">{helper}</p>
  </div>
)

export default AvailabilityRequestPage
