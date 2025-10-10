import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AvailabilityRequestQuery } from './api'
import {
  deleteAvailabilityRequest,
  fetchAvailabilityRequests,
  fetchAvailabilitySchedule,
  fetchAvailabilityReminders,
  sendAvailabilityReminder,
  createAvailabilityReminder,
} from './api'

export const useAvailabilityRequestsQuery = (
  unitId: number,
  params: AvailabilityRequestQuery,
) =>
  useQuery({
    queryKey: ['availability', unitId, 'requests', params],
    queryFn: () => fetchAvailabilityRequests(unitId, params),
    enabled: Number.isFinite(unitId),
    placeholderData: (previousData) => previousData,
    keepPreviousData: true,
  })

export const useAvailabilityScheduleQuery = (unitId: number, period?: string) =>
  useQuery({
    queryKey: ['availability', unitId, 'schedule', period ?? 'upcoming'],
    queryFn: () => fetchAvailabilitySchedule(unitId, period),
    enabled: Number.isFinite(unitId),
    placeholderData: (previousData) => previousData,
    keepPreviousData: true,
  })

export const useAvailabilityRemindersQuery = (unitId: number, enabled = true) =>
  useQuery({
    queryKey: ['availability', unitId, 'reminders'],
    queryFn: () => fetchAvailabilityReminders(unitId),
    enabled: enabled && Number.isFinite(unitId),
  })

export const useDeleteAvailabilityRequestMutation = (unitId: number) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (availabilityRequestId: number) =>
      deleteAvailabilityRequest(unitId, availabilityRequestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'requests'] })
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'schedule'] })
    },
  })
}

export const useSendAvailabilityReminderMutation = (unitId: number, period?: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => sendAvailabilityReminder(unitId, period),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'schedule'] })
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'requests'] })
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'reminders'] })
    },
  })
}

export const useCreateAvailabilityReminderMutation = (unitId: number) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { period: string; scheduled_for: string; message?: string }) =>
      createAvailabilityReminder(unitId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'reminders'] })
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'schedule'] })
    },
  })
}
