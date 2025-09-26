import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import SortableItem from '../components/SortableItem'
import SortableList from '../components/SortableList'
import { useAuth } from '../features/auth/AuthContext'
import {
  useCreateUnitMutation,
  useDeleteUnitMutation,
  useReorderUnitsMutation,
  useUnitsQuery,
  useUpdateUnitMembershipsMutation,
  useUpdateUnitMutation,
} from '../features/units/hooks'
import { useEmployeesQuery } from '../features/employees/hooks'
import type { Unit } from '../api/types'

const defaultCoverage = { early: '1', day: '1', late: '1', night: '1' }

type MemberDraft = {
  user_id: number
  name: string
  role: 'leader' | 'member'
  employment_type?: string | null
  allowed_shifts?: Array<{ code: string; name: string }>
}

const employmentTypeLabels: Record<string, string> = {
  full_time: '正社員',
  part_time: 'パート',
  contract: 'アルバイト',
}

const roleLabels: Record<string, string> = {
  admin: '管理者',
  leader: 'リーダー',
  member: 'メンバー',
}

const shiftBadgeStyles: Record<string, string> = {
  EARLY:
    'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200 border border-sky-200/60 dark:border-sky-500/40',
  DAY:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 border border-emerald-200/60 dark:border-emerald-500/40',
  LATE:
    'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200 border border-violet-200/60 dark:border-violet-500/40',
  NIGHT:
    'bg-slate-300 text-slate-800 dark:bg-slate-600/40 dark:text-slate-100 border border-slate-300/60 dark:border-slate-600/50',
  default:
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60',
}

