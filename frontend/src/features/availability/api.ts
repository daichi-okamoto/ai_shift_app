import { api } from '../../api/client'
import type { AvailabilityRequestsResponse, AvailabilityScheduleResponse } from '../../api/types'

export type AvailabilityRequestQuery = {
  period?: string
  scope?: 'self' | 'unit'
  memberId?: number
}

export const fetchAvailabilityRequests = async (
  unitId: number,
  params: AvailabilityRequestQuery = {},
): Promise<AvailabilityRequestsResponse> => {
  const { data } = await api.get<AvailabilityRequestsResponse>(`/units/${unitId}/availability-requests`, {
    params: {
      period: params.period,
      scope: params.scope,
      member_id: params.memberId,
    },
  })

  return data
}

export const deleteAvailabilityRequest = async (
  unitId: number,
  availabilityRequestId: number,
): Promise<void> => {
  await api.delete(`/units/${unitId}/availability-requests/${availabilityRequestId}`)
}

export const fetchAvailabilitySchedule = async (
  unitId: number,
  period?: string,
): Promise<AvailabilityScheduleResponse> => {
  const { data } = await api.get<AvailabilityScheduleResponse>(`/units/${unitId}/availability-schedule`, {
    params: { period },
  })

  return data
}

export const sendAvailabilityReminder = async (
  unitId: number,
  period?: string,
): Promise<AvailabilityScheduleResponse> => {
  const { data } = await api.post<AvailabilityScheduleResponse>(
    `/units/${unitId}/availability-schedule/remind`,
    {},
    { params: { period } },
  )

  return data
}
