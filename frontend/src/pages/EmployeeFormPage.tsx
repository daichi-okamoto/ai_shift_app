import { AxiosError } from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen'
import { useCreateEmployeeMutation, useEmployeeQuery, useUpdateEmployeeMutation } from '../features/employees/hooks'
import type { EmployeePayload } from '../features/employees/api'
import type { SchedulePreferences } from '../api/types'
import { useShiftTypesQuery, useUnitsQuery } from '../features/units/hooks'
import { useFlashMessage } from '../features/flash/FlashMessageContext'

const roleOptions: Array<{ value: EmployeePayload['role']; label: string }> = [
  { value: 'admin', label: '管理者' },
  { value: 'leader', label: 'チームリーダー' },
  { value: 'member', label: 'メンバー' },
]

const employmentOptions: Array<{ value: EmployeePayload['employment_type']; label: string }> = [
  { value: 'full_time', label: '正社員' },
  { value: 'part_time', label: 'パート' },
  { value: 'contract', label: 'アルバイト' },
]

type MembershipFormRow = {
  id: string
  unitId: number | null
  role: 'leader' | 'member'
}

const createEmptyMembershipRow = (): MembershipFormRow => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  unitId: null,
  role: 'member',
})

type FixedDayKey = keyof SchedulePreferences['fixed_days_off']
type FixedDaysOffState = Record<FixedDayKey, boolean>

const fixedDayOptions: Array<{ key: FixedDayKey; label: string }> = [
  { key: 'monday', label: '月曜日' },
  { key: 'tuesday', label: '火曜日' },
  { key: 'wednesday', label: '水曜日' },
  { key: 'thursday', label: '木曜日' },
  { key: 'friday', label: '金曜日' },
  { key: 'saturday', label: '土曜日' },
  { key: 'sunday', label: '日曜日' },
  { key: 'holiday', label: '祝日' },
]

const createDefaultFixedDaysOff = (): FixedDaysOffState =>
  fixedDayOptions.reduce((acc, option) => {
    acc[option.key] = false
    return acc
  }, {} as FixedDaysOffState)

