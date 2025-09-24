import { useQuery } from '@tanstack/react-query'
import type { FairnessSummaryResponse } from '../../api/types'
import { fetchFairnessSummary } from './api'

export const useFairnessSummaryQuery = (period?: string, enabled = true) =>
  useQuery<FairnessSummaryResponse>({
    queryKey: ['fairness', 'summary', period ?? 'current'],
    queryFn: () => fetchFairnessSummary(period),
    enabled,
  })

