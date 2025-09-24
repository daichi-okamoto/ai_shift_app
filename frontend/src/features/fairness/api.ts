import { api } from '../../api/client'
import type { FairnessSummaryResponse } from '../../api/types'

export const fetchFairnessSummary = async (period?: string): Promise<FairnessSummaryResponse> => {
  const { data } = await api.get<FairnessSummaryResponse>('/fairness/summary', {
    params: period ? { period } : undefined,
  })

  return data
}

