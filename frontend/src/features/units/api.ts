import { api } from '../../api/client'
import type {
  AvailabilityRequest,
  AvailabilityRequestPayload,
  Shift,
  ShiftBatchEntry,
  ShiftCreatePayload,
  ShiftDeleteRangePayload,
  ShiftResponse,
  ShiftTypesResponse,
  Unit,
  UnitMembershipPayload,
  UnitPayload,
  UnitsResponse,
} from '../../api/types'

type ShiftParams = {
  startDate?: string
  endDate?: string
}

export const fetchUnits = async (): Promise<UnitsResponse> => {
  const { data } = await api.get<UnitsResponse>('/units')
  return data
}

export const createUnit = async (payload: UnitPayload): Promise<Unit> => {
  const { data } = await api.post<{ data: Unit }>('/units', payload)
  return data.data
}

export const updateUnit = async (unitId: number, payload: UnitPayload): Promise<Unit> => {
  const { data } = await api.put<{ data: Unit }>(`/units/${unitId}`, payload)
  return data.data
}

export const deleteUnit = async (unitId: number): Promise<void> => {
  await api.delete(`/units/${unitId}`)
}

export const reorderUnits = async (unitIds: number[]): Promise<void> => {
  await api.post('/units/reorder', { order: unitIds })
}

export const updateUnitMemberships = async (
  unitId: number,
  members: UnitMembershipPayload,
): Promise<Unit> => {
  const { data } = await api.put<{ data: Unit }>(`/units/${unitId}/memberships`, {
    members,
  })
  return data.data
}

export const fetchUnitShifts = async (
  unitId: number,
  params: ShiftParams = {},
): Promise<ShiftResponse> => {
  const { data } = await api.get<ShiftResponse>(`/units/${unitId}/shifts`, {
    params: {
      start_date: params.startDate,
      end_date: params.endDate,
    },
  })
  return data
}

export const createAvailabilityRequest = async (
  unitId: number,
  payload: AvailabilityRequestPayload,
): Promise<AvailabilityRequest> => {
  const { data } = await api.post<{ data: AvailabilityRequest }>(
    `/units/${unitId}/availability-requests`,
    payload,
  )
  return data.data
}

export const fetchShiftTypes = async (): Promise<ShiftTypesResponse> => {
  const { data } = await api.get<ShiftTypesResponse>('/shift-types')
  return data
}

export const createShift = async (
  unitId: number,
  payload: ShiftCreatePayload,
): Promise<Shift> => {
  const { data } = await api.post<{ data: Shift }>(`/units/${unitId}/shifts`, payload)
  return data.data
}

export const batchUpdateShifts = async (
  unitId: number,
  entries: ShiftBatchEntry[],
) => {
  await api.post(`/units/${unitId}/shifts/batch`, { entries })
}

export const deleteShiftsInRange = async (
  unitId: number,
  payload: ShiftDeleteRangePayload,
) => {
  await api.post(`/units/${unitId}/shifts/delete-range`, payload)
}
