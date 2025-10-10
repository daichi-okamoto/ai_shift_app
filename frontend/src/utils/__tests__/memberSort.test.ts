import { describe, expect, it } from 'vitest'
import { compareMembersByDisplayOrder, sortMembersByDisplayOrder } from '../memberSort'

describe('sortMembersByDisplayOrder', () => {
  it('sorts members by display_order ascending', () => {
    const members = [
      { id: 2, display_order: 3 },
      { id: 1, display_order: 1 },
      { id: 3, display_order: 2 },
    ]

    const sorted = sortMembersByDisplayOrder(members)

    expect(sorted.map((member) => member.id)).toEqual([1, 3, 2])
  })

  it('keeps original array untouched', () => {
    const members = [
      { id: 1, display_order: 2 },
      { id: 2, display_order: 1 },
    ]

    sortMembersByDisplayOrder(members)

    expect(members.map((member) => member.id)).toEqual([1, 2])
  })

  it('falls back to id when display_order is missing', () => {
    const members = [
      { id: 5 },
      { id: 2, display_order: null },
      { id: 3, display_order: undefined },
      { id: 1, display_order: 0 },
    ]

    const sorted = sortMembersByDisplayOrder(members)

    expect(sorted.map((member) => member.id)).toEqual([1, 2, 3, 5])
  })

  it('exposes comparator for custom ordering', () => {
    const members = [
      { id: 10, display_order: 5 },
      { id: 20, display_order: 1 },
    ]

    const result = members.slice().sort(compareMembersByDisplayOrder)

    expect(result.map((member) => member.id)).toEqual([20, 10])
  })
})
