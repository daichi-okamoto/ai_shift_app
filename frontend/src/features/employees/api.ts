import { api } from '../../api/client'
import type { AuthUser, SchedulePreferences } from '../../api/types'

export type EmployeeMembershipInput = {
  unit_id: number
  role: 'leader' | 'member'
}

export type EmployeePayload = {
  name: string
  email: string
  role: 'admin' | 'leader' | 'member'
  employment_type: 'full_time' | 'part_time' | 'contract'
  allowed_shift_type_ids: number[]
  password?: string
  memberships: EmployeeMembershipInput[]
  schedule_preferences?: SchedulePreferences
}

export type EmployeesResponse = {
  data: AuthUser[]
  meta: {
    count: number
  }
}

export type EmployeeResponse = {
  data: AuthUser
}

export const fetchEmployees = async (): Promise<EmployeesResponse> => {
  const { data } = await api.get<EmployeesResponse>('/employees')
  return data
}

export const fetchEmployee = async (employeeId: number): Promise<EmployeeResponse> => {
  const { data } = await api.get<EmployeeResponse>(`/employees/${employeeId}`)
  return data
}

export const createEmployee = async (payload: EmployeePayload): Promise<EmployeeResponse> => {
  const { data } = await api.post<EmployeeResponse>('/employees', payload)
  return data
}

export const updateEmployee = async (
  employeeId: number,
  payload: EmployeePayload,
): Promise<EmployeeResponse> => {
  const { data } = await api.put<EmployeeResponse>(`/employees/${employeeId}`, payload)
  return data
}

export const deleteEmployee = async (employeeId: number): Promise<void> => {
  await api.delete(`/employees/${employeeId}`)
}
