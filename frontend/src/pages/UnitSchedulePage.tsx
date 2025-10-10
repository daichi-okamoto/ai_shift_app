import type { ChangeEvent, MouseEvent as ReactMouseEvent, SVGProps } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import holidayJp from '@holiday-jp/holiday_jp'
import type { Holiday } from '@holiday-jp/holiday_jp/lib/types'
import { api } from '../api/client'
import type { Assignment, Shift, ShiftType, UnitMember } from '../api/types'
import LoadingScreen from '../components/LoadingScreen'
import { sortMembersByDisplayOrder } from '../utils/memberSort'
import {
  useBatchUpdateShifts,
  useDeleteShiftsRange,
  useShiftTypesQuery,
  useUnitShiftsQuery,
  useUnitsQuery,
} from '../features/units/hooks'

const dayLabels = ['日', '月', '火', '水', '木', '金', '土']
const shiftLabelMap: Record<string, string> = {
  EARLY: '早番',
  DAY: '日勤',
  LATE: '遅番',
  NIGHT: '夜勤',
  NIGHT_AFTER: '夜勤明け',
  OFF: '休み',
  CUSTOM: 'カスタム',
  UNASSIGNED: '未割当',
}

const SHIFT_SUMMARY_ORDER = ['EARLY', 'DAY', 'LATE', 'NIGHT', 'OFF', 'CUSTOM', 'UNASSIGNED'] as const
const WORK_SHIFT_CODES = ['EARLY', 'DAY', 'LATE', 'NIGHT'] as const
type WorkShiftCode = (typeof WORK_SHIFT_CODES)[number]
const SHORT_SHIFT_LABELS: Record<WorkShiftCode, string> = {
  EARLY: '早',
  DAY: '日',
  LATE: '遅',
  NIGHT: '夜',
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: '正社員',
  part_time: 'パート',
  contract: '契約',
}

const normalizeTime = (time?: string | null) => {
  if (!time) return ''
  const [hoursRaw, minutesRaw = '00'] = time.split(':')
  const hoursNumber = Number.parseInt(hoursRaw ?? '0', 10)
  const hours = Number.isNaN(hoursNumber) ? hoursRaw : String(hoursNumber)
  const minutes = minutesRaw.padStart(2, '0')
  return `${hours}:${minutes}`
}

const formatTimeRange = (start?: string | null, end?: string | null) => {
  const normalizedStart = normalizeTime(start)
  const normalizedEnd = normalizeTime(end)
  if (start && end) return `${normalizedStart} - ${normalizedEnd}`
  if (start) return `${normalizedStart} -`
  if (end) return `- ${normalizedEnd}`
  return ''
}

const formatShiftTimes = (code?: string | null, start?: string | null, end?: string | null) => {
  const normalized = code?.toUpperCase()
  if (normalized === 'NIGHT') {
    return start ? `${normalizeTime(start)} -` : ''
  }
  if (normalized === 'NIGHT_AFTER') {
    return '- 9:30'
  }
  return formatTimeRange(start, end)
}

const timeToMinutes = (value?: string | null): number | null => {
  if (!value) return null
  const [hoursRaw, minutesRaw = '0'] = value.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null
  }
  return hours * 60 + minutes
}

const inferWorkShiftFromTimes = (start?: string | null, end?: string | null): WorkShiftCode | null => {
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)

  if (startMinutes === null || endMinutes === null) {
    return null
  }

  if (endMinutes <= startMinutes) {
    return 'NIGHT'
  }

  if (startMinutes <= 7 * 60 + 30) {
    return 'EARLY'
  }

  if (startMinutes >= 21 * 60 || endMinutes >= 22 * 60) {
    return 'NIGHT'
  }

  if (startMinutes >= 13 * 60 || endMinutes >= 20 * 60) {
    return 'LATE'
  }

  return 'DAY'
}

type DayType = 'weekday' | 'saturday' | 'sunday' | 'holiday'

const DAY_STYLES: Record<DayType, { headerBg: string; headerText: string; columnBg: string; buttonRing: string }> = {
  weekday: {
    headerBg: 'bg-slate-50/70 backdrop-blur dark:bg-slate-900/80',
    headerText: 'text-slate-500 dark:text-slate-200',
    columnBg: 'bg-white/40 backdrop-blur dark:bg-slate-900/45',
    buttonRing: 'ring-0 ring-transparent dark:ring-1 dark:ring-slate-700/60 dark:ring-offset-1 dark:ring-offset-slate-900',
  },
  saturday: {
    headerBg: 'bg-sky-100/70 backdrop-blur dark:bg-sky-500/50',
    headerText: 'text-sky-700 dark:text-sky-200',
    columnBg: 'bg-sky-50/60 backdrop-blur dark:bg-sky-500/15',
    buttonRing: 'ring-1 ring-sky-200 ring-offset-1 ring-offset-white dark:ring-sky-500/50 dark:ring-offset-slate-900',
  },
  sunday: {
    headerBg: 'bg-violet-100/70 backdrop-blur dark:bg-violet-500/45',
    headerText: 'text-violet-700 dark:text-violet-200',
    columnBg: 'bg-violet-50/60 backdrop-blur dark:bg-violet-500/15',
    buttonRing: 'ring-1 ring-violet-200 ring-offset-1 ring-offset-white dark:ring-violet-500/50 dark:ring-offset-slate-900',
  },
  holiday: {
    headerBg: 'bg-amber-100/70 backdrop-blur dark:bg-amber-500/50',
    headerText: 'text-amber-700 dark:text-amber-200',
    columnBg: 'bg-amber-50/60 backdrop-blur dark:bg-amber-500/15',
    buttonRing: 'ring-1 ring-amber-200 ring-offset-1 ring-offset-white dark:ring-amber-500/50 dark:ring-offset-slate-900',
  },
}

type ShiftStyleKey =
  | 'unassigned'
  | 'early'
  | 'day'
  | 'late'
  | 'night'
  | 'night_after'
  | 'off'
  | 'custom'

const SHIFT_STYLES: Record<ShiftStyleKey, { bg: string; hover: string; labelText: string; subText: string }> = {
  unassigned: {
    bg: 'bg-slate-50 dark:bg-slate-800/60',
    hover: 'hover:bg-slate-100 dark:hover:bg-slate-800/80',
    labelText: 'text-slate-500 dark:text-slate-300',
    subText: 'text-slate-400 dark:text-slate-500',
  },
  early: {
    bg: 'bg-sky-100 dark:bg-sky-500/20',
    hover: 'hover:bg-sky-200 dark:hover:bg-sky-500/30',
    labelText: 'text-sky-900 dark:text-sky-100',
    subText: 'text-sky-700 dark:text-sky-200',
  },
  day: {
    bg: 'bg-emerald-100 dark:bg-emerald-500/20',
    hover: 'hover:bg-emerald-200 dark:hover:bg-emerald-500/30',
    labelText: 'text-emerald-900 dark:text-emerald-100',
    subText: 'text-emerald-700 dark:text-emerald-200',
  },
  late: {
    bg: 'bg-slate-200 dark:bg-slate-700/40',
    hover: 'hover:bg-slate-300 dark:hover:bg-slate-700/60',
    labelText: 'text-slate-900 dark:text-slate-100',
    subText: 'text-slate-700 dark:text-slate-300',
  },
  night: {
    bg: 'bg-slate-400 dark:bg-slate-600/50',
    hover: 'hover:bg-slate-300 dark:hover:bg-slate-600/70',
    labelText: 'text-slate-900 dark:text-slate-100',
    subText: 'text-slate-700 dark:text-slate-300',
  },
  night_after: {
    bg: 'bg-slate-400 dark:bg-slate-600/50',
    hover: 'hover:bg-slate-300 dark:hover:bg-slate-600/70',
    labelText: 'text-slate-900 dark:text-slate-100',
    subText: 'text-slate-700 dark:text-slate-300',
  },
  off: {
    bg: 'bg-amber-100 dark:bg-amber-500/20',
    hover: 'hover:bg-amber-200 dark:hover:bg-amber-500/30',
    labelText: 'text-amber-900 dark:text-amber-100',
    subText: 'text-amber-700 dark:text-amber-200',
  },
  custom: {
    bg: 'bg-purple-100 dark:bg-purple-500/20',
    hover: 'hover:bg-purple-200 dark:hover:bg-purple-500/30',
    labelText: 'text-purple-900 dark:text-purple-100',
    subText: 'text-purple-700 dark:text-purple-200',
  },
}

const SHIFT_TAG_STYLES: Record<string, string> = {
  EARLY:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200',
  DAY:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200',
  LATE:
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-200',
  NIGHT:
    'border-slate-300 bg-slate-200 text-slate-800 dark:border-slate-600/60 dark:bg-slate-700/40 dark:text-slate-200',
  DEFAULT:
    'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

const FAIRNESS_TAG_STYLES: Record<
  'total' | 'night' | 'weekend' | 'holiday',
  { container: string; label: string }
> = {
  total: {
    container:
      'inline-flex items-center rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-semibold shadow-sm dark:bg-emerald-500/20',
    label: 'text-emerald-700 dark:text-emerald-200',
  },
  night: {
    container:
      'inline-flex items-center rounded-full bg-slate-200/80 px-3 py-1 text-[11px] font-semibold shadow-sm dark:bg-slate-700/40',
    label: 'text-slate-800 dark:text-slate-100',
  },
  weekend: {
    container:
      'inline-flex items-center rounded-full bg-sky-100/80 px-3 py-1 text-[11px] font-semibold shadow-sm dark:bg-sky-500/20',
    label: 'text-sky-700 dark:text-sky-200',
  },
  holiday: {
    container:
      'inline-flex items-center rounded-full bg-amber-100/80 px-3 py-1 text-[11px] font-semibold shadow-sm dark:bg-amber-500/20',
    label: 'text-amber-700 dark:text-amber-200',
  },
}

type AutoGenerateOptions = {
  preserveExisting: boolean
  enforceNightAfterRest: boolean
  enforceNightRestPairing: boolean
  forbidLateToEarly: boolean
  limitFulltimeRepeat: boolean
  balanceWorkload: boolean
  equalizeShiftCounts: boolean
  maxNightsPerMember: number
  maxConsecutiveWorkdays: number
  desiredDayHeadcount: number
  minOffDaysFullTime: number
  minOffDaysPartTime: number
  timeLimit: number
}

const BASE_AUTO_GENERATE_OPTIONS: AutoGenerateOptions = {
  preserveExisting: true,
  enforceNightAfterRest: true,
  enforceNightRestPairing: true,
  forbidLateToEarly: true,
  limitFulltimeRepeat: true,
  balanceWorkload: true,
  equalizeShiftCounts: false,
  maxNightsPerMember: 7,
  maxConsecutiveWorkdays: 5,
  desiredDayHeadcount: 1,
  minOffDaysFullTime: 8,
  minOffDaysPartTime: 10,
  timeLimit: 20,
}

const ExpandIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <polyline points="9 4 4 4 4 9" />
    <line x1="4" y1="4" x2="10" y2="10" />
    <polyline points="15 20 20 20 20 15" />
    <line x1="14" y1="14" x2="20" y2="20" />
  </svg>
)

const CompressIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <polyline points="9 9 4 9 4 4" />
    <line x1="9" y1="9" x2="4" y2="4" />
    <polyline points="15 15 20 15 20 20" />
    <line x1="15" y1="15" x2="20" y2="20" />
  </svg>
)

const resolveShiftStyleKey = (code?: string | null): ShiftStyleKey => {
  switch (code) {
    case 'EARLY':
      return 'early'
    case 'DAY':
      return 'day'
    case 'LATE':
      return 'late'
    case 'NIGHT':
      return 'night'
    case 'NIGHT_AFTER':
      return 'night_after'
    case 'OFF':
      return 'off'
    default:
      return 'custom'
  }
}

const resolveSummaryStyle = (code: string): ShiftStyleKey => {
  if (code === 'UNASSIGNED') {
    return 'unassigned'
  }

  return resolveShiftStyleKey(code)
}

const getDayType = (date: Date, hasHoliday: boolean): DayType => {
  if (hasHoliday) {
    return 'holiday'
  }

  const day = date.getDay()

  if (day === 0) {
    return 'sunday'
  }

  if (day === 6) {
    return 'saturday'
  }

  return 'weekday'
}

const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const addDays = (date: Date, days: number) => {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

const startOfWeek = (date: Date) => {
  const day = date.getDay()
  const diff = (day + 6) % 7
  return addDays(new Date(date), -diff)
}

const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const lastDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0)
const addMonths = (date: Date, months: number) => {
  const copy = new Date(date)
  copy.setMonth(copy.getMonth() + months)
  return copy
}

type ActiveCell = {
  memberId: number
  workDate: string
}

type AssignmentMapEntry = {
  shift: Shift
  assignment: Assignment
}

type PendingValue =
  | { kind: 'shift-type'; shiftType: ShiftType }
  | { kind: 'off' }
  | { kind: 'custom'; start_at: string; end_at: string }

type CoverageShortageDetail = {
  totalMissing: number
  details: Array<{ shift: WorkShiftCode; missing: number }>
}

type OptimizerAssignmentEntry = {
  date?: string
  shifts?: Record<string, { user_id?: number | string; start_at?: string | null; end_at?: string | null }>
}

const buildKey = (memberId: number, workDate: string) => `${memberId}__${workDate}`