const UnitManagementPage = () => {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canManageMemberships = user?.role === 'admin' || user?.role === 'leader'

  const unitsQuery = useUnitsQuery(!!user)
  const units = unitsQuery.data?.data ?? []

  const employeesQuery = useEmployeesQuery(canManageMemberships)
  const employees = employeesQuery.data?.data ?? []

  const createUnitMutation = useCreateUnitMutation()
  const updateUnitMutation = useUpdateUnitMutation()
  const deleteUnitMutation = useDeleteUnitMutation()
  const reorderUnitsMutation = useReorderUnitsMutation()

  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [unitName, setUnitName] = useState('')
  const [unitCode, setUnitCode] = useState('')
  const [coverage, setCoverage] = useState(() => ({ ...defaultCoverage }))
  const [membersDraft, setMembersDraft] = useState<MemberDraft[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [orderDraft, setOrderDraft] = useState<number[]>([])

  useEffect(() => {
    if (units.length && !isCreating && selectedUnitId === null) {
      setSelectedUnitId(units[0].id)
    }
  }, [isCreating, selectedUnitId, units])

  useEffect(() => {
    setOrderDraft(units.map((unit) => unit.id))
  }, [units])

  const selectedUnit = useMemo<Unit | null>(
    () => units.find((unit) => unit.id === selectedUnitId) ?? null,
    [selectedUnitId, units],
  )

  const mapMembershipToDraft = useCallback(
    (member: { id: number; name: string; role: string }) => {
      const employee = employees.find((candidate) => candidate.id === member.id)
      const allowedShifts = (employee?.allowed_shift_types ?? [])
        .filter((type) => {
          const code = (type.code ?? '').toUpperCase()
          return code !== 'OFF' && code !== 'NIGHT_AFTER'
        })
        .map((type) => ({ code: (type.code ?? '').toUpperCase(), name: type.name }))

      return {
        user_id: member.id,
        name: member.name,
        role: (member.role as 'leader' | 'member') ?? 'member',
        employment_type: employee?.employment_type ?? null,
        allowed_shifts: allowedShifts,
      }
    },
    [employees],
  )

  const updateMembershipsMutation = useUpdateUnitMembershipsMutation(selectedUnit?.id ?? 0)

  useEffect(() => {
    updateMembershipsMutation.reset()
  }, [selectedUnitId, updateMembershipsMutation])

  const syncUnitForm = useCallback(
    (unit: Unit | null) => {
      if (!unit) {
        setUnitName('')
        setUnitCode('')
        setCoverage({ ...defaultCoverage })
        setMembersDraft([])
        return
      }

      setUnitName(unit.name)
      setUnitCode(unit.code)
      setCoverage({
        early: String(unit.coverage_requirements.early ?? 0),
        day: String(unit.coverage_requirements.day ?? 0),
        late: String(unit.coverage_requirements.late ?? 0),
        night: String(unit.coverage_requirements.night ?? 0),
      })

      const mappedMembers = (unit.members ?? []).map((member) => mapMembershipToDraft(member))
      setMembersDraft(mappedMembers)
    },
    [mapMembershipToDraft],
  )

  useEffect(() => {
    if (isCreating) {
      syncUnitForm(null)
      return
    }

    syncUnitForm(selectedUnit ?? null)
  }, [isCreating, selectedUnit, syncUnitForm])

  const handleSelectUnit = (unitId: number) => {
    setIsCreating(false)
    setSelectedUnitId(unitId)
    setFeedback(null)
    setError(null)

    const unit = units.find((item) => item.id === unitId) ?? null
    syncUnitForm(unit)
  }

  const handleStartCreate = () => {
    setIsCreating(true)
    setSelectedUnitId(null)
    setFeedback(null)
    setError(null)
    syncUnitForm(null)
  }

 const normalizeCoverage = () => ({
    early: clampCoverage(Number(coverage.early)),
    day: clampCoverage(Number(coverage.day)),
    late: clampCoverage(Number(coverage.late)),
    night: clampCoverage(Number(coverage.night)),
  })

  const handleSaveUnit = async (event: FormEvent) => {
    event.preventDefault()
    setFeedback(null)
    setError(null)

    const payload = {
      name: unitName.trim(),
      code: unitCode.trim(),
      coverage_requirements: normalizeCoverage(),
    }

    if (!payload.name || !payload.code) {
      setError('ユニット名とコードを入力してください。')
      return
    }

    try {
      if (isCreating) {
        const createdUnit = await createUnitMutation.mutateAsync(payload)
        setFeedback('ユニットを作成しました。')
        setIsCreating(false)
        setSelectedUnitId(createdUnit.id)
      } else if (selectedUnitId) {
        await updateUnitMutation.mutateAsync({ unitId: selectedUnitId, payload })
        setFeedback('ユニット情報を更新しました。')
      }
    } catch (err) {
      console.error(err)
      setError('ユニット情報の保存に失敗しました。入力内容をご確認ください。')
    }
  }

  const handleDeleteUnit = async (unitId: number) => {
    if (!window.confirm('このユニットを削除します。よろしいですか？')) {
      return
    }

    setFeedback(null)
    setError(null)

    try {
      await deleteUnitMutation.mutateAsync(unitId)
      setFeedback('ユニットを削除しました。')
      if (selectedUnitId === unitId) {
        setSelectedUnitId(null)
      }
    } catch (err) {
      console.error(err)
      setError('ユニットの削除に失敗しました。シフト割当が残っていないか確認してください。')
    }
  }

  const handleSaveOrder = async () => {
    setFeedback(null)
    setError(null)
    try {
      await reorderUnitsMutation.mutateAsync(orderDraft)
      setFeedback('表示順を更新しました。')
    } catch (err) {
      console.error(err)
      setError('表示順の更新に失敗しました。')
    }
  }

  const originalOrder = useMemo(() => units.map((unit) => unit.id), [units])
  const isOrderChanged = useMemo(() => {
    if (orderDraft.length !== originalOrder.length) return true
    return orderDraft.some((value, index) => value !== originalOrder[index])
  }, [orderDraft, originalOrder])

  const availableEmployeeOptions = useMemo(
    () =>
      employees.filter((employee) =>
        !membersDraft.some((member) => member.user_id === employee.id),
      ),
    [employees, membersDraft],
  )

  const updateMemberDraft = (userId: number, partial: Partial<MemberDraft>) => {
    setMembersDraft((prev) =>
      prev.map((member) => (member.user_id === userId ? { ...member, ...partial } : member)),
    )
  }

  const handleAddMember = () => {
    if (!selectedEmployeeId) return
    const employeeId = Number(selectedEmployeeId)
    const employee = employees.find((candidate) => candidate.id === employeeId)
    if (!employee) return

    setMembersDraft((prev) => [
      ...prev,
      {
        user_id: employee.id,
        name: employee.name,
        role: 'member',
        employment_type: employee.employment_type,
        allowed_shifts:
          employee.allowed_shift_types
            ?.filter((type) => {
              const code = (type.code ?? '').toUpperCase()
              return code !== 'OFF' && code !== 'NIGHT_AFTER'
            })
            .map((type) => ({ code: (type.code ?? '').toUpperCase(), name: type.name })) ?? [],
      },
    ])
    setSelectedEmployeeId('')
  }

  const handleRemoveMember = (userId: number) => {
    setMembersDraft((prev) => prev.filter((member) => member.user_id !== userId))
  }

  const handleSaveMemberships = async () => {
    if (!selectedUnit) return
    setFeedback(null)
    setError(null)

    const normalized = membersDraft.length
      ? membersDraft.map((member) => ({
          user_id: member.user_id,
          role: member.role,
        }))
      : []

    try {
      const updatedUnit = await updateMembershipsMutation.mutateAsync(normalized)
      if (updatedUnit?.members) {
        setMembersDraft(
          updatedUnit.members.map((member) => {
            const employee = employees.find((candidate) => candidate.id === member.id)
            const allowedShifts = (employee?.allowed_shift_types ?? [])
              .filter((type) => {
                const code = (type.code ?? '').toUpperCase()
                return code !== 'OFF' && code !== 'NIGHT_AFTER'
              })
              .map((type) => ({ code: (type.code ?? '').toUpperCase(), name: type.name }))
            return {
              user_id: member.id,
              name: member.name,
              role: (member.role as 'leader' | 'member') ?? 'member',
              employment_type: employee?.employment_type ?? null,
              allowed_shifts: allowedShifts,
            }
          }),
        )
      }
      setFeedback('メンバー構成を更新しました。')
    } catch (err) {
      console.error(err)
      setError('メンバー構成の更新に失敗しました。入力内容をご確認ください。')
    }
  }

  if (unitsQuery.isLoading) {
    return (
      <div className="glass-panel rounded-xl border border-white/25 p-6 text-sm text-slate-600 shadow-lg dark:border-slate-700/60 dark:text-slate-300">
        ユニット情報を読み込み中です…
      </div>
    )
  }

  if (unitsQuery.isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-500 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
        ユニット情報の取得に失敗しました。再度お試しください。
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">ユニット管理</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          表示順や最低配置、メンバー構成を管理します。{isAdmin ? '新しいユニットの作成や編集も可能です。' : ''}
        </p>
      </header>

      {feedback ? (
        <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/75 px-4 py-3 text-sm text-emerald-600 backdrop-blur dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200">
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-200/60 bg-rose-50/75 px-4 py-3 text-sm text-rose-500 backdrop-blur dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <aside className="glass-panel space-y-4 rounded-3xl border border-white/20 p-4 shadow-lg dark:border-slate-700/60">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">ユニット一覧</h2>
            {isAdmin ? (
              <button
                type="button"
                onClick={handleStartCreate}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-100 dark:hover:bg-indigo-500/30"
              >
                + 新規作成
              </button>
            ) : null}
          </div>
          <SortableList
            items={orderDraft}
            onReorder={(next) => setOrderDraft(next.map((value) => Number(value)))}
            disabled={!isAdmin || reorderUnitsMutation.isPending}
          >
            <div className="space-y-2">
              {orderDraft.map((unitId) => {
                const unit = units.find((item) => item.id === unitId)
                if (!unit) return null
                return (
                  <SortableItem key={unit.id} id={unit.id} disabled={!isAdmin || reorderUnitsMutation.isPending}>
                    {({ setNodeRef, style, attributes, listeners }) => (
                      <div
                        ref={setNodeRef}
                        style={style}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectUnit(unit.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            handleSelectUnit(unit.id)
                          }
                        }}
                        className={`group rounded-2xl border px-3 py-3 text-sm shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                          selectedUnitId === unit.id && !isCreating
                            ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/60 dark:bg-indigo-500/10'
                            : 'border-white/30 bg-white/60 hover:border-indigo-200/60 hover:bg-white/80 dark:border-slate-700/60 dark:bg-slate-900/60 dark:hover:border-indigo-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-left font-semibold text-slate-800 dark:text-slate-100">
                            {unit.name}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{unit.code}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          {isAdmin ? (
                            <button
                              type="button"
                              className="rounded-full border border-slate-200 px-2 py-1 text-slate-400 cursor-move transition hover:bg-white/60 dark:border-slate-600 dark:text-slate-500 dark:hover:bg-slate-800/60"
                              {...attributes}
                              {...(listeners ?? {})}
                            >
                              ⇅
                            </button>
                          ) : null}
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDeleteUnit(unit.id)
                              }}
                              className="ml-auto rounded-full border border-rose-200 px-2 py-1 text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-200 dark:hover:bg-rose-500/20"
                              disabled={deleteUnitMutation.isPending}
                            >
                              削除
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </SortableItem>
                )
              })}
            </div>
          </SortableList>
          {isAdmin ? (
            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={reorderUnitsMutation.isPending || !isOrderChanged}
              className="w-full rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {reorderUnitsMutation.isPending ? '更新中…' : '表示順を保存'}
            </button>
          ) : null}
        </aside>

        <div className="space-y-6">
          {isAdmin ? (
            <section className="glass-panel rounded-3xl border border-white/20 p-6 shadow-lg dark:border-slate-700/60">
              <form className="space-y-4" onSubmit={handleSaveUnit}>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {isCreating ? 'ユニットを新規作成' : 'ユニット情報を編集'}
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-600 dark:text-slate-300">
                    ユニット名
                    <input
                      type="text"
                      value={unitName}
                      onChange={(event) => setUnitName(event.target.value)}
                    className="mt-1 w-full glass-input focus:border-indigo-400 focus:outline-none dark:focus:border-indigo-400"
                      required
                    />
                  </label>
                  <label className="text-sm text-slate-600 dark:text-slate-300">
                    コード
                    <input
                      type="text"
                      value={unitCode}
                      onChange={(event) => setUnitCode(event.target.value)}
                    className="mt-1 w-full glass-input focus:border-indigo-400 focus:outline-none dark:focus:border-indigo-400"
                      required
                    />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  {(['early', 'day', 'late', 'night'] as const).map((key) => (
                    <label key={key} className="text-sm text-slate-600 dark:text-slate-300">
                      {coverageLabel(key)}
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={coverage[key]}
                        onChange={(event) =>
                          setCoverage((prev) => ({
                            ...prev,
                            [key]: event.target.value,
                          }))
                        }
                        className="mt-1 w-full glass-input focus:border-indigo-400 focus:outline-none dark:focus:border-indigo-400"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={createUnitMutation.isPending || updateUnitMutation.isPending}
                    className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    {createUnitMutation.isPending || updateUnitMutation.isPending ? '保存中…' : 'ユニットを保存'}
                  </button>
                  {!isCreating && (
                    <button
                      type="button"
                      onClick={handleStartCreate}
                      className="rounded-full border border-slate-200 px-5 py-2 text-sm text-slate-600 transition hover:border-slate-400 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500"
                    >
                      新規作成モードへ
                    </button>
                  )}
                </div>
              </form>
            </section>
          ) : null}

          {canManageMemberships && selectedUnit ? (
            <section className="glass-panel space-y-4 rounded-3xl border border-white/20 p-6 shadow-lg dark:border-slate-700/60">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  メンバー構成 ({selectedUnit.name})
                </h2>
                <button
                  type="button"
                  onClick={handleSaveMemberships}
                  disabled={updateMembershipsMutation.isPending}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  {updateMembershipsMutation.isPending ? '保存中…' : 'メンバー構成を保存'}
                </button>
              </div>
              <SortableList
            items={membersDraft.map((member) => member.user_id)}
            onReorder={(ids) => {
              const order = ids.map((value) => Number(value))
              setMembersDraft((prev) => {
                const map = new Map(prev.map((member) => [member.user_id, member]))
                return order
                  .map((id) => map.get(id))
                  .filter((member): member is MemberDraft => Boolean(member))
              })
            }}
            disabled={!canManageMemberships || updateMembershipsMutation.isPending}
          >
            <div className="space-y-3">
              {membersDraft.map((member) => (
                <SortableItem
                  key={member.user_id}
                  id={member.user_id}
                  disabled={!canManageMemberships || updateMembershipsMutation.isPending}
                >
                  {({ setNodeRef, style, attributes, listeners }) => (
                    <div
                      ref={setNodeRef}
                      style={style}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
                    >
                      {canManageMemberships ? (
                        <button
                          type="button"
                          className="text-lg leading-none text-slate-400 cursor-move dark:text-slate-500"
                          {...attributes}
                          {...(listeners ?? {})}
                        >
                          ☰
                        </button>
                      ) : null}
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{member.name}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          雇用区分:{' '}
                          {employmentTypeLabels[member.employment_type ?? ''] ?? member.employment_type ?? '情報なし'}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {member.allowed_shifts?.length ? (
                            member.allowed_shifts.map((shift) => {
                              const classes = shiftBadgeStyles[shift.code] ?? shiftBadgeStyles.default
                              return (
                                <span
                                  key={`${member.user_id}-${shift.code}-${shift.name}`}
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${classes}`}
                                >
                                  {shift.name}
                                </span>
                              )
                            })
                          ) : (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">勤務可能シフト情報なし</span>
                          )}
                        </div>
                      </div>
                      <select
                        value={member.role}
                        onChange={(event) =>
                          updateMemberDraft(member.user_id, {
                            role: event.target.value as 'leader' | 'member',
                          })
                        }
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        disabled={!canManageMemberships}
                      >
                        <option value="leader">リーダー</option>
                        <option value="member">メンバー</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.user_id)}
                        className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-200 dark:hover:bg-rose-500/20"
                        disabled={!canManageMemberships}
                      >
                        削除
                      </button>
                    </div>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableList>
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 dark:border-slate-600">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">メンバーを追加</h3>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <select
                    value={selectedEmployeeId}
                    onChange={(event) => setSelectedEmployeeId(event.target.value)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">従業員を選択</option>
                    {availableEmployeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} ({employee.email})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddMember}
                    disabled={!selectedEmployeeId}
                    className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60"
                  >
                    追加
                  </button>
                  {employeesQuery.isLoading ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500">従業員リストを読み込み中…</span>
                  ) : null}
                  {employeesQuery.isError ? (
                    <span className="text-xs text-rose-500">従業員情報の取得に失敗しました。</span>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {!canManageMemberships && selectedUnit ? (
            <section className="glass-panel space-y-3 rounded-3xl border border-white/20 p-6 shadow-lg dark:border-slate-700/60">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">メンバー構成 ({selectedUnit.name})</h2>
              {membersDraft.length ? (
                <div className="space-y-3">
                  {membersDraft.map((member) => (
                    <div
                      key={member.user_id}
                      className="rounded-2xl border border-white/30 bg-white/60 px-4 py-3 text-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{member.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {roleLabels[member.role] ?? member.role ?? 'メンバー'}
                            {member.employment_type
                              ? ` / ${employmentTypeLabels[member.employment_type] ?? member.employment_type}`
                              : ''}
                          </p>
                        </div>
                        {member.allowed_shifts?.length ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            {member.allowed_shifts.map((shift) => (
                              <span
                                key={`${member.user_id}-${shift.code}`}
                                className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-semibold ${
                                  shiftBadgeStyles[shift.code] ?? shiftBadgeStyles.default
                                }`}
                              >
                                {shift.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">メンバーが登録されていません。</p>
              )}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  )
}

type CoverageKey = 'early' | 'day' | 'late' | 'night'

const coverageLabel = (key: CoverageKey) =>
  ({
    early: '早番',
    day: '日勤',
    late: '遅番',
    night: '夜勤',
  }[key])

const clampCoverage = (value: number) => {
  if (Number.isNaN(value)) return 0
  return Math.min(10, Math.max(0, Math.round(value)))
}

export default UnitManagementPage
