import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen'
import SortableItem from '../components/SortableItem'
import SortableList from '../components/SortableList'
import { useDeleteEmployeeMutation, useEmployeesQuery } from '../features/employees/hooks'
import { useFlashMessage } from '../features/flash/FlashMessageContext'

const roleLabels: Record<string, string> = {
  admin: '管理者',
  leader: 'チームリーダー',
  member: 'メンバー',
}

const employmentTypeLabels: Record<string, string> = {
  full_time: '正社員',
  part_time: 'パート',
  contract: 'アルバイト',
}

const shiftBadgeStyles: Record<string, { bg: string; text: string }> = {
  EARLY: { bg: 'bg-sky-100', text: 'text-sky-700' },
  DAY: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  LATE: { bg: 'bg-slate-200', text: 'text-slate-700' },
  NIGHT: { bg: 'bg-slate-400', text: 'text-slate-900' },
}

const shiftDisplayOrder = ['EARLY', 'DAY', 'LATE', 'NIGHT'] as const

const EmployeesPage = () => {
  const { data, isLoading, isError } = useEmployeesQuery()
  const deleteEmployeeMutation = useDeleteEmployeeMutation()
  const { message: flashMessage, showMessage, clearMessage } = useFlashMessage()
  const employees = data?.data ?? []
  const [orderedIds, setOrderedIds] = useState<number[]>([])
  const [unitFilter, setUnitFilter] = useState<string>('')
  const [employmentFilter, setEmploymentFilter] = useState<string>('')
  const [roleFilter, setRoleFilter] = useState<string>('')

  useEffect(() => {
    setOrderedIds(employees.map((employee) => employee.id))
  }, [employees])

  const orderedEmployees = useMemo(
    () =>
      orderedIds
        .map((id) => employees.find((employee) => employee.id === id))
        .filter((employee): employee is (typeof employees)[number] => Boolean(employee)),
    [employees, orderedIds],
  )

  const filteredEmployees = useMemo(() => {
    return orderedEmployees.filter((employee) => {
      const matchRole = roleFilter ? employee.role === roleFilter : true
      const matchEmployment = employmentFilter ? employee.employment_type === employmentFilter : true
      const matchUnit = unitFilter
        ? employee.memberships.some((membership) => String(membership.unit_id) === unitFilter)
        : true

      return matchRole && matchEmployment && matchUnit
    })
  }, [orderedEmployees, roleFilter, employmentFilter, unitFilter])

  const totalCount = useMemo(() => data?.meta?.count ?? employees.length, [data, employees.length])
  const visibleCount = filteredEmployees.length

  const unitOptions = useMemo(() => {
    const map = new Map<string, string>()
    employees.forEach((employee) => {
      employee.memberships.forEach((membership) => {
        if (membership.unit_id) {
          map.set(String(membership.unit_id), membership.unit_name ?? `ID:${membership.unit_id}`)
        }
      })
    })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [employees])

  if (isLoading) {
    return <LoadingScreen message="従業員情報を読み込み中です…" />
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-600">
        従業員一覧の取得に失敗しました。
      </div>
    )
  }

  const handleDelete = async (employeeId: number, employeeName: string) => {
    if (!window.confirm(`${employeeName} を削除します。よろしいですか？`)) {
      return
    }

    try {
      await deleteEmployeeMutation.mutateAsync(employeeId)
      showMessage({ type: 'success', text: '従業員を削除しました。' })
    } catch (error) {
      console.error(error)
      showMessage({ type: 'error', text: '従業員の削除に失敗しました。' })
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">従業員管理</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">従業員一覧</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">スタッフの追加・編集・削除を行います。</p>
        </div>
        <Link
          to="/employees/new"
          className="inline-flex items-center rounded-full border border-indigo-200/60 bg-indigo-500/80 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-300/40 transition hover:bg-indigo-500 dark:border-indigo-500/50 dark:bg-indigo-500/80 dark:hover:bg-indigo-400"
        >
          + 新規従業員を追加
        </Link>
      </div>

      <div className="glass-panel grid gap-3 rounded-2xl border border-white/25 p-4 transition-colors md:grid-cols-2 lg:grid-cols-4 dark:border-slate-700/60">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          ユニット
          <select
            value={unitFilter}
            onChange={(event) => setUnitFilter(event.target.value)}
            className="glass-input focus:border-indigo-400 focus:outline-none dark:focus:border-indigo-400"
          >
            <option value="">すべて</option>
            {unitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          雇用区分
          <select
            value={employmentFilter}
            onChange={(event) => setEmploymentFilter(event.target.value)}
            className="glass-input focus:border-indigo-400 focus:outline-none dark:focus:border-indigo-400"
          >
            <option value="">すべて</option>
            {Object.entries(employmentTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          役割
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="glass-input focus:border-indigo-400 focus:outline-none dark:focus:border-indigo-400"
          >
            <option value="">すべて</option>
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {(unitFilter || employmentFilter || roleFilter) && (
          <div className="flex items-end justify-end">
            <button
              type="button"
              onClick={() => {
                setUnitFilter('')
                setEmploymentFilter('')
                setRoleFilter('')
              }}
              className="inline-flex items-center rounded-full border border-white/30 bg-white/50 px-3 py-1.5 text-xs font-semibold text-slate-600 backdrop-blur transition hover:bg-white/70 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70"
            >
              フィルタをクリア
            </button>
          </div>
        )}
      </div>

      {flashMessage ? (
        <div
          className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${
            flashMessage.type === 'success'
              ? 'border-emerald-200/60 bg-emerald-50/70 text-emerald-600 backdrop-blur dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200'
              : flashMessage.type === 'error'
                ? 'border-rose-200/60 bg-rose-50/70 text-rose-600 backdrop-blur dark:border-rose-400/40 dark:bg-rose-400/15 dark:text-rose-200'
                : 'border-sky-200/60 bg-sky-50/70 text-sky-600 backdrop-blur dark:border-sky-400/40 dark:bg-sky-400/15 dark:text-sky-200'
          }`}
        >
          <span>{flashMessage.text}</span>
          <button
            type="button"
            onClick={clearMessage}
            className="text-xs font-semibold text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            aria-label="フラッシュメッセージを閉じる"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="glass-panel rounded-2xl border border-white/20 shadow-lg transition-colors dark:border-slate-700/60">
        <div className="flex items-center justify-between border-b border-white/20 px-6 py-4 text-sm text-slate-500 backdrop-blur dark:border-slate-700/60 dark:text-slate-400">
          <span>
            全 {totalCount} 名 / 表示 {visibleCount} 名
          </span>
          {deleteEmployeeMutation.isPending ? <span className="text-xs text-slate-400">削除中…</span> : null}
        </div>
        <div className="overflow-x-auto">
          {employees.length === 0 ? (
            <div className="px-6 py-6 text-center text-sm text-slate-400 dark:text-slate-500">登録されている従業員がいません。</div>
          ) : visibleCount === 0 ? (
            <div className="px-6 py-6 text-center text-sm text-slate-400 dark:text-slate-500">該当する従業員が見つかりません。</div>
          ) : (
            <SortableList
              items={filteredEmployees.map((employee) => employee.id)}
              onReorder={(ids) => {
                const numericIds = ids.map((value) => Number(value))
                setOrderedIds((prev) => {
                  const others = prev.filter((id) => !numericIds.includes(id))
                  return [...numericIds, ...others]
                })
              }}
              disabled={
                filteredEmployees.length <= 1 ||
                deleteEmployeeMutation.isPending ||
                Boolean(unitFilter || employmentFilter || roleFilter)
              }
            >
              <table className="w-full min-w-[780px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                    <th className="px-6 py-3 w-10" aria-label="並び替え" />
                    <th className="px-6 py-3">氏名</th>
                    <th className="px-6 py-3">役割</th>
                    <th className="px-6 py-3">雇用区分</th>
                    <th className="px-6 py-3">勤務可能シフト</th>
                    <th className="px-6 py-3">所属ユニット</th>
                    <th className="px-6 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((employee) => (
                    <SortableItem key={employee.id} id={employee.id}>
                      {({ setNodeRef, style, attributes, listeners }) => {
                        const displayShiftTypes = (employee.allowed_shift_types ?? [])
                          .filter((shiftType) => {
                            const normalized = (shiftType.code ?? '').toUpperCase()
                            return normalized !== 'NIGHT_AFTER' && normalized !== 'OFF'
                          })
                          .sort((a, b) => {
                            const aNormalized = (a.code ?? '').toUpperCase()
                            const bNormalized = (b.code ?? '').toUpperCase()
                            const aIndex = shiftDisplayOrder.indexOf(aNormalized as typeof shiftDisplayOrder[number])
                            const bIndex = shiftDisplayOrder.indexOf(bNormalized as typeof shiftDisplayOrder[number])
                            const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex
                            const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex
                            return normalizedA - normalizedB
                          })

                        return (
                          <tr
                            ref={setNodeRef}
                            style={style}
                            className="bg-white/70 shadow-sm backdrop-blur transition-colors dark:bg-slate-900/60"
                          >
                            <td className="px-6 py-4 text-center align-top text-slate-300 dark:text-slate-600">
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/40 text-lg leading-none text-slate-500 transition hover:bg-white/60 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300"
                                {...attributes}
                                {...(listeners ?? {})}
                              >
                                ☰
                              </button>
                            </td>
                            <td className="align-top px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                              <div className="font-semibold">{employee.name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">ID: {employee.id}</div>
                            </td>
                            <td className="align-top px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {employee.role_label ?? roleLabels[employee.role] ?? employee.role}
                            </td>
                            <td className="align-top px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {employmentTypeLabels[employee.employment_type] ?? employee.employment_type}
                            </td>
                            <td className="align-top px-6 py-4 text-sm text-slate-600">
                              {displayShiftTypes.length === 0 ? (
                                <span className="text-xs text-slate-400 dark:text-slate-500">情報なし</span>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {displayShiftTypes.map((shiftType) => (
                                    <span
                                      key={`${employee.id}-shift-${shiftType.id}`}
                                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                        shiftBadgeStyles[shiftType.code?.toUpperCase() ?? '']?.bg ?? 'bg-slate-100'
                                    } ${
                                      shiftBadgeStyles[shiftType.code?.toUpperCase() ?? '']?.text ?? 'text-slate-600'
                                    }`}
                                  >
                                    {shiftType.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            </td>
                            <td className="align-top px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {employee.memberships.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {employee.memberships.map((membership) => (
                                    <span
                                      key={`${employee.id}-${membership.unit_id}`}
                                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs backdrop-blur ${
                                        membership.role === 'leader'
                                          ? 'bg-indigo-100/80 text-indigo-600 dark:bg-indigo-500/30 dark:text-indigo-200'
                                          : 'bg-slate-100/80 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
                                      }`}
                                    >
                                      <span className="font-semibold">{membership.unit_name ?? `ID:${membership.unit_id}`}</span>
                                      <span className="text-[10px] uppercase tracking-widest text-slate-400">
                                        {membership.role === 'leader' ? 'L' : 'M'}
                                      </span>
                                    </span>
                                  ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-500">所属なし</span>
                            )}
                            </td>
                            <td className="align-top px-6 py-4 text-right text-sm">
                              <div className="flex justify-end gap-2">
                                <Link
                                  to={`/employees/${employee.id}`}
                                  className="inline-flex items-center rounded-full border border-white/30 bg-white/40 px-3 py-1.5 text-xs font-semibold text-slate-600 backdrop-blur transition hover:bg-white/60 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60"
                                >
                                  編集
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(employee.id, employee.name)}
                                  className="inline-flex items-center rounded-full border border-rose-200/60 bg-rose-50/70 px-3 py-1.5 text-xs font-semibold text-rose-600 backdrop-blur transition hover:bg-rose-100/80 dark:border-rose-400/40 dark:bg-rose-400/15 dark:text-rose-300 dark:hover:bg-rose-400/25"
                                  disabled={deleteEmployeeMutation.isPending}
                                >
                                  削除
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }}
                    </SortableItem>
                  ))}
                </tbody>
              </table>
            </SortableList>
          )}
        </div>
      </div>
    </div>
  )
}

export default EmployeesPage