const EmployeeFormPage = () => {
  const params = useParams<{ employeeId?: string }>()
  const isEdit = Boolean(params.employeeId)
  const employeeId = isEdit ? Number(params.employeeId) : undefined
  const navigate = useNavigate()
  const { data: unitsData, isLoading: isUnitsLoading, isError: isUnitsError } = useUnitsQuery(true)
  const units = unitsData?.data ?? []

  const {
    data: shiftTypesData,
    isLoading: isShiftTypesLoading,
    isError: isShiftTypesError,
  } = useShiftTypesQuery(true)
  const shiftTypes = shiftTypesData?.data ?? []
  const selectableShiftTypes = useMemo(
    () =>
      [...shiftTypes]
        .filter((type) => !['OFF', 'NIGHT_AFTER'].includes(type.code))
        .sort((a, b) => a.start_at.localeCompare(b.start_at)),
    [shiftTypes],
  )

  const {
    data: employeeData,
    isLoading: isEmployeeLoading,
    isError: isEmployeeError,
  } = useEmployeeQuery(isEdit ? employeeId : undefined)

  const createEmployeeMutation = useCreateEmployeeMutation()
  const updateEmployeeMutation = useUpdateEmployeeMutation(employeeId ?? 0)
  const { showMessage } = useFlashMessage()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<EmployeePayload['role']>('member')
  const [employmentType, setEmploymentType] = useState<EmployeePayload['employment_type']>('full_time')
  const [canNightShift, setCanNightShift] = useState(false)
  const [contractHours, setContractHours] = useState<string>('')
  const [allowedShiftTypeIds, setAllowedShiftTypeIds] = useState<number[]>([])
  const [password, setPassword] = useState('')
  const [memberships, setMemberships] = useState<MembershipFormRow[]>([])
  const [fixedDaysOff, setFixedDaysOff] = useState<FixedDaysOffState>(createDefaultFixedDaysOff)
  const [formError, setFormError] = useState<string | null>(null)

  const selectableShiftTypeIds = useMemo(
    () => selectableShiftTypes.map((shiftType) => shiftType.id),
    [selectableShiftTypes],
  )
  const isAllShiftTypesSelected = useMemo(() => {
    if (selectableShiftTypeIds.length === 0) {
      return false
    }
    return selectableShiftTypeIds.every((id) => allowedShiftTypeIds.includes(id))
  }, [allowedShiftTypeIds, selectableShiftTypeIds])

  useEffect(() => {
    if (!isEdit || !employeeData?.data) {
      return
    }
    const employee = employeeData.data
    setName(employee.name)
    setEmail(employee.email)
    setRole(employee.role as EmployeePayload['role'])
    setEmploymentType(employee.employment_type as EmployeePayload['employment_type'])
    setCanNightShift(Boolean(employee.can_night_shift))
    setContractHours(employee.contract_hours_per_week?.toString() ?? '')
    const allowedFromApi = (employee.allowed_shift_types ?? []).map((shiftType) => shiftType.id)
    setAllowedShiftTypeIds(allowedFromApi)
    setMemberships(
      employee.memberships.map((membership) => ({
        id: `${membership.unit_id}-${Math.random().toString(16).slice(2)}`,
        unitId: membership.unit_id,
        role: (membership.role as 'leader' | 'member') ?? 'member',
      })),
    )
    const apiFixedDays = employee.schedule_preferences?.fixed_days_off ?? {}
    setFixedDaysOff(() => {
      const next = createDefaultFixedDaysOff()
      Object.entries(apiFixedDays).forEach(([key, value]) => {
        if (key in next) {
          next[key as FixedDayKey] = Boolean(value)
        }
      })
      return next
    })
  }, [employeeData, isEdit])

  useEffect(() => {
    if (selectableShiftTypes.length === 0) {
      return
    }

    setAllowedShiftTypeIds((current) => {
      const validIds = current.filter((id) => selectableShiftTypes.some((type) => type.id === id))

      if (!isEdit && validIds.length === 0) {
        return selectableShiftTypes.map((type) => type.id)
      }

      if (validIds.length !== current.length) {
        return validIds
      }

      return current
    })
  }, [selectableShiftTypes, isEdit])

  const handleAddMembership = () => {
    setMemberships((prev) => [...prev, createEmptyMembershipRow()])
  }

  const handleToggleShiftType = (shiftTypeId: number, checked: boolean) => {
    setAllowedShiftTypeIds((prev) => {
      if (checked) {
        if (prev.includes(shiftTypeId)) {
          return prev
        }
        return [...prev, shiftTypeId]
      }
      return prev.filter((id) => id !== shiftTypeId)
    })
  }

  const handleToggleAllShiftTypes = (selectAll: boolean) => {
    setAllowedShiftTypeIds(selectAll ? selectableShiftTypeIds : [])
  }

  const handleMembershipChange = (id: string, changes: Partial<MembershipFormRow>) => {
    setMemberships((prev) =>
      prev.map((membership) =>
        membership.id === id
          ? {
              ...membership,
              ...changes,
            }
          : membership,
      ),
    )
  }

  const handleRemoveMembership = (id: string) => {
    setMemberships((prev) => prev.filter((membership) => membership.id !== id))
  }

  const isSubmitting = createEmployeeMutation.isPending || updateEmployeeMutation.isPending

  const resolvedMemberships = useMemo(() => memberships.filter((membership) => membership.unitId !== null), [memberships])

  const employeeNotFound = isEdit && !isEmployeeLoading && isEmployeeError

  if (isEdit && (!employeeId || Number.isNaN(employeeId) || employeeId <= 0)) {
    return <Navigate to="/employees" replace />
  }

  if (isEdit && employeeNotFound) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-600">
        指定された従業員が見つかりませんでした。
      </div>
    )
  }

  if (isUnitsLoading || isShiftTypesLoading || (isEdit && isEmployeeLoading)) {
    return <LoadingScreen message="従業員情報を読み込み中です…" />
  }

  if (isUnitsError || isShiftTypesError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-600">
        必要なマスタ情報の取得に失敗しました。
      </div>
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const filteredMemberships = resolvedMemberships.map((membership) => ({
      unit_id: membership.unitId as number,
      role: membership.role,
    }))

    const normalizedAllowedShiftTypeIds = Array.from(new Set(allowedShiftTypeIds))

    if (normalizedAllowedShiftTypeIds.length === 0) {
      setFormError('勤務可能シフトを1つ以上選択してください。')
      return
    }

    const payload: EmployeePayload = {
      name,
      email,
      role,
      employment_type: employmentType,
      can_night_shift: canNightShift,
      contract_hours_per_week: contractHours ? Number(contractHours) : null,
      allowed_shift_type_ids: normalizedAllowedShiftTypeIds,
      memberships: filteredMemberships,
      schedule_preferences: {
        fixed_days_off: fixedDaysOff,
        custom_dates_off: [],
      },
    }

    if (!isEdit) {
      if (!password) {
        setFormError('パスワードを入力してください。')
        return
      }
      payload.password = password
    } else if (password) {
      payload.password = password
    }

    try {
      if (isEdit && employeeId) {
        await updateEmployeeMutation.mutateAsync(payload)
        showMessage({ type: 'success', text: '従業員情報を更新しました。' })
      } else {
        await createEmployeeMutation.mutateAsync(payload)
        showMessage({ type: 'success', text: '従業員を追加しました。' })
      }
      navigate('/employees')
    } catch (error) {
      console.error(error)
      if (error instanceof AxiosError) {
        const message =
          (error.response?.data as { message?: string; errors?: Record<string, string[]> })?.message ??
          '保存に失敗しました。入力内容をご確認ください。'
        setFormError(message)
        showMessage({ type: 'error', text: message })
      } else {
        const fallback = '保存に失敗しました。時間を置いて再度お試しください。'
        setFormError(fallback)
        showMessage({ type: 'error', text: fallback })
      }
    }
  }

  const pageTitle = isEdit ? '従業員を編集' : '新規従業員を追加'

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-300">従業員管理</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{pageTitle}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isEdit ? '従業員情報を更新します。' : '従業員を新規追加し、所属ユニットを設定します。'}
          </p>
        </div>
        <Link
          to="/employees"
          className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/60"
        >
          一覧へ戻る
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {formError}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40 dark:shadow-slate-900/50">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">基本情報</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              氏名
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              メールアドレス
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              役割
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as EmployeePayload['role'])}
                className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              雇用区分
              <select
                value={employmentType}
                onChange={(event) => setEmploymentType(event.target.value as EmployeePayload['employment_type'])}
                className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
              >
                {employmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              週あたり契約時間
              <input
                type="number"
                min={0}
                max={168}
                value={contractHours}
                onChange={(event) => setContractHours(event.target.value)}
                placeholder="例: 40"
                className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              パスワード{isEdit ? '（変更する場合のみ入力）' : ''}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isEdit ? '新しいパスワードを入力' : 'ログイン用パスワードを入力'}
                className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                required={!isEdit}
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={canNightShift}
              onChange={(event) => setCanNightShift(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900/60 dark:text-indigo-400"
            />
            夜勤シフトに入れる
          </label>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40 dark:shadow-slate-900/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">勤務可能シフト</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">AI自動作成時に割り当て可能なシフト種別を選択してください。</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleAllShiftTypes(!isAllShiftTypesSelected)}
              disabled={selectableShiftTypeIds.length === 0}
              className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                selectableShiftTypeIds.length === 0
                  ? 'cursor-not-allowed border-slate-100 text-slate-300 dark:border-slate-700/40 dark:text-slate-500'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-800/60'
              }`}
            >
              {isAllShiftTypesSelected ? '全て解除' : '全て選択'}
            </button>
          </div>

          {selectableShiftTypes.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-700/60 dark:text-slate-500">
              選択可能なシフト種別が見つかりません。先にシフト種別を登録してください。
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {selectableShiftTypes.map((shiftType) => {
                const checked = allowedShiftTypeIds.includes(shiftType.id)
                return (
                  <label
                    key={shiftType.id}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                      checked
                        ? 'border-indigo-200 bg-indigo-50 shadow-sm dark:border-indigo-500/60 dark:bg-indigo-500/15 dark:shadow-slate-900/40'
                        : 'border-slate-200 bg-white hover:border-indigo-200 dark:border-slate-700/60 dark:bg-slate-900/40 dark:hover:border-indigo-500/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => handleToggleShiftType(shiftType.id, event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900/60 dark:text-indigo-400"
                    />
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{shiftType.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {shiftType.start_at} - {shiftType.end_at}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{shiftType.code}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}

          {allowedShiftTypeIds.length === 0 && selectableShiftTypeIds.length > 0 ? (
            <p className="mt-4 text-xs text-rose-600 dark:text-rose-300">
              選択された勤務可能シフトがありません。この従業員は自動割当の対象外になります。
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40 dark:shadow-slate-900/50">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">勤務カスタマイズ</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">固定で休みにしたい曜日や祝日を選択してください。</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {fixedDayOptions.map((option) => {
              const checked = fixedDaysOff[option.key]
              return (
                <label
                  key={option.key}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                    checked
                      ? 'border-indigo-200 bg-indigo-50 shadow-sm dark:border-indigo-500/60 dark:bg-indigo-500/15 dark:shadow-slate-900/40'
                      : 'border-slate-200 bg-white hover:border-indigo-200 dark:border-slate-700/60 dark:bg-slate-900/40 dark:hover:border-indigo-500/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setFixedDaysOff((prev) => ({
                        ...prev,
                        [option.key]: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900/60 dark:text-indigo-400"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">{option.label}</span>
                </label>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            土日祝日にチェックを入れると、自動シフト作成時にこれらの日は自動的に休みに設定されます。
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40 dark:shadow-slate-900/50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">所属ユニット</h2>
            <button
              type="button"
              onClick={handleAddMembership}
              className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/60"
            >
              + 所属を追加
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">所属ユニットは一覧やシフト調整の際に表示順で利用されます。</p>

          <div className="mt-4 space-y-4">
            {memberships.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-700/60 dark:text-slate-500">
                所属を追加してください。
              </p>
            ) : null}

            {memberships.map((membership, index) => {
              const usedUnitIds = memberships
                .filter((item) => item.id !== membership.id && item.unitId !== null)
                .map((item) => item.unitId)

              return (
                <div
                  key={membership.id}
                  className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40 dark:shadow-slate-900/50"
                >
                  <div className="grid gap-3 md:grid-cols-[2fr,1fr,auto] md:items-center">
                    <label className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
                      ユニット
                      <select
                        value={membership.unitId ?? ''}
                        onChange={(event) =>
                          handleMembershipChange(membership.id, {
                            unitId: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                        className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
                      >
                        <option value="">選択してください</option>
                        {units.map((unit) => (
                          <option key={unit.id} value={unit.id} disabled={usedUnitIds.includes(unit.id)}>
                            {unit.code} / {unit.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
                      役割
                      <select
                        value={membership.role}
                        onChange={(event) =>
                          handleMembershipChange(membership.id, {
                            role: event.target.value as 'leader' | 'member',
                          })
                        }
                        className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
                      >
                        <option value="leader">リーダー</option>
                        <option value="member">メンバー</option>
                      </select>
                    </label>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => handleRemoveMembership(membership.id)}
                        className="inline-flex items-center rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">#{index + 1}</p>
                </div>
              )
            })}
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link
            to="/employees"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/60"
          >
            キャンセル
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {isSubmitting ? '保存中…' : '保存する'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default EmployeeFormPage