const UnitSchedulePage = () => {
  const params = useParams()
  const unitIdParam = Number(params.unitId)
  const isValidUnitId = Number.isFinite(unitIdParam)
  const unitId = isValidUnitId ? unitIdParam : 0
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('month')
  const [anchorDate, setAnchorDate] = useState(() => formatDate(new Date()))
  const monthKey = useMemo(() => {
    const date = parseDate(anchorDate)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }, [anchorDate])

  const { rangeStartObj, rangeEndObj, rangeStartDate, queryEndDate } = useMemo(() => {
    const anchor = parseDate(anchorDate)
    let startObj: Date
    let endObj: Date

    switch (viewMode) {
      case 'day':
        startObj = anchor
        endObj = anchor
        break
      case 'week':
        startObj = startOfWeek(anchor)
        endObj = addDays(startObj, 6)
        break
      case 'month':
      default:
        startObj = addDays(firstDayOfMonth(anchor), -2)
        endObj = lastDayOfMonth(anchor)
        break
    }

    return {
      rangeStartObj: startObj,
      rangeEndObj: endObj,
      rangeStartDate: formatDate(startObj),
      queryEndDate: formatDate(addDays(endObj, 1)),
    }
  }, [anchorDate, viewMode])

  const autoGenerateRange = useMemo((): { type: 'day' | 'week'; start: string; end: string } | null => {
    const anchor = parseDate(anchorDate)
    if (viewMode === 'week') {
      const start = startOfWeek(anchor)
      const end = addDays(start, 6)
      return {
        type: 'week',
        start: formatDate(start),
        end: formatDate(end),
      }
    }

    if (viewMode === 'day') {
      const formatted = formatDate(anchor)
      return { type: 'day', start: formatted, end: formatted }
    }

    return null
  }, [anchorDate, viewMode])

  const anchorInputValue = useMemo(() => {
    const parsed = parseDate(anchorDate)
    if (Number.isNaN(parsed.getTime())) {
      return anchorDate
    }
    if (viewMode === 'week') {
      return formatDate(startOfWeek(parsed))
    }
    return formatDate(parsed)
  }, [anchorDate, viewMode])

  const navigationLabels = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return { prev: '前日', next: '翌日' }
      case 'week':
        return { prev: '前週', next: '翌週' }
      case 'month':
      default:
        return { prev: '前月', next: '翌月' }
    }
  }, [viewMode])

  const autoGenerateRangeLabel = useMemo(() => {
    if (autoGenerateRange) {
      return autoGenerateRange.type === 'day'
        ? autoGenerateRange.start
        : `${autoGenerateRange.start} 〜 ${autoGenerateRange.end}`
    }

    const monthAnchor = parseDate(`${monthKey}-01`)
    const start = formatDate(firstDayOfMonth(monthAnchor))
    const end = formatDate(lastDayOfMonth(monthAnchor))
    return `${start} 〜 ${end}`
  }, [autoGenerateRange, monthKey])
  const autoGenerateViewLabel = autoGenerateRange?.type === 'week'
    ? '週表示'
    : autoGenerateRange?.type === 'day'
      ? '日表示'
      : '月表示'
  const autoGenerateRangeHeading = autoGenerateRange?.type === 'day' ? '対象日' : '対象期間'

  const { summaryStart, summaryEnd, summaryDates } = useMemo(() => {
    const anchor = parseDate(anchorDate)

    const buildDates = (start: Date, end: Date) => {
      const dates: string[] = []
      let cursor = new Date(start)
      while (cursor <= end) {
        dates.push(formatDate(cursor))
        cursor = addDays(cursor, 1)
      }
      return dates
    }

    if (viewMode === 'day') {
      const start = new Date(anchor)
      const end = new Date(anchor)
      return {
        summaryStart: start,
        summaryEnd: end,
        summaryDates: [formatDate(start)],
      }
    }

    if (viewMode === 'week') {
      const start = startOfWeek(anchor)
      const end = addDays(start, 6)
      return {
        summaryStart: start,
        summaryEnd: end,
        summaryDates: buildDates(start, end),
      }
    }

    const start = firstDayOfMonth(anchor)
    const end = lastDayOfMonth(anchor)
    return {
      summaryStart: start,
      summaryEnd: end,
      summaryDates: buildDates(start, end),
    }
  }, [anchorDate, viewMode])

  const { data, isLoading, isError } = useUnitShiftsQuery({
    unitId,
    startDate: rangeStartDate,
    endDate: queryEndDate,
    enabled: isValidUnitId,
  })

  const { data: unitsData } = useUnitsQuery(true)
  const unitDetail = useMemo(
    () => (isValidUnitId ? unitsData?.data.find((unit) => unit.id === unitId) : undefined),
    [isValidUnitId, unitsData, unitId],
  )
  const coverageDayDefault = useMemo(() => {
    const raw = Number(unitDetail?.coverage_requirements?.day ?? 1)
    if (Number.isNaN(raw) || raw <= 0) {
      return 1
    }
    return Math.max(1, Math.round(raw))
  }, [unitDetail?.coverage_requirements?.day])

  const autoGenerateDefaults = useMemo<AutoGenerateOptions>(() => {
    const base: AutoGenerateOptions = {
      ...BASE_AUTO_GENERATE_OPTIONS,
      desiredDayHeadcount: coverageDayDefault,
    }

    if (autoGenerateRange?.type === 'week') {
      base.minOffDaysFullTime = 2
      base.minOffDaysPartTime = 2
      base.maxNightsPerMember = 1
    } else if (autoGenerateRange?.type === 'day') {
      base.minOffDaysFullTime = 0
      base.minOffDaysPartTime = 0
      base.maxNightsPerMember = 1
    }

    return base
  }, [autoGenerateRange?.type, coverageDayDefault])
  const members = useMemo<UnitMember[]>(() => {
    const metaMembers = ((data?.meta as { members?: UnitMember[] } | undefined)?.members ?? []) as UnitMember[]
    if (metaMembers.length > 0) {
      return sortMembersByDisplayOrder(metaMembers)
    }

    if (unitDetail?.members) {
      return sortMembersByDisplayOrder(unitDetail.members as UnitMember[])
    }

    return []
  }, [data?.meta, unitDetail])

  const {
    data: shiftTypesData,
    isLoading: isShiftTypesLoading,
    isError: isShiftTypesError,
  } = useShiftTypesQuery(true)

  const shiftTypes = shiftTypesData?.data ?? []
  const restType = useMemo(() => shiftTypes.find((type) => type.code === 'OFF'), [shiftTypes])
  const nightAfterType = useMemo(
    () => shiftTypes.find((type) => type.code === 'NIGHT_AFTER'),
    [shiftTypes],
  )
  const shiftTypesForMenu = useMemo(() => {
    const order = ['EARLY', 'DAY', 'LATE', 'NIGHT', 'NIGHT_AFTER']
    const rank = (code: string) => {
      const index = order.indexOf(code)
      return index === -1 ? order.length : index
    }

    return shiftTypes
      .filter((type) => type.code !== 'OFF')
      .slice()
      .sort((a, b) => rank(a.code) - rank(b.code))
  }, [shiftTypes])
  const shiftTypeMap = useMemo(() => {
    const map = new Map<string, ShiftType>()
    shiftTypes.forEach((type) => {
      if (!type.code) return
      map.set(type.code.toUpperCase(), type)
    })
    return map
  }, [shiftTypes])
  const coverageRequirements = useMemo<Record<WorkShiftCode, number>>(() => {
    const raw = unitDetail?.coverage_requirements ?? {}
    const parseCount = (value: unknown): number => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value))
      }
      if (typeof value === 'string') {
        const parsed = Number(value)
        if (!Number.isNaN(parsed)) {
          return Math.max(0, Math.floor(parsed))
        }
      }
      return 0
    }

    const normalizedRaw = raw as Record<string, unknown>

    return {
      EARLY: parseCount(normalizedRaw.early),
      DAY: parseCount(normalizedRaw.day),
      LATE: parseCount(normalizedRaw.late),
      NIGHT: parseCount(normalizedRaw.night),
    }
  }, [unitDetail])
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, PendingValue>>({})
  const [customInputs, setCustomInputs] = useState<Record<string, { start: string; end: string }>>({})
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showAutoGenerate, setShowAutoGenerate] = useState(false)
  const [isAutoGenerating, setIsAutoGenerating] = useState(false)
  const [latestShortages, setLatestShortages] = useState<
    Array<{ date: string; shift_code: string; missing: number }>
  >([])
  const [latestConflicts, setLatestConflicts] = useState<Array<Record<string, unknown>>>([])
  const [expandedAllowedShifts, setExpandedAllowedShifts] = useState<Record<number, boolean>>({})
  const [autoGenOptions, setAutoGenOptions] = useState<AutoGenerateOptions>(
    () => ({ ...BASE_AUTO_GENERATE_OPTIONS }),
  )
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    setAutoGenOptions((prev) =>
      prev.desiredDayHeadcount === coverageDayDefault
        ? prev
        : {
            ...prev,
            desiredDayHeadcount: coverageDayDefault,
          },
    )
  }, [coverageDayDefault])
  useEffect(() => {
    if (!showAutoGenerate) return
    setAutoGenOptions((prev) => ({
      ...prev,
      desiredDayHeadcount: autoGenerateDefaults.desiredDayHeadcount,
      minOffDaysFullTime: autoGenerateDefaults.minOffDaysFullTime,
      minOffDaysPartTime: autoGenerateDefaults.minOffDaysPartTime,
      maxNightsPerMember: autoGenerateDefaults.maxNightsPerMember,
    }))
  }, [showAutoGenerate, autoGenerateDefaults])
  const menuRef = useRef<HTMLDivElement | null>(null)

  const batchUpdateMutation = useBatchUpdateShifts(unitId)
  const deleteRangeMutation = useDeleteShiftsRange(unitId)

  const updateMenuPosition = useCallback(() => {
    const anchor = menuAnchorRef.current
    if (!anchor) {
      setMenuPosition(null)
      return
    }
    const rect = anchor.getBoundingClientRect()
    const menuWidth = Math.max(256, rect.width)
    const viewportLeft = window.scrollX
    const viewportRight = window.scrollX + window.innerWidth
    let left = rect.left + window.scrollX
    if (left + menuWidth > viewportRight - 16) {
      left = viewportRight - menuWidth - 16
    }
    left = Math.max(viewportLeft + 16, left)
    const viewportTop = window.scrollY
    const viewportBottom = window.scrollY + window.innerHeight
    const menuHeightEstimate = 360
    let top = rect.bottom + window.scrollY + 8
    if (top + menuHeightEstimate > viewportBottom - 12) {
      const candidateTop = rect.top + window.scrollY - menuHeightEstimate - 12
      top = Math.max(viewportTop + 16, candidateTop)
    }
    setMenuPosition((prev) => {
      if (prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.width - menuWidth) < 0.5) {
        return prev
      }
      return { left, top, width: menuWidth }
    })
  }, [])

  const clearActiveCell = useCallback(() => {
    setActiveCell(null)
    setMenuPosition(null)
    menuAnchorRef.current = null
  }, [])

  const updateAnchorDate = useCallback(
    (next: Date | string) => {
      const formatted = typeof next === 'string' ? next : formatDate(next)
      if (!formatted) return
      setAnchorDate(formatted)
      clearActiveCell()
      setPendingAssignments({})
      setCustomInputs({})
    },
    [clearActiveCell],
  )

  const getDeleteRangeInfo = () => {
    if (viewMode === 'day') {
      const start = anchorDate
      return {
        payload: {
          range_type: 'day' as const,
          target_date: anchorDate,
        },
        start,
        end: start,
      }
    }

    if (viewMode === 'week') {
      const anchor = parseDate(anchorDate)
      const weekStart = formatDate(startOfWeek(anchor))
      const weekEnd = formatDate(addDays(startOfWeek(anchor), 6))
      return {
        payload: {
          range_type: 'week' as const,
          target_date: weekStart,
        },
        start: weekStart,
        end: weekEnd,
      }
    }

    const [yearStr, monthStr] = monthKey.split('-')
    const yearNum = Number(yearStr)
    const monthNum = Number(monthStr)
    const safeYear = Number.isNaN(yearNum) ? new Date().getFullYear() : yearNum
    const safeMonth = Number.isNaN(monthNum) ? new Date().getMonth() : monthNum - 1
    const monthStartDate = new Date(safeYear, safeMonth, 1)
    const monthStart = formatDate(monthStartDate)
    const monthEnd = formatDate(lastDayOfMonth(monthStartDate))
    return {
      payload: {
        range_type: 'month' as const,
        month: monthKey,
      },
      start: monthStart,
      end: monthEnd,
    }
  }

  const deleteRangeButtonText = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return `${anchorDate} のシフトを削除`
      case 'week':
        return 'この週のシフトを削除'
      case 'month':
      default:
        return `${monthKey} のシフトを削除`
    }
  }, [viewMode, anchorDate, monthKey])

  const assignmentMap = useMemo(() => {
    const map: Record<string, AssignmentMapEntry> = {}
    data?.data.forEach((shift) => {
      shift.assignments.forEach((assignment) => {
        if (!assignment.user) return
        map[buildKey(assignment.user.id, shift.work_date)] = {
          shift,
          assignment,
        }
      })
    })
    return map
  }, [data])

  const dateRange = useMemo(() => {
    const dates: string[] = []
    let cursor = new Date(rangeStartObj)
    while (cursor <= rangeEndObj) {
      dates.push(formatDate(cursor))
      cursor = addDays(cursor, 1)
    }
    return dates
  }, [rangeStartObj, rangeEndObj])

  const holidaysMap = useMemo(() => {
    const holidays = holidayJp.between(rangeStartObj, addDays(rangeEndObj, 1))
    const map = new Map<string, Holiday<Date>>()

    holidays.forEach((holiday) => {
      map.set(formatDate(holiday.date), holiday)
    })

    return map
  }, [rangeStartObj, rangeEndObj])

  const resolveCellCode = useCallback(
    (memberId: number, date: string): string => {
      const key = buildKey(memberId, date)
      const pending = pendingAssignments[key]

      if (pending) {
        if (pending.kind === 'shift-type') {
          const code = pending.shiftType.code?.toUpperCase()
          return code && code.length > 0 ? code : 'CUSTOM'
        }

        if (pending.kind === 'off') {
          return 'OFF'
        }

        if (pending.kind === 'custom') {
          return 'CUSTOM'
        }
      }

      const entry = assignmentMap[key]
      if (!entry) {
        return 'UNASSIGNED'
      }

      const code = entry.shift.shift_type?.code
      if (code && code.length > 0) {
        return code.toUpperCase()
      }

      return 'CUSTOM'
    },
    [assignmentMap, pendingAssignments],
  )
  const coverageShortages = useMemo<Record<string, CoverageShortageDetail>>(() => {
    const shortages: Record<string, CoverageShortageDetail> = {}
    const hasRequirement = WORK_SHIFT_CODES.some((code) => (coverageRequirements[code] ?? 0) > 0)

    if (!hasRequirement || !dateRange.length || !members.length) {
      return shortages
    }

    dateRange.forEach((date) => {
      const counts: Record<WorkShiftCode, number> = {
        EARLY: 0,
        DAY: 0,
        LATE: 0,
        NIGHT: 0,
      }

      members.forEach((member) => {
        const key = buildKey(member.id, date)
        const baseCode = resolveCellCode(member.id, date)
        const normalized = baseCode?.toUpperCase() ?? ''
        let coverageCode: WorkShiftCode | null = null

        if ((WORK_SHIFT_CODES as readonly string[]).includes(normalized)) {
          coverageCode = normalized as WorkShiftCode
        } else if (normalized === 'CUSTOM') {
          const pending = pendingAssignments[key]
          if (pending?.kind === 'shift-type') {
            const pendingCode = pending.shiftType.code?.toUpperCase()
            if (pendingCode && (WORK_SHIFT_CODES as readonly string[]).includes(pendingCode)) {
              coverageCode = pendingCode as WorkShiftCode
            }
          } else if (pending?.kind === 'custom') {
            coverageCode = 'DAY'
          }

          if (!coverageCode) {
            const mapEntry = assignmentMap[key]
            const typeCode = mapEntry?.shift.shift_type?.code?.toUpperCase()
            if (typeCode && (WORK_SHIFT_CODES as readonly string[]).includes(typeCode)) {
              coverageCode = typeCode as WorkShiftCode
            } else if (mapEntry) {
              coverageCode = inferWorkShiftFromTimes(mapEntry.shift.start_at, mapEntry.shift.end_at)
            }
          }
        }

        if (coverageCode) {
          counts[coverageCode] += 1
        }
      })

      const details: CoverageShortageDetail['details'] = []
      let totalMissing = 0

      WORK_SHIFT_CODES.forEach((shiftCode) => {
        const required = coverageRequirements[shiftCode] ?? 0
        if (required <= 0) {
          return
        }
        const missing = required - counts[shiftCode]
        if (missing > 0) {
          totalMissing += missing
          details.push({ shift: shiftCode, missing })
        }
      })

      if (details.length > 0) {
        shortages[date] = {
          totalMissing,
          details,
        }
      }
    })

    return shortages
  }, [assignmentMap, coverageRequirements, dateRange, members, pendingAssignments, resolveCellCode])

  const memberShiftCounts = useMemo(() => {
    const perMember: Record<number, Record<string, number>> = {}

    const ensureBucket = (memberId: number) => {
      if (!perMember[memberId]) {
        perMember[memberId] = {}
      }
      return perMember[memberId]
    }

    const increment = (memberId: number, code: string) => {
      const normalizedCode = code || 'UNASSIGNED'
      const bucket = ensureBucket(memberId)
      bucket[normalizedCode] = (bucket[normalizedCode] ?? 0) + 1
    }

    summaryDates.forEach((date) => {
      members.forEach((member) => {
        increment(member.id, resolveCellCode(member.id, date))
      })
    })

    return perMember
  }, [members, resolveCellCode, summaryDates])

  const memberFairnessPoints = useMemo(() => {
    const totals: Record<number, { total: number; night: number; weekend: number; holiday: number }> = {}

    const ensure = (memberId: number) => {
      if (!totals[memberId]) {
        totals[memberId] = { total: 0, night: 0, weekend: 0, holiday: 0 }
      }
      return totals[memberId]
    }

    summaryDates.forEach((date) => {
      const parsedDate = parseDate(date)
      const day = parsedDate.getDay()
      const isWeekend = day === 0 || day === 6
      const isHoliday = holidaysMap.has(date)

      members.forEach((member) => {
        const code = resolveCellCode(member.id, date)
        if (!code || code === 'UNASSIGNED' || code === 'OFF' || code === 'NIGHT_AFTER') {
          return
        }

        const bucket = ensure(member.id)

        if (code === 'NIGHT') {
          bucket.night += 3
          bucket.total += 3
        }

        if (isWeekend) {
          bucket.weekend += 1
          bucket.total += 1
        }

        if (isHoliday) {
          bucket.holiday += 1
          bucket.total += 1
        }
      })
    })

    return totals
  }, [holidaysMap, members, resolveCellCode, summaryDates])

  useEffect(() => {
    setExpandedAllowedShifts((prev) => {
      const next: Record<number, boolean> = {}
      members.forEach((member) => {
        if (prev[member.id]) {
          next[member.id] = true
        }
      })
      return next
    })
  }, [members])

  const toggleAllowedShiftVisibility = useCallback((memberId: number) => {
    setExpandedAllowedShifts((prev) => ({
      ...prev,
      [memberId]: !prev[memberId],
    }))
  }, [])

  const describeConflict = (conflict: Record<string, unknown>): string => {
    const type = (conflict.type as string | undefined) ?? 'unknown'
    const shiftCode = typeof conflict.shift_code === 'string' ? conflict.shift_code : ''
    const shiftLabel = shiftLabelMap[shiftCode] ?? shiftCode
    switch (type) {
      case 'night_follow_up_conflict':
        return `${conflict.date ?? '不明日'} の夜勤に対し、翌日が夜勤明けになっていません。`
      case 'night_rest_conflict':
        return `${conflict.date ?? '不明日'} の夜勤後に休みが確保できませんでした。`
      case 'night_eligibility_conflict':
        return `${conflict.date ?? '不明日'} に夜勤不可の従業員へ夜勤が割り当てられています。`
      case 'night_quota_conflict':
        return `夜勤上限(${conflict.max_allowed ?? '?'})を超える固定割当が存在します。`
      case 'allowed_shift_conflict':
        return `${conflict.date ?? '不明日'} の ${shiftLabel || 'シフト'} は許可シフト外です。`
      case 'existing_assignment_conflict':
        return `${conflict.date ?? '不明日'} に既存割当との矛盾があり解消できません。`
      case 'late_to_early_conflict':
        return `${conflict.date ?? '不明日'} の遅番と翌日の早番が同一従業員に割り当てられています。`
      case 'repeat_limit_conflict':
        return `${conflict.start_date ?? '不明日'} から同一シフト3日連続の制約に反する固定割当があります。`
      case 'max_consecutive_workdays_conflict':
        return `従業員ID ${conflict.member_id ?? '?'} に連続勤務上限(${conflict.limit ?? '?'}日)を超える固定割当があります (${conflict.start_date ?? '不明日'}〜${conflict.end_date ?? '不明日'})。`
      case 'off_requirement_shortfall':
        return `従業員ID ${conflict.member_id ?? '?'} の休日日数が目標(${conflict.required ?? '?'}日)に届かず、${conflict.shortfall ?? '?'} 日不足しています。`
      default:
        return (conflict.message as string | undefined) ?? '制約上の矛盾が検出されました。'
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (!menuRef.current) return
      if (menuRef.current.contains(event.target as Node)) return
      clearActiveCell()
    }

    if (activeCell) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }

    return undefined
  }, [activeCell, clearActiveCell])

  useEffect(() => {
    if (!activeCell) {
      setMenuPosition(null)
    }
  }, [activeCell])

  useEffect(() => {
    if (!activeCell) {
      return undefined
    }

    updateMenuPosition()

    const handleReposition = () => {
      updateMenuPosition()
    }

    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)

    return () => {
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [activeCell, updateMenuPosition])

  useEffect(() => {
    if (!feedback) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setFeedback(null)
    }, 5000)

    return () => window.clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    if (!isFullscreen) {
      return undefined
    }

    if (typeof document === 'undefined') {
      return undefined
    }

    const originalOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsFullscreen(false)
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  const handleAnchorInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    if (!value) return
    const parsed = parseDate(value)
    if (Number.isNaN(parsed.getTime())) {
      return
    }
    if (viewMode === 'week') {
      updateAnchorDate(startOfWeek(parsed))
    } else {
      updateAnchorDate(parsed)
    }
  }

  const handleNavigate = (direction: number) => {
    const baseDate = parseDate(anchorDate)
    let newAnchor: Date

    switch (viewMode) {
      case 'day':
        newAnchor = addDays(baseDate, direction)
        break
      case 'week':
        newAnchor = addDays(startOfWeek(baseDate), direction * 7)
        break
      case 'month':
      default:
        newAnchor = addMonths(firstDayOfMonth(baseDate), direction)
        break
    }

    updateAnchorDate(newAnchor)
  }

  const handleAutoGenerate = async () => {
    if (!isValidUnitId) return
    if (shiftTypes.length === 0) {
      setFeedback({ type: 'error', text: 'シフト種別の読み込み後に自動作成を実行してください。' })
      return
    }

    setIsAutoGenerating(true)
    setLatestShortages([])
    setLatestConflicts([])
    try {
      const desiredDayHeadcount = Math.max(1, Math.round(autoGenOptions.desiredDayHeadcount))

      const constraints: Record<string, unknown> = {
        enforce_night_after_rest: autoGenOptions.enforceNightAfterRest,
        forbid_late_to_early: autoGenOptions.forbidLateToEarly,
        limit_fulltime_repeat: autoGenOptions.limitFulltimeRepeat,
        balance_workload: autoGenOptions.balanceWorkload,
        max_nights_per_member: autoGenOptions.maxNightsPerMember,
        max_consecutive_workdays: autoGenOptions.maxConsecutiveWorkdays,
        desired_day_headcount: desiredDayHeadcount,
        enforce_night_rest_pairing: autoGenOptions.enforceNightRestPairing,
        min_off_days: autoGenOptions.minOffDaysFullTime,
        min_off_days_full_time: autoGenOptions.minOffDaysFullTime,
        min_off_days_part_time: autoGenOptions.minOffDaysPartTime,
        time_limit: autoGenOptions.timeLimit,
      }

      if (autoGenOptions.equalizeShiftCounts) {
        constraints.equalize_shift_counts = true
      }

      const payload: Record<string, unknown> = {
        month: monthKey,
        constraints,
        preserve_existing: autoGenOptions.preserveExisting,
      }

      if (autoGenerateRange) {
        payload.range = {
          start_date: autoGenerateRange.start,
          end_date: autoGenerateRange.end,
          range_type: autoGenerateRange.type,
        }
      }

      const response = await api.post(`/units/${unitId}/shifts/auto-generate`, payload)
      const result = response.data?.data ?? {}
      const summary = (result?.summary as Record<string, unknown> | undefined) ?? {}
      const shortages = (summary?.shortages as Array<{ date: string; shift_code: string; missing: number }> | undefined) ?? []
      const conflicts = (summary?.constraint_conflicts as Array<Record<string, unknown>> | undefined) ?? []
      const status = (summary?.status as string | undefined) ?? 'unknown'
      setLatestShortages(shortages)
      setLatestConflicts(conflicts)

      const shortageMessage = shortages.length
        ? ` 不足枠 ${shortages.length} 件があります。`
        : ''
      const conflictMessage = conflicts.length
        ? ` 制約矛盾 ${conflicts.length} 件があります。`
        : ''
      const detailText = `${shortageMessage}${conflictMessage}`.trim()
      const isSuccess = status === 'optimal' || status === 'feasible'
      const committed = Boolean(result?.committed)

      if (committed) {
        setShowAutoGenerate(false)
        await queryClient.invalidateQueries({
          queryKey: ['units', unitId, 'shifts'],
          exact: false,
        })
        await queryClient.invalidateQueries({ queryKey: ['units'] })
        setPendingAssignments({})
        setCustomInputs({})
        clearActiveCell()
        const committedMessage = detailText
          ? `自動シフト案を作成し保存しました。${detailText}`
          : '自動シフト案を作成し保存しました。'
        setFeedback({ type: isSuccess ? 'success' : 'error', text: committedMessage })
        return
      }

      const assignments = Array.isArray(result?.assignments)
        ? (result.assignments as OptimizerAssignmentEntry[])
        : []
      const followUpPairs: Array<{ userId: number; baseDate: string }> = []
      const generatedRange = result?.generated_range as
        | { start_date?: string; end_date?: string }
        | undefined

      const touchedDates = new Set<string>()
      assignments.forEach((entry) => {
        if (entry && typeof entry.date === 'string') {
          touchedDates.add(entry.date)
        }
      })

      if (generatedRange?.start_date && generatedRange?.end_date) {
        try {
          const rangeStart = parseDate(generatedRange.start_date)
          const rangeEnd = parseDate(generatedRange.end_date)
          let cursor = new Date(rangeStart)
          while (cursor <= rangeEnd) {
            touchedDates.add(formatDate(cursor))
            cursor = addDays(cursor, 1)
          }
        } catch (rangeError) {
          console.warn('Failed to parse generated range', rangeError)
        }
      }

      const touchedKeys: string[] = []
      touchedDates.forEach((date) => {
        members.forEach((member) => {
          touchedKeys.push(buildKey(member.id, date))
        })
      })

      const pendingUpdates: Record<string, PendingValue> = {}
      const customUpdates: Record<string, { start: string; end: string }> = {}

      assignments.forEach((entry) => {
        const workDate = typeof entry?.date === 'string' ? entry.date : null
        if (!workDate) return

       const shiftEntries = entry?.shifts && typeof entry.shifts === 'object' ? entry.shifts : {}
       const assignedByUser = new Map<
          number,
          { code?: string; start_at?: string; end_at?: string }
        >()

        Object.entries(shiftEntries).forEach(([code, raw]) => {
          const normalizedCode = typeof code === 'string' ? code.toUpperCase() : undefined
          if (!raw || typeof raw !== 'object') {
            return
          }

          const candidates = Array.isArray(raw) ? raw : [raw]

         candidates.forEach((candidate) => {
            if (!candidate || typeof candidate !== 'object') return
            const userIdValue = (candidate as any).user_id ?? (candidate as any).userId ?? (candidate as any).member_id
            const userId = Number(userIdValue)
            if (!Number.isFinite(userId) || userId <= 0) return
            const startAt = (candidate as any).start_at
            const endAt = (candidate as any).end_at
            assignedByUser.set(userId, {
              code: normalizedCode,
              start_at: typeof startAt === 'string' ? startAt : undefined,
              end_at: typeof endAt === 'string' ? endAt : undefined,
            })
          })
        })

        if (autoGenOptions.enforceNightRestPairing) {
          assignedByUser.forEach((info, userId) => {
            if ((info.code ?? '').toUpperCase() === 'NIGHT') {
              followUpPairs.push({ userId, baseDate: workDate })
            }
          })
        }

        members.forEach((member) => {
          const key = buildKey(member.id, workDate)
          const assignmentInfo = assignedByUser.get(member.id)
          const existing = assignmentMap[key]

          if (assignmentInfo) {
            const normalizedCode = assignmentInfo.code ?? ''

            if (normalizedCode === 'OFF') {
              if (restType) {
                const existingCode = existing?.shift?.shift_type?.code?.toUpperCase()
                if (existingCode !== 'OFF') {
                  pendingUpdates[key] = { kind: 'shift-type', shiftType: restType }
                }
              } else if (existing) {
                pendingUpdates[key] = { kind: 'off' }
              }
              return
            }

            const mappedShiftType = normalizedCode ? shiftTypeMap.get(normalizedCode) : undefined
            if (mappedShiftType) {
              const existingCode = existing?.shift?.shift_type?.code?.toUpperCase()
              if (existingCode !== normalizedCode) {
                pendingUpdates[key] = { kind: 'shift-type', shiftType: mappedShiftType }
              }
              return
            }

            if (assignmentInfo.start_at && assignmentInfo.end_at) {
              const existingStart = existing?.shift?.start_at ?? null
              const existingEnd = existing?.shift?.end_at ?? null
              const hasExistingType = Boolean(existing?.shift?.shift_type)
              if (!hasExistingType || existingStart !== assignmentInfo.start_at || existingEnd !== assignmentInfo.end_at) {
                pendingUpdates[key] = {
                  kind: 'custom',
                  start_at: assignmentInfo.start_at,
                  end_at: assignmentInfo.end_at,
                }
                customUpdates[key] = {
                  start: assignmentInfo.start_at,
                  end: assignmentInfo.end_at,
                }
              }
              return
            }
          }

          if (existing) {
            pendingUpdates[key] = { kind: 'off' }
          }
        })
      })

      if (autoGenOptions.enforceNightRestPairing) {
        const nightAfterShiftType = shiftTypeMap.get('NIGHT_AFTER') ?? (nightAfterType ?? null)
        followUpPairs.forEach(({ userId, baseDate }) => {
          try {
            const base = parseDate(baseDate)
            const nextDate = formatDate(addDays(base, 1))
            const restDate = formatDate(addDays(base, 2))

            const ensurePendingShift = (
              targetDate: string,
              shiftType: ShiftType | null,
              fallbackOff = false,
            ) => {
              touchedDates.add(targetDate)
              const key = buildKey(userId, targetDate)
              touchedKeys.push(key)
              const existingShiftCode = assignmentMap[key]?.shift?.shift_type?.code?.toUpperCase() ?? ''
              const currentPending = pendingUpdates[key]

              if (shiftType) {
                if (existingShiftCode === (shiftType.code ?? '').toUpperCase()) {
                  return
                }
                if (currentPending && currentPending.kind === 'shift-type' && currentPending.shiftType.id === shiftType.id) {
                  return
                }
                pendingUpdates[key] = { kind: 'shift-type', shiftType }
              } else if (fallbackOff) {
                if (existingShiftCode === 'OFF') {
                  return
                }
                if (currentPending && currentPending.kind === 'off') {
                  return
                }
                pendingUpdates[key] = { kind: 'off' }
              }
            }

            if (nightAfterShiftType) {
              const key = buildKey(userId, nextDate)
              const existingShiftCode = assignmentMap[key]?.shift?.shift_type?.code?.toUpperCase() ?? ''
              const currentPending = pendingUpdates[key]
              if (!currentPending || currentPending.kind !== 'shift-type' || currentPending.shiftType.id !== nightAfterShiftType.id) {
                if (existingShiftCode !== 'NIGHT_AFTER') {
                  ensurePendingShift(nextDate, nightAfterShiftType)
                }
              }
            }

            if (restType) {
              const key = buildKey(userId, restDate)
              const existingShiftCode = assignmentMap[key]?.shift?.shift_type?.code?.toUpperCase() ?? ''
              const currentPending = pendingUpdates[key]
              if (!currentPending || currentPending.kind !== 'shift-type' || currentPending.shiftType.id !== restType.id) {
                if (existingShiftCode !== 'OFF') {
                  ensurePendingShift(restDate, restType)
                }
              }
            } else {
              ensurePendingShift(restDate, null, true)
            }
          } catch (error) {
            console.warn('Failed to assign night follow-up shifts', error)
          }
        })
      }

      let resultingPendingCount = 0
      setPendingAssignments((prev) => {
        const next = { ...prev }
        touchedKeys.forEach((key) => {
          delete next[key]
        })
        Object.entries(pendingUpdates).forEach(([key, value]) => {
          next[key] = value
        })
        resultingPendingCount = Object.keys(next).length
        return next
      })

      setCustomInputs((prev) => {
        const next = { ...prev }
        touchedKeys.forEach((key) => {
          delete next[key]
        })
        Object.entries(customUpdates).forEach(([key, value]) => {
          next[key] = value
        })
        return next
      })

      const baseMessage = detailText
        ? `自動シフト案を作成しました。${detailText}`
        : '自動シフト案を作成しました。'
      const feedbackText =
        resultingPendingCount > 0
          ? `${baseMessage} 変更を保存で確定してください。`
          : `${baseMessage} 既存のスケジュールとの差分はありませんでした。`

      setFeedback({ type: isSuccess ? 'success' : 'error', text: feedbackText })
      setShowAutoGenerate(false)
      clearActiveCell()
    } catch (error: any) {
      console.error(error)
      const message =
        error?.response?.data?.message ??
        error?.response?.data?.error ??
        'シフト自動作成に失敗しました。'
      setFeedback({ type: 'error', text: message })
      setLatestShortages([])
      setLatestConflicts([])
    } finally {
      setIsAutoGenerating(false)
    }
  }

  const handleDeleteRange = async () => {
    if (!isValidUnitId) return
    const { payload, start, end } = getDeleteRangeInfo()
    const rangeLabel = start === end ? start : `${start} 〜 ${end}`
    const unsavedNotice = hasPendingChanges ? '\n\n未保存の変更は破棄されます。' : ''
    const confirmed = window.confirm(
      `${rangeLabel} のシフトをすべて削除します。\n夜勤を含む場合は対応する夜勤明けと翌日の休みも削除されます。よろしいですか？${unsavedNotice}`,
    )

    if (!confirmed) {
      return
    }

    try {
      await deleteRangeMutation.mutateAsync(payload)
      setPendingAssignments({})
      setCustomInputs({})
      clearActiveCell()
      setFeedback({ type: 'success', text: `${rangeLabel} のシフトを削除しました。` })
    } catch (error) {
      console.error(error)
      setFeedback({ type: 'error', text: 'シフトの削除に失敗しました。時間を置いて再度お試しください。' })
    }
  }

  const handleExport = async () => {
    if (!isValidUnitId || !data) {
      setFeedback({ type: 'error', text: 'シフト情報の読み込み後にエクスポートしてください。' })
      return
    }

    try {
      setIsExporting(true)
      const response = await api.get(`/units/${unitId}/shifts/export`, {
        params: { month: monthKey },
        responseType: 'blob',
      })

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const unitSummary = data.meta.unit
      const filename = `${unitSummary.code}_${monthKey}_shifts.xlsx`
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      setFeedback({ type: 'success', text: 'Excelファイルをダウンロードしました。' })
      clearActiveCell()
    } catch (error) {
      console.error(error)
      setFeedback({ type: 'error', text: 'エクスポートに失敗しました。時間を置いて再度お試しください。' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleCellClick = (
    memberId: number,
    workDate: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    const key = buildKey(memberId, workDate)

    if (activeCell?.memberId === memberId && activeCell.workDate === workDate) {
      clearActiveCell()
      return
    }

    menuAnchorRef.current = event.currentTarget
    setActiveCell({ memberId, workDate })
    updateMenuPosition()

    const pending = pendingAssignments[key]
    const assignment = assignmentMap[key]

    setCustomInputs((prev) => {
      if (prev[key]) return prev
      const defaultStart = pending?.kind === 'custom'
        ? pending.start_at
        : assignment?.shift.start_at ?? '09:00'
      const defaultEnd = pending?.kind === 'custom'
        ? pending.end_at
        : assignment?.shift.end_at ?? '18:00'
      return {
        ...prev,
        [key]: {
          start: defaultStart,
          end: defaultEnd,
        },
      }
    })

    // ensure menu visible vertically
    setTimeout(() => {
      if (menuAnchorRef.current) {
        updateMenuPosition()
      }
    }, 0)
  }

  const handleAssignShift = (shiftType: ShiftType) => {
    if (!activeCell) return
    const baseDate = parseDate(activeCell.workDate)
    const nextDate = formatDate(addDays(baseDate, 1))
    const restDate = formatDate(addDays(baseDate, 2))
    const key = buildKey(activeCell.memberId, activeCell.workDate)
    const nextKey = buildKey(activeCell.memberId, nextDate)
    const restKey = buildKey(activeCell.memberId, restDate)

    setPendingAssignments((prev) => {
      const updated: typeof prev = { ...prev }

      const clearAutoEntry = (targetKey: string) => {
        const target = updated[targetKey]
        if (!target) return
        if (target.kind === 'shift-type') {
          if (['NIGHT_AFTER', 'OFF'].includes(target.shiftType.code)) {
            delete updated[targetKey]
          }
        } else if (target.kind === 'off') {
          delete updated[targetKey]
        }
      }

      clearAutoEntry(nextKey)
      clearAutoEntry(restKey)

      updated[key] = { kind: 'shift-type', shiftType }

      if (shiftType.code === 'NIGHT') {
        if (nightAfterType) {
          updated[nextKey] = { kind: 'shift-type', shiftType: nightAfterType }
        } else {
          updated[nextKey] = { kind: 'off' }
        }

        if (restType) {
          updated[restKey] = { kind: 'shift-type', shiftType: restType }
        } else {
          updated[restKey] = { kind: 'off' }
        }
      }

      return updated
    })

    setCustomInputs((prev) => {
      const updated = { ...prev }
      delete updated[key]
      delete updated[nextKey]
      delete updated[restKey]
      return updated
    })

    clearActiveCell()
  }

  const handleAssignOff = () => {
    if (!activeCell) return
    const key = buildKey(activeCell.memberId, activeCell.workDate)
    if (restType) {
      setPendingAssignments((prev) => ({
        ...prev,
        [key]: { kind: 'shift-type', shiftType: restType },
      }))
    } else {
      setPendingAssignments((prev) => ({
        ...prev,
        [key]: { kind: 'off' },
      }))
    }
    setCustomInputs((prev) => {
      if (!(key in prev)) {
        return prev
      }
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
    clearActiveCell()
  }

  const handleDiscardChanges = () => {
    setPendingAssignments({})
    setCustomInputs({})
    clearActiveCell()
    setFeedback(null)
  }

  const hasPendingChanges = Object.keys(pendingAssignments).length > 0

  const handleSaveChanges = async () => {
    if (!hasPendingChanges) return

    const entries = Object.entries(pendingAssignments).map(([key, value]) => {
      const [memberIdStr, workDate] = key.split('__')
      if (value.kind === 'shift-type') {
        return {
          member_id: Number(memberIdStr),
          work_date: workDate,
          shift_type_id: value.shiftType.id,
          status: 'draft' as const,
        }
      }
      if (value.kind === 'off') {
        return {
          member_id: Number(memberIdStr),
          work_date: workDate,
          shift_type_id: restType?.id ?? null,
        }
      }
      return {
        member_id: Number(memberIdStr),
        work_date: workDate,
        shift_type_id: null,
        start_at: value.start_at,
        end_at: value.end_at,
        status: 'draft' as const,
      }
    })

    try {
      await batchUpdateMutation.mutateAsync(entries)
      setPendingAssignments({})
      setCustomInputs({})
      clearActiveCell()
      setFeedback({ type: 'success', text: '変更を保存しました。' })
    } catch (error) {
      console.error(error)
      setFeedback({ type: 'error', text: '保存に失敗しました。時間を置いて再度お試しください。' })
    }
  }

  const handleViewModeChange = (mode: 'day' | 'week' | 'month') => {
    if (mode === viewMode) return
    const baseDate = parseDate(anchorDate)
    let newAnchor = baseDate

    if (mode === 'week') {
      newAnchor = startOfWeek(baseDate)
    } else if (mode === 'month') {
      newAnchor = firstDayOfMonth(baseDate)
    }

    setViewMode(mode)
    updateAnchorDate(newAnchor)
  }

  const menuPortal =
    activeCell && menuPosition
      ? createPortal(
          (() => {
            const key = buildKey(activeCell.memberId, activeCell.workDate)
            const pendingValue = pendingAssignments[key]
            const assignment = assignmentMap[key]
            const fallback = pendingValue?.kind === 'custom'
              ? { start: pendingValue.start_at, end: pendingValue.end_at }
            : assignment
              ? {
                  start: assignment.shift.start_at ?? '09:00',
                  end: assignment.shift.end_at ?? '18:00',
                }
              : { start: '09:00', end: '18:00' }
          const input = customInputs[key] ?? fallback
          const { left, top, width } = menuPosition!

          const orderedShiftTypes = (() => {
            const order = ['EARLY', 'DAY', 'LATE', 'NIGHT', 'NIGHT_AFTER']
            const positioned = order
              .map((code) =>
                shiftTypesForMenu.find((candidate) => (candidate.code ?? '').toUpperCase() === code),
              )
              .filter((type): type is (typeof shiftTypesForMenu)[number] => Boolean(type))

            const remaining = shiftTypesForMenu.filter((type) => !positioned.includes(type))

            return [...positioned, ...remaining]
          })()

          return (
            <div
              ref={menuRef}
              className="z-[200] w-64 rounded-2xl border border-white/25 bg-white/85 p-3 shadow-2xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/90"
              style={{
                position: 'absolute',
                left,
                top,
                width: Math.max(256, width),
              }}
              onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
            >
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                  シフト種別を選択
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300">
                  {isShiftTypesLoading ? (
                    <p className="col-span-2 text-slate-500 dark:text-slate-400">読み込み中…</p>
                  ) : isShiftTypesError ? (
                    <p className="col-span-2 text-rose-500 dark:text-rose-300">シフト種別の取得に失敗しました。</p>
                  ) : orderedShiftTypes.length ? (
                    <>
                      {orderedShiftTypes.map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => handleAssignShift(type)}
                          disabled={batchUpdateMutation.isPending}
                          className="w-full rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-center font-semibold text-slate-700 backdrop-blur transition hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-500/20"
                        >
                          {type.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleAssignOff}
                        disabled={batchUpdateMutation.isPending}
                        className="w-full rounded-xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-center font-semibold text-rose-600 backdrop-blur transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200 dark:hover:border-rose-400 dark:hover:bg-rose-500/30"
                      >
                        休み
                      </button>
                    </>
                  ) : (
                    <p className="col-span-2 text-slate-500 dark:text-slate-400">シフト種別が設定されていません。</p>
                  )}
                </div>
                <div className="mt-4 space-y-2 border-t border-slate-200/70 pt-3 text-sm dark:border-slate-700">
                  <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 backdrop-blur dark:border-slate-600 dark:bg-slate-800">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-300">カスタムシフト</p>
                    <div className="mt-2 space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={input.start}
                          onChange={(event) =>
                            setCustomInputs((prev) => ({
                              ...prev,
                              [key]: {
                                start: event.target.value,
                                end: prev[key]?.end ?? input.end,
                              },
                            }))
                          }
                          className="w-full rounded-md border border-slate-200/70 bg-white/90 px-2 py-1 text-xs text-slate-700 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-200"
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">〜</span>
                        <input
                          type="time"
                          value={input.end}
                          onChange={(event) =>
                            setCustomInputs((prev) => ({
                              ...prev,
                              [key]: {
                                start: prev[key]?.start ?? input.start,
                                end: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-md border border-slate-200/70 bg-white/90 px-2 py-1 text-xs text-slate-700 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-200"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const value = customInputs[key] ?? fallback
                          if (!value.start || !value.end || value.start >= value.end) {
                            setFeedback({ type: 'error', text: 'カスタム時間の設定を確認してください。' })
                            return
                          }
                          setPendingAssignments((prev) => ({
                            ...prev,
                            [key]: {
                              kind: 'custom',
                              start_at: value.start,
                              end_at: value.end,
                            },
                          }))
                          clearActiveCell()
                        }}
                        className="w-full rounded-md bg-indigo-500 px-2 py-1 text-xs font-semibold text-white transition hover:bg-indigo-400 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                        disabled={batchUpdateMutation.isPending}
                      >
                        カスタムを適用
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-xl border border-slate-200/70 px-3 py-2 text-xs text-slate-500 backdrop-blur transition hover:bg-slate-100/70 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/70"
                  onClick={clearActiveCell}
                >
                  キャンセル
                </button>
              </div>
            )
          })(),
          document.body,
        )
      : null
  if (!isValidUnitId) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-600">
        ユニットが見つかりませんでした。
      </div>
    )
  }

  if (isLoading) {
    return <LoadingScreen message="シフト情報を読み込み中です…" />
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-600">
        シフト情報の取得に失敗しました。
      </div>
    )
  }

  const unitMeta = data.meta.unit
  const summaryRangeStart = formatDate(summaryStart)
  const summaryRangeEnd = formatDate(summaryEnd)
  const totalUnassigned = members.reduce(
    (sum, member) => sum + (memberShiftCounts[member.id]?.UNASSIGNED ?? 0),
    0,
  )

  return (
    <>
      <div className="space-y-8">
        <section className="rounded-2xl border border-white/30 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/45 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">{unitMeta.code}</p>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{unitMeta.name} のシフト</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                表示期間: {data.meta.range.start_date} 〜 {data.meta.range.end_date}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="rounded-full border border-emerald-200/60 bg-emerald-50/70 px-4 py-2 text-sm font-semibold text-emerald-600 backdrop-blur transition hover:bg-emerald-100/80 disabled:opacity-60 dark:border-emerald-500/50 dark:bg-emerald-500/25 dark:text-emerald-200 dark:hover:bg-emerald-500/35"
              >
                {isExporting ? 'エクスポート中…' : 'Excelエクスポート'}
              </button>
              <Link
                to={`/units/${unitId}/availability`}
                className="rounded-full border border-indigo-200/60 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-600 backdrop-blur transition hover:bg-indigo-100/80 dark:border-indigo-500/50 dark:bg-indigo-500/25 dark:text-indigo-200 dark:hover:bg-indigo-500/35"
              >
                希望・休暇を登録
              </Link>
            </div>
          </div>

        </section>

      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 px-4 py-3 text-slate-600 dark:border-slate-700/60 dark:text-slate-300">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          {hasPendingChanges ? `${Object.keys(pendingAssignments).length} 件の変更が未保存です` : '変更はありません'}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDeleteRange}
            disabled={deleteRangeMutation.isPending}
            className="rounded-full border border-rose-200/60 bg-rose-50/70 px-4 py-2 text-sm text-rose-600 backdrop-blur transition hover:bg-rose-100/80 disabled:opacity-60 dark:border-rose-500/50 dark:bg-rose-500/20 dark:text-rose-200 dark:hover:bg-rose-500/30"
          >
            {deleteRangeMutation.isPending ? '削除中…' : deleteRangeButtonText}
          </button>
          <button
            type="button"
            onClick={handleDiscardChanges}
            disabled={!hasPendingChanges || batchUpdateMutation.isPending}
            className="rounded-full border border-white/30 bg-white/50 px-4 py-2 text-sm text-slate-600 backdrop-blur transition hover:bg-white/70 disabled:opacity-60 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60"
          >
            変更を破棄
          </button>
          <button
            type="button"
            onClick={handleSaveChanges}
            disabled={!hasPendingChanges || batchUpdateMutation.isPending}
            className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {batchUpdateMutation.isPending ? '保存中…' : '変更を保存'}
          </button>
        </div>
      </div>

      {feedback ? (
        <div
          className={`glass-panel mt-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm backdrop-blur ${
            feedback.type === 'success'
              ? 'border-emerald-200/60 bg-emerald-50/70 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200'
              : 'border-rose-200/60 bg-rose-50/70 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            閉じる
          </button>
        </div>
      ) : null}

      <div
        className={
          isFullscreen
            ? 'fixed inset-0 z-[120] flex flex-col overflow-hidden bg-white/90 px-4 pb-6 pt-2 sm:pt-3 text-slate-800 backdrop-blur dark:bg-slate-900/90 dark:text-slate-100 !mt-0'
            : 'relative'
        }
      >
        {isFullscreen ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-4 text-slate-800 sm:mb-4 dark:text-slate-100">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-200">{unitMeta.code}</p>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{unitMeta.name} のシフト</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                表示期間: {data.meta.range.start_date} 〜 {data.meta.range.end_date}
              </p>
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
              <div className="flex rounded-full border border-indigo-200/60 bg-indigo-50/80 p-1 text-xs font-semibold text-indigo-600 dark:border-indigo-300/40 dark:bg-white/10 dark:text-indigo-100">
                {(
                  [
                    { value: 'day', label: '日' },
                    { value: 'week', label: '週' },
                    { value: 'month', label: '月' },
                  ] as const
                ).map((option) => (
                  <button
                    key={`fullscreen-${option.value}`}
                    type="button"
                    onClick={() => handleViewModeChange(option.value)}
                    className={`rounded-full px-4 py-1.5 transition ${
                      viewMode === option.value
                        ? 'bg-indigo-500 text-white shadow-sm dark:bg-indigo-500/60'
                        : 'text-indigo-600 hover:bg-white dark:text-indigo-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleNavigate(-1)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition-colors duration-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/20 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20 dark:hover:text-white"
                >
                  前へ
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate(1)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition-colors duration-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/20 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20 dark:hover:text-white"
                >
                  次へ
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAutoGenerate(true)}
                  className="rounded-full border border-indigo-300 bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-200 dark:border-indigo-200/60 dark:bg-white/10 dark:text-indigo-100 dark:hover:bg-white/20"
                >
                  自動シフト作成
                </button>
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={!hasPendingChanges || batchUpdateMutation.isPending}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  {batchUpdateMutation.isPending ? '保存中…' : '変更を保存'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <section
          className={`glass-panel relative rounded-2xl border border-white/20 dark:border-slate-700/60 ${
            isFullscreen
              ? 'flex h-full flex-1 min-h-0 flex-col border-indigo-300/40 bg-white/95 p-2 sm:p-3 shadow-2xl dark:border-slate-600/80 dark:bg-slate-950/95'
              : 'p-1'
          }`}
        >
          {!isFullscreen ? (
            <div className="mb-3 flex flex-wrap items-center justify-end gap-3 pr-2 text-sm text-slate-600 dark:text-slate-300">
              <button
                type="button"
                onClick={() => setShowAutoGenerate(true)}
                className="rounded-full border border-indigo-200/60 bg-white/60 px-4 py-2 text-sm font-semibold text-indigo-600 backdrop-blur transition hover:bg-indigo-50/80 dark:border-indigo-500/50 dark:bg-slate-900/50 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
              >
                自動シフト作成
              </button>
              <div className="flex rounded-full border border-white/40 bg-white/60 p-1 text-xs font-semibold text-slate-500 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200">
                {(
                  [
                    { value: 'day', label: '日' },
                    { value: 'week', label: '週' },
                    { value: 'month', label: '月' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleViewModeChange(option.value)}
                    className={`rounded-full px-4 py-1.5 transition ${
                      viewMode === option.value
                        ? 'bg-indigo-500/20 text-indigo-600 shadow-sm shadow-indigo-200/40 dark:bg-indigo-500/35 dark:text-indigo-100'
                        : 'hover:bg-white/40 hover:text-slate-700 dark:hover:bg-slate-800/40 dark:hover:text-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {viewMode !== 'month' ? (
                <label className="flex items-center gap-2 rounded-full border border-white/40 bg-white/60 px-3 py-1 text-xs text-slate-600 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200">
                  <span>{viewMode === 'day' ? '表示日' : '週の開始日'}</span>
                  <input
                    type="date"
                    value={anchorInputValue}
                    onChange={handleAnchorInputChange}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/40"
                  />
                </label>
              ) : null}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleNavigate(-1)}
                  className="rounded-full border border-white/40 bg-white/60 px-4 py-2 text-sm text-slate-600 backdrop-blur transition hover:bg-white/80 hover:text-indigo-600 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60 dark:hover:text-indigo-200"
                >
                  {navigationLabels.prev}
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate(1)}
                  className="rounded-full border border-white/40 bg-white/60 px-4 py-2 text-sm text-slate-600 backdrop-blur transition hover:bg-white/80 hover:text-indigo-600 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60 dark:hover:text-indigo-200"
                >
                  {navigationLabels.next}
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className={`absolute left-3 top-0 z-[140] inline-flex h-10 w-10 -translate-y-1/2 transform items-center justify-center rounded-full border text-slate-600 backdrop-blur transition hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:text-slate-200 ${
              isFullscreen
                ? 'border-slate-200 bg-white/95 text-slate-700 shadow-lg hover:bg-white dark:border-slate-500/70 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800'
                : 'border-indigo-200/60 bg-indigo-50/90 text-indigo-600 shadow-sm hover:bg-indigo-50 dark:border-slate-600/60 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900'
            }`}
            aria-label={isFullscreen ? '全画面を終了' : '全画面表示'}
            title={isFullscreen ? '全画面を終了' : '全画面表示'}
          >
            {isFullscreen ? (
              <CompressIcon className="h-5 w-5" />
            ) : (
              <ExpandIcon className="h-5 w-5" />
            )}
          </button>
          <div
            className={
              isFullscreen
                ? 'relative flex-1 min-h-0 overflow-auto pb-6'
                : 'relative max-h-[80vh] overflow-x-auto overflow-y-auto'
            }
          >
          <table className="relative w-full min-w-[720px] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="sticky left-0 top-0 z-40 min-w-[140px] rounded-l-2xl border border-white/20 bg-white/75 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-600 shadow-sm backdrop-blur sm:min-w-[140px] dark:border-slate-700/60 dark:bg-slate-900/90 dark:text-slate-300 dark:shadow-slate-950/40">
                  メンバー
                </th>
                {dateRange.map((date) => {
                  const parsed = parseDate(date)
                  const label = `${parsed.getMonth() + 1}/${parsed.getDate()} (${dayLabels[parsed.getDay()]})`
                  const widthClass = viewMode === 'month' ? 'min-w-[100px]' : viewMode === 'day' ? 'min-w-[220px]' : 'min-w-[140px]'
                  const holidayInfo = holidaysMap.get(date)
                  const dayType = getDayType(parsed, Boolean(holidayInfo))
                  const dayStyle = DAY_STYLES[dayType]
                  const shortageInfo = coverageShortages[date]
                  const headerVisualClass = shortageInfo
                    ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200/70 shadow-inner dark:bg-rose-500/95 dark:text-rose-100 dark:ring-rose-500/70'
                    : `${dayStyle.headerBg} ${dayStyle.headerText}`
                  const shortageSummary = shortageInfo
                    ? shortageInfo.details
                        .map((detail) => `${SHORT_SHIFT_LABELS[detail.shift]}${detail.missing}`)
                        .join('/')
                    : ''
                  const headerTextClass = shortageInfo
                    ? 'text-rose-700 dark:text-rose-100'
                    : 'text-slate-600 dark:text-slate-200'

                  return (
                    <th
                      key={date}
                      className={`${widthClass} sticky top-0 z-30 rounded-2xl px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest shadow-sm ${headerVisualClass}`}
                    >
                      <div className={`flex flex-col items-start gap-1 ${headerTextClass}`}>
                        <span className="whitespace-nowrap">{label}</span>
                        {shortageInfo ? (
                          <span className="whitespace-nowrap text-[11px] font-semibold text-rose-600 dark:text-rose-100">
                            不足：{shortageSummary}
                          </span>
                        ) : null}
                      </div>
                      {holidayInfo ? (
                        <span className="mt-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">{holidayInfo.name}</span>
                      ) : null}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const allowedShifts = (member.allowed_shift_types ?? []).filter((type) =>
                  !['OFF', 'NIGHT_AFTER'].includes((type.code ?? '').toUpperCase()),
                )
                const employmentLabel = member.employment_type
                  ? EMPLOYMENT_TYPE_LABELS[member.employment_type] ?? member.employment_type
                  : '雇用区分未設定'

                const isAllowedExpanded = expandedAllowedShifts[member.id] ?? false

                return (
                  <tr key={member.id}>
                    <td className="sticky left-0 z-10 min-w-[220px] rounded-l-2xl border border-white/30 bg-white/70 px-4 py-2 text-sm text-slate-800 shadow-sm backdrop-blur sm:min-w-[200px] lg:min-w-[200px] dark:border-slate-700/60 dark:bg-slate-900/90 dark:text-slate-200 dark:shadow-none">
                      {allowedShifts.length ? (
                        <button
                          type="button"
                          onClick={() => toggleAllowedShiftVisibility(member.id)}
                          className={`absolute -top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-indigo-500/60 dark:hover:text-indigo-200 ${
                            isAllowedExpanded ? 'bg-slate-100 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-900/70'
                          }`}
                          aria-label="勤務可能シフトを切り替え"
                        >
                          <span className="text-xs font-semibold">{isAllowedExpanded ? '−' : '+'}</span>
                        </button>
                      ) : null}
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{member.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {member.role} / {employmentLabel}
                      </p>
                      {allowedShifts.length ? (
                        <div className={`mt-2 transition-[max-height,opacity] ${isAllowedExpanded ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}
                        >
                          <div className="flex flex-wrap gap-1">
                            {allowedShifts.map((type) => {
                              const tagCode = (type.code ?? '').toUpperCase()
                              const tagStyle = SHIFT_TAG_STYLES[tagCode] ?? SHIFT_TAG_STYLES.DEFAULT
                              return (
                                <span
                                  key={`${member.id}-${type.id}`}
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[8px] font-semibold ${tagStyle}`}
                                >
                                  {type.name}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">勤務可能シフトなし</div>
                      )}
                    </td>
                    {dateRange.map((date) => {
                      const cellKey = buildKey(member.id, date)
                      const entry = assignmentMap[cellKey]
                      const pending = pendingAssignments[cellKey]
                      const holidayInfo = holidaysMap.get(date)
                      const parsedDate = parseDate(date)
                      const dayType = getDayType(parsedDate, Boolean(holidayInfo))
                      const dayStyle = DAY_STYLES[dayType]
                      const dayShortage = coverageShortages[date]
                      const cellBackgroundClass = dayShortage
                        ? 'bg-rose-100/80 dark:bg-rose-500/25'
                        : dayStyle.columnBg
                      const cellRingClass = dayShortage
                        ? 'ring-1 ring-rose-200/70 dark:ring-rose-500/50'
                        : ''

                      let label = '未割当'
                      let times = ''
                      let shiftStyleKey: ShiftStyleKey = 'unassigned'

                      if (pending) {
                        if (pending.kind === 'shift-type') {
                          shiftStyleKey = resolveShiftStyleKey(pending.shiftType.code)
                          if (pending.shiftType.code === 'OFF') {
                            label = '休み'
                            times = '休暇'
                          } else {
                            label = pending.shiftType.name
                            times = formatShiftTimes(
                              pending.shiftType.code,
                              pending.shiftType.start_at,
                              pending.shiftType.end_at,
                            )
                          }
                        } else if (pending.kind === 'off') {
                          shiftStyleKey = 'off'
                          label = '休み'
                          times = ''
                        } else {
                          shiftStyleKey = 'custom'
                          label = 'カスタム'
                          times = formatTimeRange(pending.start_at, pending.end_at)
                        }
                      } else if (entry) {
                        if (entry.shift.shift_type) {
                          shiftStyleKey = resolveShiftStyleKey(entry.shift.shift_type.code)
                          if (entry.shift.shift_type.code === 'OFF') {
                            label = '休み'
                            times = '休暇'
                          } else {
                            label = entry.shift.shift_type.name
                            times = formatShiftTimes(
                              entry.shift.shift_type.code,
                              entry.shift.start_at,
                              entry.shift.end_at,
                            )
                          }
                        } else {
                          shiftStyleKey = 'custom'
                          label = 'カスタム'
                          times = formatTimeRange(entry.shift.start_at, entry.shift.end_at)
                        }
                      }

                      const isActive = activeCell?.memberId === member.id && activeCell.workDate === date
                      const isPending = Boolean(pending)
                      const shiftStyle = SHIFT_STYLES[shiftStyleKey]

                      return (
                        <td
                          key={cellKey}
                          className={`relative border border-slate-200 px-0 py-0 transition-colors ${cellBackgroundClass} ${cellRingClass} dark:border-slate-800`}
                        >
                          <button
                            type="button"
                            onClick={(event) => handleCellClick(member.id, date, event)}
                            className={`group flex h-full w-full flex-col gap-1 rounded-2xl px-3 py-2 text-left transition ${
                              shiftStyle.bg
                            } ${shiftStyle.hover} ${dayStyle.buttonRing} ${isActive ? 'ring-2 ring-indigo-400/60 dark:ring-indigo-400/70' : ''} ${
                              isPending ? 'border border-indigo-300 dark:border-indigo-500/70' : ''
                            }`}
                          >
                            <span className={`text-sm font-semibold ${shiftStyle.labelText}`}>{label}</span>
                            <span className={`text-xs whitespace-nowrap ${shiftStyle.subText}`}>{times}</span>
                            {isPending ? (
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500">未保存</span>
                            ) : null}
                          </button>

                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      </div>
      <section className="glass-panel mt-6 rounded-2xl border border-white/20 p-6 dark:border-slate-700/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">メンバー別シフト回数とポイント</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              表示期間: {summaryRangeStart} 〜 {summaryRangeEnd}
            </p>
          </div>
          {totalUnassigned > 0 ? (
            <span className="inline-flex items-center rounded-full bg-rose-100/80 px-4 py-1 text-xs font-semibold text-rose-600 shadow-sm dark:bg-rose-500/25 dark:text-rose-200">
              未割当 {totalUnassigned} 枠
            </span>
          ) : null}
        </div>

        {members.length ? (
          <div className="mt-4 space-y-4">
            {members.map((member) => {
              const breakdown = memberShiftCounts[member.id] ?? {}
              const chips = SHIFT_SUMMARY_ORDER.filter((code) => code !== 'UNASSIGNED')
                .map((code) => ({
                  code,
                  label: shiftLabelMap[code] ?? code,
                  count: breakdown[code] ?? 0,
                  style: SHIFT_STYLES[resolveSummaryStyle(code)],
                }))
                .filter((entry) => entry.count > 0)

              const unassignedCount = breakdown.UNASSIGNED ?? 0
              const fairness =
                memberFairnessPoints[member.id] ?? ({ total: 0, night: 0, weekend: 0, holiday: 0 } as const)
              const fairnessBreakdown = [
                { key: 'night' as const, label: '夜勤', points: fairness.night },
                { key: 'weekend' as const, label: '週末', points: fairness.weekend },
                { key: 'holiday' as const, label: '祝日', points: fairness.holiday },
              ].filter((entry) => entry.points > 0)

              return (
                <div
                  key={member.id}
                  className="rounded-2xl border border-white/30 bg-white/60 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/40"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-[240px] xl:min-w-[280px]">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{member.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {member.role} /{' '}
                        {member.employment_type
                          ? EMPLOYMENT_TYPE_LABELS[member.employment_type] ?? member.employment_type
                          : '雇用区分未設定'}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 justify-between sm:flex-nowrap">
                      <div className="flex flex-wrap items-center gap-2">
                        {unassignedCount > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-rose-100/80 px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm dark:bg-rose-500/25 dark:text-rose-200">
                            未割当 {unassignedCount} 枠
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 justify-end sm:ml-6">
                        {fairnessBreakdown.map((entry) => {
                          const style = FAIRNESS_TAG_STYLES[entry.key]
                          return (
                            <span
                              key={`${member.id}-fairness-${entry.key}`}
                              className={`${style.container} ${style.label}`}
                            >
                              {entry.label} {entry.points} pt
                            </span>
                          )
                        })}
                        <span className={`${FAIRNESS_TAG_STYLES.total.container} ${FAIRNESS_TAG_STYLES.total.label}`}>
                          合計ポイント {fairness.total} pt
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {chips.length ? (
                      chips.map((chip) => (
                        <span
                          key={`${member.id}-${chip.code}`}
                          className={`inline-flex items-center gap-2 rounded-full border border-white/40 px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur dark:border-slate-700/60 ${chip.style.bg} ${chip.style.labelText}`}
                        >
                          <span>{chip.label}</span>
                          <span className="text-sm font-bold">{chip.count}</span>
                          <span className="text-[10px] font-medium">回</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">割当がまだありません。</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">メンバー情報がありません。</p>
        )}
      </section>
    </div>

      {showAutoGenerate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-slate-100 dark:shadow-slate-950/40">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">自動シフト作成</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {autoGenerateViewLabel}の{autoGenerateRangeHeading}: {autoGenerateRangeLabel}
            </p>
            {autoGenerateRange?.type !== 'day' ? (
              <p className="text-xs text-slate-500 dark:text-slate-500/80">対象月: {monthKey}</p>
            ) : null}

            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoGenOptions.preserveExisting}
                  onChange={() =>
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      preserveExisting: !prev.preserveExisting,
                    }))
                  }
                />
                既存の割当を保持したまま不足分のみ埋める
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoGenOptions.enforceNightAfterRest}
                  onChange={() =>
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      enforceNightAfterRest: !prev.enforceNightAfterRest,
                    }))
                  }
                />
                夜勤明けの翌日は休みを強制
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoGenOptions.enforceNightRestPairing}
                  onChange={() =>
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      enforceNightRestPairing: !prev.enforceNightRestPairing,
                    }))
                  }
                />
                夜勤 → 夜勤明け → 休み を自動でセット
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoGenOptions.forbidLateToEarly}
                  onChange={() =>
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      forbidLateToEarly: !prev.forbidLateToEarly,
                    }))
                  }
                />
                遅番の翌日の早番を禁止
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoGenOptions.limitFulltimeRepeat}
                  onChange={() =>
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      limitFulltimeRepeat: !prev.limitFulltimeRepeat,
                    }))
                  }
                />
                正社員の同一勤務 3 日連続を禁止
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={autoGenOptions.balanceWorkload}
                  onChange={() =>
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      balanceWorkload: !prev.balanceWorkload,
                    }))
                  }
                />
                <span>
                  <span className="block">ポイントをなるべく均等に配分</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    夜勤・週末・祝日ポイントや勤務回数の偏りを抑える制約を加えます。
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={autoGenOptions.equalizeShiftCounts}
                  onChange={() =>
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      equalizeShiftCounts: !prev.equalizeShiftCounts,
                    }))
                  }
                />
                <span>
                  <span className="block">各シフトの回数をなるべく均等に配分</span>
                  <span className="block text-xs text-slate-400 dark:text-slate-500">
                    早番・日勤・遅番・夜勤の割当数の偏りを抑えます。
                  </span>
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                夜勤の月上限
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={autoGenOptions.maxNightsPerMember}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      maxNightsPerMember: Number.isNaN(value) ? prev.maxNightsPerMember : value,
                    }))
                  }}
                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                最大連続出勤日数
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={autoGenOptions.maxConsecutiveWorkdays}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      maxConsecutiveWorkdays: Number.isNaN(value)
                        ? prev.maxConsecutiveWorkdays
                        : value,
                    }))
                  }}
                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                日勤の目標人数 (1日あたり)
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={autoGenOptions.desiredDayHeadcount}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      desiredDayHeadcount: Number.isNaN(value)
                        ? prev.desiredDayHeadcount
                        : Math.max(1, Math.round(value)),
                    }))
                  }}
                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                正社員の最低休日日数
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={autoGenOptions.minOffDaysFullTime}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      minOffDaysFullTime: Number.isNaN(value) ? prev.minOffDaysFullTime : value,
                    }))
                  }}
                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                パート／アルバイトの最低休日日数
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={autoGenOptions.minOffDaysPartTime}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      minOffDaysPartTime: Number.isNaN(value) ? prev.minOffDaysPartTime : value,
                    }))
                  }}
                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                計算タイムアウト (秒)
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={autoGenOptions.timeLimit}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setAutoGenOptions((prev) => ({
                      ...prev,
                      timeLimit: Number.isNaN(value) ? prev.timeLimit : value,
                    }))
                  }}
                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAutoGenerate(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleAutoGenerate}
                disabled={isAutoGenerating}
                className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {isAutoGenerating ? '生成中…' : '自動作成'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {latestShortages.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200">
          <p className="font-semibold">不足枠が存在します:</p>
          <ul className="mt-2 space-y-1">
            {latestShortages.slice(0, 6).map((item) => (
              <li key={`${item.date}-${item.shift_code}`}>
                {item.date} {shiftLabelMap[item.shift_code] ?? item.shift_code} : {item.missing} 名不足
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {latestConflicts.length > 0 ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200">
          <p className="font-semibold">考慮した制約との矛盾:</p>
          <ul className="mt-2 space-y-1">
            {latestConflicts.slice(0, 6).map((conflict, index) => (
              <li key={`conflict-${index}`}>{describeConflict(conflict)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {menuPortal}
    </>
  )
}

export default UnitSchedulePage
