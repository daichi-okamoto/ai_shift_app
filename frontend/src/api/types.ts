export type SchedulePreferences = {
  fixed_days_off: Record<
    'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | 'holiday',
    boolean
  >
  custom_dates_off: string[]
}

export type AuthUser = {
  id: number
  name: string
  email: string
  role: string
  role_label?: string | null
  employment_type: string
  organization: {
    id: number
    name: string
  } | null
  memberships: Array<{
    unit_id: number
    unit_name?: string | null
    role: string
  }>
  allowed_shift_types?: Array<{
    id: number
    code: string
    name: string
  }>
  schedule_preferences?: SchedulePreferences
}

export type LoginResponse = {
  token: string
  token_type: string
  abilities: string[]
  user: AuthUser
}

export type RegisterPayload = {
  name: string
  email: string
  password: string
  password_confirmation: string
  organization_code: string
  organization_name?: string
}

export type UnitMember = {
  id: number
  name: string
  role: string
  display_order?: number | null
  employment_type?: string | null
  allowed_shift_types?: Array<{
    id: number
    code: string
    name: string
  }>
}

export type Unit = {
  id: number
  name: string
  code: string
  display_order: number
  coverage_requirements: Record<string, number>
  member_count: number
  leader: {
    id: number
    name: string
    email: string
  } | null
  members: UnitMember[]
}

export type UnitsResponse = {
  data: Unit[]
  meta: {
    count: number
  }
}

export type UnitPayload = {
  name: string
  code: string
  coverage_requirements: {
    early: number
    day: number
    late: number
    night: number
  }
}

export type UnitMembershipPayload = Array<{
  user_id: number
  role: 'leader' | 'member'
}>

export type Assignment = {
  id: number
  shift_id: number
  user_id: number | null
  status: string
  is_night_aftercare_blocked: boolean
  note: string | null
  user?: {
    id: number
    name: string
    role: string | null
  }
}

export type Shift = {
  id: number
  unit_id: number
  work_date: string
  start_at: string
  end_at: string
  status: string
  meta: Record<string, unknown>
  shift_type?: {
    id: number
    code: string
    name: string
    start_at: string
    end_at: string
  }
  assignments: Assignment[]
}

export type ShiftResponse = {
  data: Shift[]
  meta: {
    unit: {
      id: number
      name: string
      code: string
    }
    range: {
      start_date: string
      end_date: string
    }
    members: UnitMember[]
  }
}

export type ShiftType = {
  id: number
  name: string
  code: string
  start_at: string
  end_at: string
  break_minutes: number
  is_default: boolean
}

export type ShiftTypesResponse = {
  data: ShiftType[]
  meta: {
    count: number
  }
}

export type ShiftCreatePayload = {
  shift_type_id: number
  work_date: string
  start_at?: string | null
  end_at?: string | null
  status?: 'draft' | 'published'
  assignment_user_id?: number | null
  note?: string | null
}

export type ShiftBatchEntry = {
  member_id: number
  work_date: string
  shift_type_id: number | null
  start_at?: string | null
  end_at?: string | null
  status?: 'draft' | 'published'
}

export type ShiftDeleteRangePayload = {
  range_type: 'day' | 'week' | 'month'
  target_date?: string
  month?: string
}

export type AvailabilityRequestPayload = {
  work_date: string
  type: 'wish' | 'unavailable' | 'vacation'
  start_at?: string | null
  end_at?: string | null
  reason?: string | null
  user_id?: number
}

export type AvailabilityRequest = {
  id: number
  unit_id: number
  user_id: number
  work_date: string
  type: 'wish' | 'unavailable' | 'vacation'
  start_at: string | null
  end_at: string | null
  status: string
  reason: string | null
  created_at: string | null
  user?: {
    id: number
    name: string
    role: string | null
    email?: string | null
  }
}

export type AvailabilityRequestsResponse = {
  data: AvailabilityRequest[]
  meta: {
    period: string
  }
}

export type AvailabilitySchedule = {
  period: string
  period_start: string
  period_end: string
  deadline_at: string
  reminder_at: string
  reminder_sent_at: string | null
  timezone: string
  now: string
  is_deadline_passed: boolean
  is_reminder_due: boolean
  pending_members: Array<{
    id: number
    name: string
    role: string | null
  }>
  submissions: Array<{
    user_id: number
    user_name?: string | null
    role?: string | null
    count: number
    latest_submitted_at: string | null
  }>
}

export type AvailabilityScheduleResponse = {
  data: AvailabilitySchedule
}

export type AvailabilityReminderTask = {
  id: number
  unit_id: number
  period: string
  scheduled_for: string
  status: 'pending' | 'sent' | 'skipped'
  triggered_at: string | null
  created_at: string | null
  created_by?: {
    id: number
    name: string
  } | null
}

export type AvailabilityReminderTasksResponse = {
  data: AvailabilityReminderTask[]
}

export type AvailabilityReminderTaskResponse = {
  data: AvailabilityReminderTask
}

export type FairnessMemberSummary = {
  user_id: number
  name: string | null
  role: string | null
  unit_names: string[]
  night_points: number
  weekend_points: number
  holiday_points: number
  total_points: number
}

export type FairnessSummary = {
  period: {
    start: string
    end: string
    label: string
  }
  totals: {
    member_count: number
    total_points: number
    average_total: number
    max_total: number
    min_total: number
    night_points: number
    weekend_points: number
    holiday_points: number
  }
  top_members: FairnessMemberSummary[]
}

export type FairnessSummaryResponse = {
  data: FairnessSummary
}
