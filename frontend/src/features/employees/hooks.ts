import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EmployeePayload } from './api'
import {
  createEmployee,
  deleteEmployee,
  fetchEmployee,
  fetchEmployees,
  updateEmployee,
} from './api'

export const useEmployeesQuery = (enabled = true) =>
  useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
    enabled,
  })

export const useEmployeeQuery = (employeeId?: number) =>
  useQuery({
    queryKey: ['employees', employeeId],
    queryFn: () => fetchEmployee(employeeId as number),
    enabled: Number.isFinite(employeeId) && (employeeId as number) > 0,
  })

export const useCreateEmployeeMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export const useUpdateEmployeeMutation = (employeeId: number) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: EmployeePayload) => updateEmployee(employeeId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId] })
    },
  })
}

export const useDeleteEmployeeMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}
