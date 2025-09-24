import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen'
import { useAuth } from '../features/auth/AuthContext'
import { useFairnessSummaryQuery } from '../features/fairness/hooks'
import { fetchUnitShifts } from '../features/units/api'
import { useUnitsQuery } from '../features/units/hooks'

const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const SHIFT_CATEGORY_KEYS = ['EARLY', 'DAY', 'LATE', 'NIGHT'] as const
type ShiftCategory = typeof SHIFT_CATEGORY_KEYS[number]

const SHIFT_TYPE_CATEGORY_MAP: Record<string, ShiftCategory | null> = {
  EARLY: 'EARLY',
  DAY: 'DAY',
  LATE: 'LATE',
  NIGHT: 'NIGHT',
  NIGHT_AFTER: null,
  OFF: null,
}

const toMinutes = (time?: string | null): number | null => {
  if (!time) return null
  const [hours, minutes] = time.split(':').map((value) => Number.parseInt(value, 10))
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }
  return hours * 60 + minutes
}

const inferShiftCategory = (
  shiftTypeCode: string | null,
  startAt: string | null,
  endAt: string | null,
): ShiftCategory | null => {
  if (shiftTypeCode) {
    const mapped = SHIFT_TYPE_CATEGORY_MAP[shiftTypeCode]
    if (mapped !== undefined) {
      return mapped
    }
  }

  const startMinutes = toMinutes(startAt)
  const endMinutes = toMinutes(endAt)

  if (startMinutes === null || endMinutes === null) {
    return null
  }

  if (endMinutes < startMinutes) {
    return 'NIGHT'
  }

  if (endMinutes >= 20 * 60) {
    return 'LATE'
  }

  if (startMinutes >= 7 * 60 && startMinutes <= 7 * 60 + 30) {
    return 'EARLY'
  }

  if (startMinutes >= 8 * 60 && endMinutes <= 18 * 60) {
    return 'DAY'
  }

  if (startMinutes >= 15 * 60) {
    return 'NIGHT'
  }

  if (startMinutes >= 6 * 60 && startMinutes < 8 * 60) {
    return 'EARLY'
  }

  if (endMinutes >= 18 * 60) {
    return 'LATE'
  }

  return 'DAY'
}

const createEmptyBreakdown = (): Record<ShiftCategory, number> => ({
  EARLY: 0,
  DAY: 0,
  LATE: 0,
  NIGHT: 0,
})

