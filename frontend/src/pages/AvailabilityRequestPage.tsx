import type { FormEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import {
  useAvailabilityRemindersQuery,
  useAvailabilityRequestsQuery,
  useAvailabilityScheduleQuery,
  useCreateAvailabilityReminderMutation,
  useDeleteAvailabilityRequestMutation,
  useSendAvailabilityReminderMutation,
} from '../features/availability/hooks'
import { useCreateAvailabilityRequest, useShiftTypesQuery } from '../features/units/hooks'
import type { AvailabilityRequest } from '../api/types'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理者',
  leader: '編集者',
  member: '一般',
}

const SHIFT_LABELS: Record<'EARLY' | 'DAY' | 'LATE' | 'NIGHT', string> = {
  EARLY: '早番',
  DAY: '日勤',
  LATE: '遅番',
  NIGHT: '夜勤',
}

const REMINDER_STATUS_STYLES: Record<
  'pending' | 'sent' | 'skipped',
  { label: string; className: string }
> = {
  pending: {
    label: '待機中',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
  },
  sent: {
    label: '送信済み',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
  },
  skipped: {
    label: 'エラー',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
  },
}

const formatDateKey = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const AvailabilityRequestPage = () => {
  const params = useParams()
  const unitIdParam = Number(params.unitId)
  const unitId = Number.isFinite(unitIdParam) ? unitIdParam : Number.NaN
  const isValidUnitId = Number.isFinite(unitId)
  const navigate = useNavigate()
  const { user } = useAuth()

  const mutation = useCreateAvailabilityRequest(unitId)
  const [type, setType] = useState<'wish' | 'unavailable' | 'vacation'>('wish')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [applicantId, setApplicantId] = useState<number | null>(user?.id ?? null)
  const [activeDate, setActiveDate] = useState<string | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined)
  const [periodInputValue, setPeriodInputValue] = useState('')
  const [popoverAnchor, setPopoverAnchor] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverStyle, setPopoverStyle] = useState<{
    left: number
    top: number
    width: number
  } | null>(null)
  const [reminderDate, setReminderDate] = useState('')
  const [reminderMessage, setReminderMessage] = useState('')
  const [draftSelections, setDraftSelections] = useState<
    Record<
      string,
      {
        type: 'wish' | 'unavailable' | 'vacation'
        start_at: string | null
        end_at: string | null
        reason: string | null
      }
    >
  >({})
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false)

  const dayButtonRefs = useRef(new Map<string, HTMLButtonElement>())

  const isUnitLeader = useMemo(
    () => user?.memberships?.some((membership) => membership.unit_id === unitId && membership.role === 'leader') ?? false,
    [unitId, user?.memberships],
  )

  const canProxyForUnit = useMemo(() => {
    if (!user) {
      return false
    }
    if (user.role === 'admin') {
      return true
    }
    return isUnitLeader
  }, [isUnitLeader, user])

  const canViewUnit = useMemo(
    () => (user?.role === 'admin' ? true : isUnitLeader),
    [isUnitLeader, user?.role],
  )

  const [scope, setScope] = useState<'self' | 'unit'>(canViewUnit ? 'unit' : 'self')
  const [memberId, setMemberId] = useState<number | undefined>(undefined)

  const scheduleQuery = useAvailabilityScheduleQuery(unitId, selectedPeriod)
  const period = scheduleQuery.data?.data.period

  const requestParams = useMemo(
    () => ({
      period: selectedPeriod ?? period,
      scope,
      memberId,
    }),
    [memberId, period, scope, selectedPeriod],
  )

  const requestsQuery = useAvailabilityRequestsQuery(unitId, requestParams)
  const remindersQuery = useAvailabilityRemindersQuery(unitId, canViewUnit)
  const createReminderMutation = useCreateAvailabilityReminderMutation(unitId)
  const { data: shiftTypesData } = useShiftTypesQuery(true)

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
  const dateLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        timeZone: timezone,
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      }),
    [timezone],
  )
  const reminderDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
      }),
    [],
  )

  useEffect(() => {
    if (activeDate || !scheduleQuery.data?.data) {
      return
    }

    const schedule = scheduleQuery.data.data
    const startDate = new Date(`${schedule.period_start}T00:00:00`)
    const endDate = new Date(`${schedule.period_end}T00:00:00`)
    const now = new Date()
    const candidate = now >= startDate && now <= endDate ? now : startDate
    setActiveDate(formatDateKey(candidate))
  }, [activeDate, scheduleQuery.data?.data])

  useEffect(() => {
    if (!canViewUnit || !scheduleQuery.data?.data) {
      return
    }

    if (reminderDate) {
      return
    }

    const iso = scheduleQuery.data.data.reminder_at
    if (iso) {
      setReminderDate(iso.slice(0, 10))
    }
  }, [canViewUnit, reminderDate, scheduleQuery.data?.data])

  const calendarDays = useMemo(() => {
    const schedule = scheduleQuery.data?.data
    if (!schedule) {
      return [] as Array<{
        dateString: string
        label: number
        inMonth: boolean
        isToday: boolean
      }>
    }

    const parse = (value: string) => {
      const [year, month, day] = value.split('-').map(Number)
      return new Date(year, month - 1, day)
    }

    const periodStartDate = parse(schedule.period_start)
    const year = periodStartDate.getFullYear()
    const month = periodStartDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const firstWeekday = firstDay.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: Array<{ date: Date; inMonth: boolean }> = []

    for (let i = 0; i < firstWeekday; i += 1) {
      const date = new Date(year, month, i - firstWeekday + 1)
      cells.push({ date, inMonth: false })
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(year, month, day), inMonth: true })
    }

    const remainder = cells.length % 7
    if (remainder !== 0) {
      const needed = 7 - remainder
      for (let i = 1; i <= needed; i += 1) {
        const date = new Date(year, month + 1, i)
        cells.push({ date, inMonth: false })
      }
    }

    const todayString = formatDateKey(new Date())

    return cells.map(({ date, inMonth }) => ({
      dateString: formatDateKey(date),
      label: date.getDate(),
      inMonth,
      isToday: formatDateKey(date) === todayString,
    }))
  }, [scheduleQuery.data?.data])

  const requestsByDate = useMemo(() => {
    const map = new Map<string, AvailabilityRequest[]>()
    const entries = requestsQuery.data?.data ?? []
    entries.forEach((request) => {
      if (!map.has(request.work_date)) {
        map.set(request.work_date, [])
      }
      map.get(request.work_date)?.push(request)
    })
    return map
  }, [requestsQuery.data?.data])

  const shiftTimeMap = useMemo(() => {
    const map: Record<string, { start: string; end: string }> = {}
    ;(shiftTypesData?.data ?? []).forEach((shift) => {
      const code = (shift.code ?? '').toUpperCase()
      if (!code) return
      map[code] = {
        start: shift.start_at ?? '',
        end: shift.end_at ?? '',
      }
    })
    return map
  }, [shiftTypesData?.data])

  const fallbackShiftTimes: Record<'EARLY' | 'DAY' | 'LATE' | 'NIGHT', { start: string; end: string }> = {
    EARLY: { start: '07:00', end: '16:00' },
    DAY: { start: '09:00', end: '18:00' },
    LATE: { start: '12:00', end: '21:00' },
    NIGHT: { start: '21:00', end: '09:00' },
  }

  const getShiftTimes = (code: 'EARLY' | 'DAY' | 'LATE' | 'NIGHT') => {
    const candidate = shiftTimeMap[code]
    if (candidate?.start && candidate?.end) {
      return candidate
    }
    return fallbackShiftTimes[code]
  }

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

  const applicantOptions = useMemo(() => {
    if (!canProxyForUnit) {
      return [] as Array<{ id: number; name: string; role: string | null }>
    }

    const options = [...targetMembers]

    if (user && !options.some((member) => member.id === user.id)) {
      options.push({ id: user.id, name: user.name, role: user.role ?? null })
    }

    return options.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }, [canProxyForUnit, targetMembers, user])

  useEffect(() => {
    if (!canProxyForUnit) {
      setApplicantId(user?.id ?? null)
      return
    }

    if (applicantId && applicantOptions.some((member) => member.id === applicantId)) {
      return
    }

    if (applicantOptions.length > 0) {
      setApplicantId(applicantOptions[0].id)
    } else if (user?.id) {
      setApplicantId(user.id)
    } else {
      setApplicantId(null)
    }
  }, [applicantId, applicantOptions, canProxyForUnit, user?.id])

  const currentApplicantName = useMemo(() => {
    if (!canProxyForUnit) {
      return user?.name ?? '自分'
    }

    if (!applicantId) {
      return user?.name ?? '自分'
    }

    return (
      applicantOptions.find((option) => option.id === applicantId)?.name ?? user?.name ?? '自分'
    )
  }, [applicantId, applicantOptions, canProxyForUnit, user?.name])

  const selectedRequest = useMemo(() => {
    if (!activeDate) return null
    const targetUserId = applicantId ?? user?.id
    if (!targetUserId) return null
    const requests = requestsByDate.get(activeDate) ?? []
    const apiRequest = requests.find((req) => req.user_id === targetUserId)
    if (apiRequest) {
      return apiRequest
    }

    const draft = draftSelections[activeDate]
    if (!draft) {
      return null
    }

    return {
      id: 0,
      unit_id: unitId,
      user_id: targetUserId,
      work_date: activeDate,
      type: draft.type,
      start_at: draft.start_at,
      end_at: draft.end_at,
      status: 'draft',
      reason: draft.reason,
      created_at: null,
      user: {
        id: targetUserId,
        name: currentApplicantName,
        role: user?.role ?? null,
        email: user?.email ?? null,
      },
    } satisfies AvailabilityRequest
  }, [activeDate, applicantId, currentApplicantName, draftSelections, requestsByDate, unitId, user?.email, user?.id, user?.role])

  const draftForActiveDate = activeDate ? draftSelections[activeDate] ?? null : null
  const pendingDraftCount = useMemo(() => Object.keys(draftSelections).length, [draftSelections])
  const draftSummaryText = useMemo(() => {
    if (!draftForActiveDate) {
      return null
    }

    const baseLabel =
      draftForActiveDate.type === 'vacation'
        ? '休み希望'
        : draftForActiveDate.type === 'unavailable'
          ? '勤務不可'
          : draftForActiveDate.reason?.trim() || '希望勤務'

    const timeLabel =
      draftForActiveDate.start_at || draftForActiveDate.end_at
        ? `${draftForActiveDate.start_at ?? '--:--'}〜${draftForActiveDate.end_at ?? '--:--'}`
        : null

    if (timeLabel) {
      return `${baseLabel}（${timeLabel}）`
    }

    return baseLabel
  }, [draftForActiveDate])

  const reminderTasksForPeriod = useMemo(() => {
    const reminderTasks = remindersQuery.data?.data ?? []
    const periodKey = scheduleQuery.data?.data?.period
    if (!periodKey) {
      return [] as typeof reminderTasks
    }
    return reminderTasks
      .filter((task) => task.period === periodKey)
      .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
  }, [remindersQuery.data?.data, scheduleQuery.data?.data?.period])

  useEffect(() => {
    if (reminderMessage || !reminderTasksForPeriod.length) {
      return
    }

    const latest = [...reminderTasksForPeriod].reverse().find((task) => task.message)
    if (latest?.message) {
      setReminderMessage(latest.message)
    }
  }, [reminderMessage, reminderTasksForPeriod])

  useEffect(() => {
    const remotePeriod = scheduleQuery.data?.data.period
    if (!remotePeriod) {
      return
    }

    setPeriodInputValue(remotePeriod)
    if (!selectedPeriod) {
      setSelectedPeriod(remotePeriod)
    }
  }, [scheduleQuery.data?.data.period, selectedPeriod])

  useEffect(() => {
    setSelectedPeriod(undefined)
    setPeriodInputValue('')
    setActiveDate(null)
    setDraftSelections({})
  }, [unitId])

  const closePopover = () => {
    setPopoverAnchor(null)
  }

  const openPopoverForDate = (dateString: string) => {
    if (!isValidUnitId) {
      setError('ユニットが見つかりませんでした。')
      return
    }

    const button = dayButtonRefs.current.get(dateString)
    const rect = button?.getBoundingClientRect()
    const anchor = rect
      ? {
          left: rect.left + window.scrollX,
          top: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        }
      : {
          left: window.scrollX + window.innerWidth / 2 - 160,
          top: window.scrollY + window.innerHeight / 2 - 120,
          width: 0,
          height: 0,
        }

    setSuccess(null)
    setError(null)
    setActiveDate(dateString)
    setPopoverAnchor(anchor)

    const targetUserId = applicantId ?? user?.id
    const draft = draftSelections[dateString]
    if (draft) {
      setType(draft.type)
      setStartAt(draft.start_at ?? '')
      setEndAt(draft.end_at ?? '')
      setReason(draft.reason ?? '')
      return
    }

    const existing = targetUserId
      ? (requestsByDate.get(dateString) ?? []).find((req) => req.user_id === targetUserId)
      : null

    if (existing) {
      setType(existing.type as 'wish' | 'unavailable' | 'vacation')
      setStartAt(existing.start_at ?? '')
      setEndAt(existing.end_at ?? '')
      setReason(existing.reason ?? '')
    } else {
      setType('wish')
      setStartAt('')
      setEndAt('')
      setReason('')
    }
  }

  useEffect(() => {
    if (!popoverAnchor) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePopover()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [popoverAnchor])

  useEffect(() => {
    if (!popoverAnchor || !activeDate) {
      return
    }

    const updatePosition = () => {
      const button = dayButtonRefs.current.get(activeDate)
      if (!button) {
        return
      }
      const rect = button.getBoundingClientRect()
      const nextAnchor = {
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      }

      setPopoverAnchor((prev) => {
        if (
          prev &&
          prev.left === nextAnchor.left &&
          prev.top === nextAnchor.top &&
          prev.width === nextAnchor.width &&
          prev.height === nextAnchor.height
        ) {
          return prev
        }
        return nextAnchor
      })
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [popoverAnchor, activeDate])

  const isSubmitting = mutation.isPending || deleteMutation.isPending || isBatchSubmitting

  const submitRequest = async ({
    date,
    draft,
    submitUserId,
  }: {
    date: string
    draft: {
      type: 'wish' | 'unavailable' | 'vacation'
      start_at: string | null
      end_at: string | null
      reason: string | null
    }
    submitUserId: number
  }) => {
    if (!isValidUnitId) {
      throw new Error('ユニットが見つかりませんでした。')
    }

    const payloadType = draft.type ?? 'wish'
    const payloadStart = draft.start_at ?? null
    const payloadEnd = draft.end_at ?? null
    const payloadReason = draft.reason ?? null

    if (payloadType !== 'vacation' && payloadStart && payloadEnd && payloadStart >= payloadEnd) {
      throw new Error('終了時刻は開始時刻より後に設定してください。')
    }

    const existing = (requestsByDate.get(date) ?? []).find((req) => req.user_id === submitUserId)

    if (existing && typeof existing.id === 'number' && existing.id > 0) {
      await deleteMutation.mutateAsync(existing.id)
    }

    await mutation.mutateAsync({
      work_date: date,
      type: payloadType,
      start_at: payloadStart,
      end_at: payloadEnd,
      reason: payloadReason,
      user_id: submitUserId,
    })

    setDraftSelections((prev) => {
      const next = { ...prev }
      delete next[date]
      return next
    })
  }

  const handleDeleteSelected = async () => {
    if (!selectedRequest) {
      return
    }

    try {
      if (typeof selectedRequest.id === 'number' && selectedRequest.id > 0) {
        await deleteMutation.mutateAsync(selectedRequest.id)
        setSuccess('申請を削除しました。')
      }

      if (activeDate) {
        setDraftSelections((prev) => {
          const next = { ...prev }
          delete next[activeDate]
          return next
        })
      }

      closePopover()
    } catch (err) {
      console.error(err)
      setError('申請の削除に失敗しました。')
    }
  }

  const handleResetSelection = () => {
    setActiveDate(null)
    setType('wish')
    setStartAt('')
    setEndAt('')
    setReason('')
    setDraftSelections({})
    closePopover()
  }

  const handleJumpToPeriodStart = () => {
    const start = scheduleQuery.data?.data.period_start
    if (!start) {
      return
    }
    setActiveDate(start)
    closePopover()
    const button = dayButtonRefs.current.get(start)
    button?.focus()
  }

  const handlePeriodChange = (value: string) => {
    setPeriodInputValue(value)
    setSelectedPeriod(value || undefined)
    setActiveDate(null)
    setDraftSelections({})
    setSuccess(null)
    setError(null)
  }

  const updateDraftSelection = (
    changes: Partial<{
      type: 'wish' | 'unavailable' | 'vacation'
      start_at: string | null
      end_at: string | null
      reason: string | null
    }>,
  ) => {
    if (!activeDate) {
      return
    }

    setDraftSelections((prev) => {
      const existing = prev[activeDate] ?? {
        type,
        start_at: startAt || null,
        end_at: endAt || null,
        reason: reason || null,
      }

      return {
        ...prev,
        [activeDate]: {
          ...existing,
          ...changes,
        },
      }
    })
  }

  const applyPreset = (code: 'EARLY' | 'DAY' | 'LATE' | 'NIGHT') => {
    if (!activeDate) return
    const times = getShiftTimes(code)
    const label = SHIFT_LABELS[code]
    setType('wish')
    setStartAt(times.start)
    setEndAt(times.end)
    setReason(`${label}希望`)
    updateDraftSelection({
      type: 'wish',
      start_at: times.start,
      end_at: times.end,
      reason: `${label}希望`,
    })
  }

  const applyOff = () => {
    if (!activeDate) return
    setType('vacation')
    setStartAt('')
    setEndAt('')
    setReason('休み希望')
    updateDraftSelection({
      type: 'vacation',
      start_at: null,
      end_at: null,
      reason: '休み希望',
    })
  }

  const applyCustomTime = () => {
    setType('wish')
    updateDraftSelection({
      type: 'wish',
      start_at: startAt ? startAt : null,
      end_at: endAt ? endAt : null,
      reason: reason || null,
    })
  }

  const handleConfirmSubmission = () => {
    const entries = Object.entries(draftSelections)
      .map(([date, draft]) => ({ date, draft }))
      .filter(({ draft }) => draft != null)

    if (entries.length === 0) {
      setError('申請内容が設定されていません。')
      return
    }

    const submitUserId = canProxyForUnit ? applicantId ?? user?.id ?? null : user?.id ?? null

    if (!submitUserId) {
      setError('申請者を選択してください。')
      return
    }

    const message =
      entries.length === 1
        ? 'この内容でシフト希望を申請してよろしいですか？'
        : `${entries.length}件の希望を申請します。よろしいですか？`

    if (!window.confirm(message)) {
      return
    }

    const submitAll = async () => {
      try {
        setIsBatchSubmitting(true)
        setError(null)

        for (const { date, draft } of entries) {
          await submitRequest({
            date,
            draft: {
              type: draft.type,
              start_at: draft.start_at,
              end_at: draft.end_at,
              reason: draft.reason,
            },
            submitUserId,
          })
        }

        setSuccess(`${entries.length}件の申請を登録しました。`)
        setActiveDate(null)
        setType('wish')
        setStartAt('')
        setEndAt('')
        setReason('')
        closePopover()
      } catch (err) {
        console.error(err)
        setError('申請の登録に失敗しました。入力内容を確認してください。')
      } finally {
        setIsBatchSubmitting(false)
      }
    }

    void submitAll()
  }

  const handleCreateReminderTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canViewUnit) {
      return
    }

    const schedule = scheduleQuery.data?.data
    if (!schedule) {
      setError('対象期間の情報を取得できませんでした。')
      return
    }

    if (!reminderDate) {
      setError('リマインド日を選択してください。')
      return
    }

    try {
      setError(null)
      await createReminderMutation.mutateAsync({
        period: schedule.period,
        scheduled_for: reminderDate,
        message: reminderMessage || undefined,
      })
      const label = reminderDateFormatter.format(new Date(`${reminderDate}T00:00:00`))
      setSuccess(`${label} に自動リマインドを登録しました。`)
      setReminderMessage('')
    } catch (err) {
      console.error(err)
      setError('自動リマインドの登録に失敗しました。')
    }
  }

  const calculatePopoverPosition = useCallback(
    (height?: number | null) => {
      if (!popoverAnchor || typeof window === 'undefined') {
        return null
      }

      const margin = 16
      const width = Math.min(360, window.innerWidth - margin * 2)
      let left = popoverAnchor.left + popoverAnchor.width / 2 - width / 2
      left = Math.max(window.scrollX + margin, Math.min(left, window.scrollX + window.innerWidth - width - margin))

      const fallbackHeight = height && Number.isFinite(height) ? height : 400
      const safeHeight = Math.min(fallbackHeight, window.innerHeight - margin * 2)

      let top = popoverAnchor.top + popoverAnchor.height + 12
      const maxTop = window.scrollY + window.innerHeight - margin - safeHeight
      if (top > maxTop) {
        top = Math.max(window.scrollY + margin, popoverAnchor.top - 12 - safeHeight)
      }

      return { left, top, width }
    },
    [popoverAnchor],
  )

  useEffect(() => {
    if (!popoverAnchor) {
      setPopoverStyle(null)
      return
    }
    const next = calculatePopoverPosition(null)
    if (next) {
      setPopoverStyle(next)
    }
  }, [calculatePopoverPosition, popoverAnchor])

  useLayoutEffect(() => {
    if (!popoverAnchor) {
      return
    }
    const node = popoverRef.current
    if (!node) {
      return
    }
    const rect = node.getBoundingClientRect()
    setPopoverStyle((prev) => {
      const next = calculatePopoverPosition(rect.height)
      if (!next) {
        return prev
      }
      if (
        prev &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5
      ) {
        return prev
      }
      return next
    })
  }, [calculatePopoverPosition, popoverAnchor, draftForActiveDate, endAt, reason, selectedRequest, startAt, type])

  const activeDateLabel = useMemo(() => {
    if (!activeDate) return null
    return dateLabelFormatter.format(new Date(`${activeDate}T00:00:00`))
  }, [activeDate, dateLabelFormatter])

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
      setError(null)
      await reminderMutation.mutateAsync()
      setSuccess('手動リマインドを送信しました。')
    } catch (err) {
      console.error(err)
      setError('リマインドの送信に失敗しました。')
    }
  }

  if (scheduleQuery.isLoading && !scheduleQuery.data) {
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

  if (!isValidUnitId) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
        ユニットが見つかりませんでした。
      </div>
    )
  }

  return (
    <>
      <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">希望・休暇申請</h1>
        <p className="text-sm text-slate-500">
          希望勤務や勤務不可、休暇の申請を登録すると、締切前のリマインドとAI編成時に反映されます。
        </p>
      </header>

      {canViewUnit ? (
        <section className="rounded-3xl border border-white/20 bg-white/70 p-6 shadow-lg backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/45">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">自動リマインド</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                未申請メンバーへの自動リマインド送信日とメッセージを登録できます。Slack Webhook を設定すると自動送信時にメッセージが通知されます。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSendReminder}
                disabled={reminderMutation.isPending}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-500/50 dark:bg-indigo-500/20 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
              >
                {reminderMutation.isPending ? '送信中…' : '今すぐリマインドを送信'}
              </button>
              {remindersQuery.isLoading ? (
                <span className="text-xs text-slate-400">読み込み中…</span>
              ) : null}
            </div>
          </div>

          <form
            onSubmit={handleCreateReminderTask}
            className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white/80 p-4 text-sm shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70"
          >
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                リマインド日
                <input
                  type="date"
                  value={reminderDate}
                  onChange={(event) => setReminderDate(event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={createReminderMutation.isPending || !scheduleQuery.data?.data}
                className="rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {createReminderMutation.isPending ? '登録中…' : '自動送信を予約'}
              </button>
            </div>
            <label className="flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-300">
              リマインドメッセージ（Slack 通知に利用されます）
              <textarea
                value={reminderMessage}
                onChange={(event) => setReminderMessage(event.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
                placeholder="例: 〇〇月の希望申請が未提出の方は本日中にご対応ください"
              />
            </label>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              ※ サーバーのスケジューラー設定（cron）が有効になっている必要があります。
            </p>
          </form>

          <div className="mt-4 space-y-2">
            {remindersQuery.isError ? (
              <p className="text-xs text-rose-500">リマインド設定の取得に失敗しました。</p>
            ) : reminderTasksForPeriod.length ? (
              reminderTasksForPeriod.map((task) => {
                const statusStyle = REMINDER_STATUS_STYLES[task.status]
                const scheduledLabel = reminderDateFormatter.format(new Date(`${task.scheduled_for}T00:00:00`))
                return (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/60 bg-white/80 p-4 text-sm shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70"
                  >
                    <div>
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{scheduledLabel}</p>
                      <div className="mt-1 space-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                        <p>
                          期間: {task.period}
                          {task.triggered_at
                            ? ` ｜ 実行: ${reminderDateFormatter.format(new Date(task.triggered_at))}`
                            : ''}
                        </p>
                        {task.message ? <p className="whitespace-pre-line">{task.message}</p> : null}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusStyle.className}`}
                    >
                      {statusStyle.label}
                    </span>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                現在登録されている自動リマインドはありません。上記フォームから追加できます。
              </p>
            )}
          </div>
        </section>
      ) : null}

      <section className="space-y-6">
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
                        user?.role === 'admin' ||
                        request.user_id === user?.id ||
                        (user?.role === 'leader' && isUnitMember)
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

        <div className="space-y-4 rounded-3xl border border-white/20 bg-white/60 p-6 shadow-lg backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/55">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-slate-900">カレンダーから申請</h2>
            <p className="text-xs text-slate-500">
              希望する日付をクリックして申請内容を設定してください。シフト種別と希望時間をまとめて登録できます。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            {canProxyForUnit ? (
              <label className="flex-1 text-sm text-slate-600">
                申請者
                <select
                  value={applicantId ?? ''}
                  onChange={(event) =>
                    setApplicantId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="mt-1 w-full glass-input focus:border-indigo-400 focus:outline-none"
                  required
                >
                  <option value="">選択してください</option>
                  {applicantOptions.map((member) => {
                    const roleLabel = member.role ? ROLE_LABELS[member.role] ?? member.role : null

                    return (
                      <option key={member.id} value={member.id}>
                        {member.name}
                        {roleLabel ? `（${roleLabel}）` : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
            ) : null}
            <label className="flex items-center gap-2 rounded-full border border-white/40 bg-white/60 px-3 py-1 text-xs text-slate-600 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200 sm:self-end">
              <span>申請対象月</span>
              <input
                type="month"
                value={periodInputValue}
                onChange={(event) => handlePeriodChange(event.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/40"
              />
            </label>
          </div>
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          <div className="grid gap-2">
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
              {['日', '月', '火', '水', '木', '金', '土'].map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day) => {
                const activeUserId = applicantId ?? user?.id ?? null
                const preview = draftSelections[day.dateString]
                let requestsForDay = [...(requestsByDate.get(day.dateString) ?? [])]

                if (preview && activeUserId !== null) {
                  requestsForDay = requestsForDay.filter((entry) => entry.user_id !== activeUserId)
                  requestsForDay.push({
                    id: -1,
                    unit_id: unitId,
                    user_id: activeUserId,
                    work_date: day.dateString,
                    type: preview.type,
                    start_at: preview.start_at,
                    end_at: preview.end_at,
                    status: 'draft',
                    reason: preview.reason,
                    created_at: null,
                    user: {
                      id: applicantId ?? user?.id ?? 0,
                      name: currentApplicantName,
                      role: user?.role ?? null,
                      email: user?.email ?? null,
                    },
                  } as AvailabilityRequest)
                } else if (activeUserId !== null) {
                  // 自分の既存申請もカレンダーに表示して視覚的なフィードバックを得られるようにする
                  requestsForDay = requestsForDay.filter((entry, index, array) => {
                    if (entry.user_id !== activeUserId) {
                      return true
                    }

                    const firstIndex = array.findIndex((candidate) => candidate.user_id === activeUserId)
                    return firstIndex === index
                  })
                }

                const hasDraft = Boolean(preview && activeUserId !== null)
                const isActive = activeDate === day.dateString
                const baseClasses = day.inMonth
                  ? 'bg-white/70 text-slate-700 hover:border-indigo-300 dark:bg-slate-900/50 dark:text-slate-200'
                  : 'bg-slate-100/60 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600'
                const activeClasses = isActive
                  ? 'border-2 border-indigo-400 shadow-indigo-200/50 dark:border-indigo-400/80'
                  : 'border border-transparent'
                const todayRing = day.isToday ? 'ring-1 ring-indigo-200 dark:ring-indigo-500/40' : ''
                const draftGlow = hasDraft
                  ? 'ring-2 ring-indigo-300/60 border-indigo-300 dark:ring-indigo-500/50 dark:border-indigo-400/60'
                  : ''

                return (
                  <button
                    key={day.dateString}
                    type="button"
                    ref={(element) => {
                      if (element) {
                        dayButtonRefs.current.set(day.dateString, element)
                      } else {
                        dayButtonRefs.current.delete(day.dateString)
                      }
                    }}
                    onClick={() => openPopoverForDate(day.dateString)}
                    className={`flex min-h-[88px] flex-col items-start gap-1 rounded-2xl p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${baseClasses} ${activeClasses} ${todayRing} ${draftGlow}`}
                    disabled={!day.inMonth}
                  >
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                      isActive
                        ? 'bg-indigo-500 text-white'
                        : day.inMonth
                          ? 'text-slate-700 dark:text-slate-200'
                          : 'text-slate-400'
                    }`}>
                      {day.label}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {requestsForDay.map((item) => {
                        const isDraft = item.status === 'draft'
                        const tone = isDraft
                          ? 'bg-indigo-500 text-white dark:bg-indigo-500/80 dark:text-white'
                          : item.type === 'vacation'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-200'
                              : item.type === 'unavailable'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/30 dark:text-rose-200'
                                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/30 dark:text-indigo-200'
                        const label = (() => {
                          if (item.type === 'vacation') {
                            return '休み'
                          }
                          if (item.type === 'unavailable') {
                            return '不可'
                          }
                          if (item.reason) {
                            return item.reason.length > 12
                              ? `${item.reason.slice(0, 11)}…`
                              : item.reason
                          }
                          if (item.start_at || item.end_at) {
                            return `${item.start_at ?? '--:--'}〜${item.end_at ?? '--:--'}`
                          }
                          return '希望'
                        })()
                        const key =
                          item.id > 0
                            ? `${item.id}-${item.user_id ?? ''}`
                            : `draft-${item.user_id}-${item.work_date}`
                        return (
                          <span
                            key={key}
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
                          >
                            {label}
                            {isDraft ? '（下書き）' : ''}
                          </span>
                        )
                      })}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {activeDateLabel ?? '日付を選択してください'}
              </p>
              <p className="text-xs text-slate-500">
                カレンダーの日付をクリックするとポップアップで申請内容を選択できます。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetSelection}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                選択を解除
              </button>
              <button
                type="button"
                onClick={handleJumpToPeriodStart}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                月初に戻る
              </button>
            </div>
          </div>

          {activeDate ? (
            requestsByDate.get(activeDate)?.length ? (
              <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/60 p-4 text-xs text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200">
                <p className="font-semibold">同日の既存申請</p>
                <ul className="mt-2 space-y-1">
                  {requestsByDate.get(activeDate)?.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3">
                      <span>
                        {item.type === 'wish' ? '希望勤務' : item.type === 'vacation' ? '休暇' : '勤務不可'}
                        {item.start_at || item.end_at
                          ? `（${item.start_at ?? '--:--'}〜${item.end_at ?? '--:--'}）`
                          : ''}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {item.user?.name ?? '自分'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                同日の申請状況は未登録です。ポップアップから申請を追加してください。
              </p>
            )
          ) : (
            <p className="text-xs text-slate-500">日付を選択すると既存申請が表示されます。</p>
          )}

          {draftForActiveDate ? (
            <div className="mt-3 rounded-2xl border border-indigo-200/60 bg-indigo-50/60 p-4 text-xs text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200">
              <p className="font-semibold">未送信の申請案</p>
              {draftSummaryText ? <p className="mt-1 text-sm font-semibold">{draftSummaryText}</p> : null}
              <p className="text-[11px] text-indigo-500/80 dark:text-indigo-200/80">
                カレンダー下の送信ボタンから申請できます。
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <p>
              希望内容を設定したあと、「この内容で申請する」を押してください。
              {pendingDraftCount > 0 ? `（未送信 ${pendingDraftCount} 件）` : ''}
            </p>
            <button
              type="button"
              onClick={handleConfirmSubmission}
              disabled={isSubmitting || pendingDraftCount === 0}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {isSubmitting ? '送信中…' : 'この内容で申請する'}
            </button>
          </div>

          <p className="text-xs text-slate-400">
            ※ ポップアップでは「早番／日勤／遅番／夜勤／休み」やカスタム時間を選択できます。
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              一覧に戻る
            </button>
          </div>
        </div>
      </section>
    </div>

    {popoverStyle
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px]"
                onClick={closePopover}
              />
              <div
                ref={popoverRef}
                className="absolute z-50 max-h-[min(80vh,520px)] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-white/30 bg-white/95 p-4 shadow-2xl backdrop-blur-lg dark:border-slate-700/60 dark:bg-slate-900/95"
                style={{
                  left: popoverStyle.left,
                  top: popoverStyle.top,
                  width: popoverStyle.width,
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      選択日
                    </p>
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {activeDateLabel ?? '未選択'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closePopover}
                    className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500"
                  >
                    ×
                  </button>
                </div>

                {selectedRequest ? (
                  <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
                    <p className="font-semibold">既存申請</p>
                    <p className="mt-1 text-sm font-semibold">
                      {selectedRequest.type === 'wish'
                        ? '希望勤務'
                        : selectedRequest.type === 'vacation'
                          ? '休暇'
                          : '勤務不可'}
                    </p>
                    <p className="text-xs">
                      {selectedRequest.start_at || selectedRequest.end_at
                        ? `${selectedRequest.start_at ?? '--:--'}〜${selectedRequest.end_at ?? '--:--'}`
                        : '終日'}
                    </p>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      disabled={isSubmitting}
                      className="mt-2 inline-flex items-center gap-2 rounded-full border border-rose-200 px-3 py-1 font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-200 dark:hover:bg-rose-500/20"
                    >
                      この申請を削除
                    </button>
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  {(['EARLY', 'DAY', 'LATE', 'NIGHT'] as const).map((code) => {
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => applyPreset(code)}
                        disabled={isSubmitting}
                        className="flex w-full items-center justify-center rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2 font-semibold text-slate-700 backdrop-blur transition hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-500/20"
                      >
                        <span>{SHIFT_LABELS[code]}</span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={applyOff}
                    disabled={isSubmitting}
                    className="col-span-2 flex w-full items-center justify-center rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-3 py-2 text-sm font-semibold text-emerald-600 backdrop-blur transition hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/30"
                  >
                    <span>休み</span>
                  </button>
                </div>

                <div className="mt-4 space-y-3 border-t border-slate-200/70 pt-4 text-sm dark:border-slate-700">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      カスタム時間
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      任意の時間帯で申請する場合に使用してください。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={startAt}
                      onChange={(event) => {
                        const value = event.target.value
                        setStartAt(value)
                        updateDraftSelection({ start_at: value ? value : null })
                      }}
                      className="w-full rounded-md border border-slate-200/70 bg-white/90 px-2 py-1 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
                    />
                    <span className="text-xs text-slate-400">〜</span>
                    <input
                      type="time"
                      value={endAt}
                      onChange={(event) => {
                        const value = event.target.value
                        setEndAt(value)
                        updateDraftSelection({ end_at: value ? value : null })
                      }}
                      className="w-full rounded-md border border-slate-200/70 bg-white/90 px-2 py-1 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
                    />
                  </div>
                  <label className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>メモ（任意）</span>
                    <textarea
                      value={reason}
                      onChange={(event) => {
                        const value = event.target.value
                        setReason(value)
                        updateDraftSelection({ reason: value ? value : null })
                      }}
                      rows={2}
                      className="w-full rounded-md border border-slate-200/70 bg-white/90 px-2 py-1 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
                      placeholder="通院のため 14:00 まで勤務希望 など"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={applyCustomTime}
                    className="w-full rounded-md border border-indigo-200/70 bg-indigo-50/80 px-3 py-2 text-sm font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200 dark:hover:border-indigo-400 dark:hover:bg-indigo-500/30"
                  >
                    カスタム時間を適用
                  </button>
                </div>

                {error ? <p className="mt-3 text-xs text-rose-500">{error}</p> : null}

                <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
                  設定した内容はカレンダー下部の送信ボタンから申請できます。
                </p>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export default AvailabilityRequestPage
