import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import {
  createAvailabilityRequest,
  batchUpdateShifts,
  createShift,
  createUnit,
  deleteShiftsInRange,
  deleteUnit,
  fetchShiftTypes,
  fetchUnitShifts,
  fetchUnits,
  reorderUnits,
  updateUnit,
  updateUnitMemberships,
} from './api'

type UseUnitShiftsOptions = {
  unitId: number
  startDate?: string
  endDate?: string
  enabled?: boolean
}

export const useUnitsQuery = (enabled = true) =>
  useQuery<UnitsResponse>({
    queryKey: ['units'],
    queryFn: fetchUnits,
    enabled,
  })

export const useUnitShiftsQuery = ({
  unitId,
  startDate,
  endDate,
  enabled = true,
}: UseUnitShiftsOptions) =>
  useQuery<ShiftResponse>({
    queryKey: ['units', unitId, 'shifts', startDate, endDate],
    queryFn: () => fetchUnitShifts(unitId, { startDate, endDate }),
    enabled: enabled && Number.isFinite(unitId),
  })

export const useCreateAvailabilityRequest = (unitId: number) => {
  const queryClient = useQueryClient()

  return useMutation<AvailabilityRequest, unknown, AvailabilityRequestPayload>({
    mutationFn: (payload) => createAvailabilityRequest(unitId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', unitId, 'shifts'] })
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'requests'] })
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'schedule'] })
    },
  })
}

export const useCreateUnitMutation = () => {
  const queryClient = useQueryClient()
  return useMutation<Unit, unknown, UnitPayload>({
    mutationFn: createUnit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
  })
}

export const useUpdateUnitMutation = () => {
  const queryClient = useQueryClient()
  return useMutation<Unit, unknown, { unitId: number; payload: UnitPayload }>({
    mutationFn: ({ unitId, payload }: { unitId: number; payload: UnitPayload }) =>
      updateUnit(unitId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
  })
}

export const useDeleteUnitMutation = () => {
  const queryClient = useQueryClient()
  return useMutation<void, unknown, number>({
    mutationFn: deleteUnit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
  })
}

export const useReorderUnitsMutation = () => {
  const queryClient = useQueryClient()
  return useMutation<void, unknown, number[]>({
    mutationFn: reorderUnits,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
  })
}

export const useUpdateUnitMembershipsMutation = (unitId: number) => {
  const queryClient = useQueryClient()
  return useMutation<Unit, unknown, UnitMembershipPayload>({
    mutationFn: (members: UnitMembershipPayload) => updateUnitMemberships(unitId, members),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'requests'] })
      queryClient.invalidateQueries({ queryKey: ['availability', unitId, 'schedule'] })
    },
  })
}

export const useShiftTypesQuery = (enabled = true) =>
  useQuery<ShiftTypesResponse>({
    queryKey: ['shift-types'],
    queryFn: fetchShiftTypes,
    enabled,
  })

export const useCreateShift = (unitId: number) => {
  const queryClient = useQueryClient()
  return useMutation<Shift, unknown, ShiftCreatePayload>({
    mutationFn: (payload) => createShift(unitId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', unitId, 'shifts'] })
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
  })
}

export const useBatchUpdateShifts = (unitId: number) => {
  const queryClient = useQueryClient()

  return useMutation<void, unknown, ShiftBatchEntry[]>({
    mutationFn: (entries) => batchUpdateShifts(unitId, entries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', unitId, 'shifts'] })
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
  })
}

export const useDeleteShiftsRange = (unitId: number) => {
  const queryClient = useQueryClient()

  return useMutation<void, unknown, ShiftDeleteRangePayload>({
    mutationFn: (payload) => deleteShiftsInRange(unitId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', unitId, 'shifts'] })
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
  })
}
