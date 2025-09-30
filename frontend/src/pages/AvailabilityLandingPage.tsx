import { Link, Navigate } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen'
import { useAuth } from '../features/auth/AuthContext'
import { useUnitsQuery } from '../features/units/hooks'

const AvailabilityLandingPage = () => {
  const { user } = useAuth()
  const { data, isLoading, isError } = useUnitsQuery(!!user)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (isLoading) {
    return <LoadingScreen message="ユニット情報を読み込み中です…" />
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
        ユニット情報の取得に失敗しました。再度お試しください。
      </div>
    )
  }

  const units = data?.data ?? []
  const membershipIds = new Set((user.memberships ?? []).map((membership) => membership.unit_id))
  const myUnits = units.filter((unit) => membershipIds.has(unit.id))
  const otherUnits = units.filter((unit) => !membershipIds.has(unit.id))

  const renderUnitCard = (unitId: number, title: string, subtitle: string, memberCount: number, code: string | null) => (
    <div
      key={unitId}
      className="glass-panel flex flex-col justify-between rounded-2xl border border-white/20 p-5 shadow-sm transition hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/40"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">{code ?? 'UNIT'}</p>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">メンバー {memberCount} 名</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          to={`/units/${unitId}/availability`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-500/50 dark:bg-indigo-500/25 dark:text-indigo-200 dark:hover:bg-indigo-500/40"
        >
          希望・休暇を申請
        </Link>
      </div>
    </div>
  )

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-500">Availability</p>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">勤務希望申請</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            希望の勤務日・勤務不可・休暇申請をユニットごとに登録できます。締切前のリマインドや自動編成時に申請内容が利用されます。
          </p>
        </header>
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/70 p-5 text-sm text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-200">
          <p className="font-medium">申請のポイント</p>
          <ul className="mt-2 list-disc pl-5 text-xs leading-relaxed">
            <li>締切日までに申請すると、AIシフト作成に連動して反映されます。</li>
            <li>希望勤務と勤務不可の両方を登録できます。終了後も編集・削除が可能です。</li>
            <li>管理者・リーダーは未提出者へのリマインド送信ができます。</li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">あなたの所属ユニット</h2>
        {myUnits.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myUnits.map((unit) =>
              renderUnitCard(unit.id, unit.name, '所属メンバー向けに勤務希望を登録', unit.member_count, unit.code),
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/20 bg-white/70 p-5 text-sm text-slate-500 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-300">
            所属ユニットが登録されていません。管理者にユニットへの参加をご確認ください。
          </div>
        )}
      </section>

      {otherUnits.length ? (
        <section className="space-y-4">
          <header className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">その他のユニット</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">管理者・リーダーは他ユニットの申請状況も確認できます。</p>
          </header>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {otherUnits.map((unit) =>
              renderUnitCard(unit.id, unit.name, '申請状況の確認とリマインド送信が可能', unit.member_count, unit.code),
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default AvailabilityLandingPage