const DashboardPage = () => {
  const { user } = useAuth()
  const { data, isLoading, isError } = useUnitsQuery(!!user)

  const {
    data: fairnessSummaryData,
    isLoading: isFairnessLoading,
    isError: isFairnessError,
  } = useFairnessSummaryQuery(undefined, !!user)
  const fairnessSummary = fairnessSummaryData?.data

  const units = (data?.data ?? []).map((unit) => unit)
  const totalMembers = useMemo(() => units.reduce((sum, unit) => sum + unit.member_count, 0), [units])

  const todayKey = useMemo(() => formatDate(new Date()), [])
  const unitIds = useMemo(() => units.map((unit) => unit.id), [units])
  const unitIdsKey = useMemo(() => unitIds.join(','), [unitIds])

  const [attendanceSummary, setAttendanceSummary] = useState({
    attendanceCount: 0,
    shiftBreakdown: createEmptyBreakdown(),
    failedUnits: 0,
  })
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  useEffect(() => {
    const parsedUnitIds = unitIdsKey
      ? unitIdsKey.split(',').filter(Boolean).map((value) => Number.parseInt(value, 10))
      : []

    if (parsedUnitIds.length === 0) {
      setAttendanceSummary({
        attendanceCount: 0,
        shiftBreakdown: createEmptyBreakdown(),
        failedUnits: 0,
      })
      setAttendanceLoading(false)
      return
    }

    let cancelled = false

    const loadAttendance = async () => {
      setAttendanceLoading(true)
      const presentUserIds = new Set<number>()
      const uniqueShiftUsers: Record<ShiftCategory, Set<number>> = {
        EARLY: new Set<number>(),
        DAY: new Set<number>(),
        LATE: new Set<number>(),
        NIGHT: new Set<number>(),
      }
      let failedUnits = 0

      try {
        for (const unitId of parsedUnitIds) {
          try {
            const response = await fetchUnitShifts(unitId, { startDate: todayKey, endDate: todayKey })
            response.data.forEach((shift) => {
              const shiftTypeCode = shift.shift_type?.code ?? null
              shift.assignments.forEach((assignment) => {
                const attendeeId = assignment.user?.id ?? assignment.user_id ?? null
                const category = inferShiftCategory(shiftTypeCode, shift.start_at, shift.end_at)
                if (attendeeId && category) {
                  presentUserIds.add(attendeeId)
                  uniqueShiftUsers[category].add(attendeeId)
                }
              })
            })
          } catch (error) {
            failedUnits += 1
            console.warn('Failed to fetch unit shifts for dashboard summary:', error)
          }
        }
      } catch (error) {
        failedUnits = parsedUnitIds.length
        console.error('Failed to build attendance summary:', error)
      } finally {
        if (!cancelled) {
          setAttendanceSummary({
            attendanceCount: presentUserIds.size,
            shiftBreakdown: SHIFT_CATEGORY_KEYS.reduce<Record<ShiftCategory, number>>((acc, key) => {
              acc[key] = uniqueShiftUsers[key].size
              return acc
            }, createEmptyBreakdown()),
            failedUnits,
          })
          setAttendanceLoading(false)
        }
      }
    }

    loadAttendance()

    return () => {
      cancelled = true
    }
  }, [todayKey, unitIdsKey])

  if (isLoading) {
    return <LoadingScreen message="ユニット情報を読み込み中です…" />
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
        ユニット情報の取得に失敗しました。再度読み込んでください。
      </div>
    )
  }

  const roleHighlights: Record<string, { title: string; description: string }> = {
    admin: {
      title: '管理者ビュー',
      description: '従業員管理やユニット設定にアクセスできます。左メニューから従業員管理を開き、組織の体制を整えましょう。',
    },
    leader: {
      title: 'リーダービュー',
      description: '担当ユニットのシフト状況を確認し、必要に応じて週次シフト画面から調整を実施してください。',
    },
    member: {
      title: 'メンバービュー',
      description: '自分の担当ユニットのシフトを確認できます。希望・休暇の申請機能は近日追加予定です。',
    },
  }

  const highlight = roleHighlights[user?.role ?? 'member']

  return (
    <div className="space-y-10 text-slate-900 dark:text-slate-100">
      <section className="glass-panel space-y-4 rounded-3xl border border-white/25 p-8 shadow-lg shadow-indigo-200/40 dark:border-slate-700/60 dark:shadow-slate-900/40">
        <div className="glass-panel rounded-2xl border border-indigo-200/40 p-4 text-sm text-slate-600 dark:border-indigo-500/40 dark:text-slate-300">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-500 dark:text-indigo-300">{highlight.title}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{highlight.description}</p>
        </div>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-indigo-500 dark:text-indigo-300">Overview</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">ユニット稼働サマリー</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-300">
              カバー率やリソース状況を一目で把握し、AIドラフトでの調整ポイントを素早く発見できます。ユニットカードをクリックすると月次シフト編集画面へ遷移します。
            </p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-indigo-100/60 bg-indigo-50/70 px-3 py-1 text-xs font-semibold text-indigo-600 backdrop-blur dark:border-indigo-500/50 dark:bg-indigo-500/25 dark:text-indigo-100">
              本日: {todayKey}
            </p>
          </div>
          <div className="grid w-full max-w-3xl gap-4 text-sm md:grid-cols-2">
            <div className="glass-panel rounded-2xl border border-indigo-100/50 p-4 shadow-sm shadow-indigo-200/40 dark:border-indigo-500/40">
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-500 dark:text-indigo-300">Attendance</p>
              <div className="mt-2 flex items-baseline gap-3">
                <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-300">
                  {attendanceLoading ? '…' : attendanceSummary.attendanceCount}
                </p>
                <span className="text-xs text-slate-400 dark:text-slate-500">本日の出勤人数</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-4">
                <div className="rounded-xl border border-sky-100/60 bg-sky-50/70 px-3 py-2 text-center backdrop-blur dark:border-sky-500/50 dark:bg-sky-500/20">
                  <p className="text-[10px] uppercase tracking-widest text-sky-500 dark:text-sky-200">EARLY</p>
                  <p className="mt-1 text-base font-semibold text-sky-600 dark:text-sky-100">
                    {attendanceLoading ? '…' : attendanceSummary.shiftBreakdown.EARLY}
                  </p>
                  <p className="text-[11px] dark:text-slate-300">早番</p>
                </div>
                <div className="rounded-xl border border-emerald-100/60 bg-emerald-50/70 px-3 py-2 text-center backdrop-blur dark:border-emerald-500/50 dark:bg-emerald-500/20">
                  <p className="text-[10px] uppercase tracking-widest text-emerald-500 dark:text-emerald-200">DAY</p>
                  <p className="mt-1 text-base font-semibold text-emerald-600 dark:text-emerald-100">
                    {attendanceLoading ? '…' : attendanceSummary.shiftBreakdown.DAY}
                  </p>
                  <p className="text-[11px] dark:text-slate-300">日勤</p>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2 text-center backdrop-blur dark:border-violet-500/40 dark:bg-violet-500/20">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-violet-200">LATE</p>
                  <p className="mt-1 text-base font-semibold text-slate-700 dark:text-violet-100">
                    {attendanceLoading ? '…' : attendanceSummary.shiftBreakdown.LATE}
                  </p>
                  <p className="text-[11px] dark:text-slate-300">遅番</p>
                </div>
                <div className="rounded-xl border border-slate-700/50 bg-slate-900/70 px-3 py-2 text-center text-slate-100 backdrop-blur dark:border-slate-600 dark:bg-slate-800/70">
                  <p className="text-[10px] uppercase tracking-widest text-slate-200 dark:text-slate-300">NIGHT</p>
                  <p className="mt-1 text-base font-semibold">
                    {attendanceLoading ? '…' : attendanceSummary.shiftBreakdown.NIGHT}
                  </p>
                  <p className="text-[11px]">夜勤</p>
                </div>
              </div>
            </div>
            <div className="glass-panel rounded-2xl border border-white/25 p-4 text-slate-700 dark:border-slate-700/60 dark:text-slate-200">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Members</p>
              <div className="mt-2 flex items-baseline gap-3">
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{totalMembers}</p>
                <span className="text-xs text-slate-500 dark:text-slate-400">在籍スタッフ総数</span>
              </div>
            </div>
            <div className="glass-panel rounded-2xl border border-indigo-100/50 p-4 text-slate-700 shadow-sm shadow-indigo-200/40 dark:border-indigo-500/40 dark:text-slate-200 md:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-indigo-500 dark:text-indigo-300">Fairness Points</p>
                  <div className="mt-2 flex items-baseline gap-3">
                    <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-200">
                      {isFairnessLoading ? '…' : fairnessSummary ? fairnessSummary.totals.average_total.toFixed(1) : '--'}
                    </p>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      平均ポイント（{fairnessSummary?.period.label ?? '今月'}）
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3">
                    <div className="rounded-xl border border-indigo-100/60 bg-indigo-50/60 px-3 py-2 backdrop-blur dark:border-indigo-500/40 dark:bg-indigo-500/20">
                      <p className="text-[11px] uppercase tracking-widest text-indigo-500 dark:text-indigo-200">MAX / MIN</p>
                      <p className="mt-1 font-semibold text-indigo-700 dark:text-indigo-100">
                        {isFairnessLoading
                          ? '…'
                          : fairnessSummary
                            ? `${fairnessSummary.totals.max_total} / ${fairnessSummary.totals.min_total}`
                            : '--'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-100/60 bg-emerald-50/60 px-3 py-2 backdrop-blur dark:border-emerald-500/40 dark:bg-emerald-500/20">
                      <p className="text-[11px] uppercase tracking-widest text-emerald-500 dark:text-emerald-200">合計</p>
                      <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-100">
                        {isFairnessLoading ? '…' : fairnessSummary ? fairnessSummary.totals.total_points : '--'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2 backdrop-blur dark:border-slate-600/50 dark:bg-slate-800/40">
                      <p className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-300">対象人数</p>
                      <p className="mt-1 font-semibold text-slate-700 dark:text-slate-100">
                        {isFairnessLoading ? '…' : fairnessSummary ? fairnessSummary.totals.member_count : '--'} 名
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/40 bg-white/60 px-4 py-3 text-right text-xs shadow-sm shadow-indigo-100/40 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300">
                  <p className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">期間</p>
                  <p className="mt-2 font-semibold text-slate-700 dark:text-slate-200">
                    {fairnessSummary ? `${fairnessSummary.period.start} ~ ${fairnessSummary.period.end}` : '取得中…'}
                  </p>
                </div>
              </div>
              {isFairnessError ? (
                <p className="mt-4 text-xs text-rose-500 dark:text-rose-300">
                  公平ポイントの取得に失敗しました。時間を置いて再度お試しください。
                </p>
              ) : (
                <div className="mt-4">
                  {isFairnessLoading ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">ポイントを集計しています…</p>
                  ) : fairnessSummary && fairnessSummary.top_members.length > 0 ? (
                    <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                      {fairnessSummary.top_members.map((member) => (
                        <li
                          key={member.user_id}
                          className="flex items-start justify-between rounded-xl border border-indigo-100/60 bg-white/70 px-3 py-2 backdrop-blur dark:border-indigo-500/40 dark:bg-slate-900/40"
                        >
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-100">{member.name ?? '未登録ユーザー'}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {member.unit_names.length > 0 ? member.unit_names.join(', ') : 'ユニット未設定'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-200">
                              {member.total_points} pt
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              夜勤 {member.night_points} / 週末 {member.weekend_points} / 祝日 {member.holiday_points}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      今月の公平ポイントデータはまだ登録されていません。
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          {attendanceSummary.failedUnits ? (
            <p className="text-xs text-rose-400 dark:text-rose-300">
              一部のユニットでシフト情報を取得できませんでした（{attendanceSummary.failedUnits} 件）。後ほど再読み込みしてください。
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-6">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">ユニット一覧</h3>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              カバー要件や担当者バランスをチェックして、必要に応じて週次シフトを編集しましょう。
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-100 dark:hover:bg-indigo-500/30"
          >
            週間レポートエクスポート (準備中)
          </Link>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {data.data.map((unit) => (
            <Link
              key={unit.id}
              to={`/units/${unit.id}`}
              className="group flex flex-col justify-between rounded-3xl border border-white/30 bg-white/65 p-6 shadow-lg shadow-indigo-100/30 backdrop-blur transition hover:border-indigo-200/60 hover:bg-white/80 hover:shadow-indigo-200/60 dark:border-slate-700/60 dark:bg-slate-900/55 dark:hover:border-indigo-500/40 dark:hover:bg-slate-900/70"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-flex items-center rounded-full bg-indigo-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-600 backdrop-blur dark:bg-indigo-500/30 dark:text-indigo-100">
                    {unit.code}
                  </span>
                  <h4 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">{unit.name}</h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">メンバー {unit.member_count} 名</p>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                  <p>最低配置</p>
                  <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                    早 {unit.coverage_requirements.early ?? 1} / 日 {unit.coverage_requirements.day ?? 1} / 遅 {unit.coverage_requirements.late ?? 1} / 夜 {unit.coverage_requirements.night ?? 1}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between text-xs">
                <div className="text-slate-500 dark:text-slate-400">
                  {unit.leader ? (
                    <p>
                      リーダー: <span className="text-slate-800 dark:text-slate-100">{unit.leader.name}</span>
                    </p>
                  ) : (
                    <p className="text-rose-500 dark:text-rose-300">リーダー未設定</p>
                  )}
                </div>
                <p className="text-indigo-500 opacity-0 transition group-hover:opacity-100 dark:text-indigo-300">月次シフトを開く →</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

export default DashboardPage
