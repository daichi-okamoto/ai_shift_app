export type HasDisplayOrder = {
  id: number
  display_order?: number | null
}

export const compareMembersByDisplayOrder = <T extends HasDisplayOrder>(a: T, b: T): number => {
  const orderA = typeof a.display_order === 'number' ? a.display_order : Number.MAX_SAFE_INTEGER
  const orderB = typeof b.display_order === 'number' ? b.display_order : Number.MAX_SAFE_INTEGER

  if (orderA !== orderB) {
    return orderA - orderB
  }

  return a.id - b.id
}

export const sortMembersByDisplayOrder = <T extends HasDisplayOrder>(members: T[]): T[] =>
  members.slice().sort(compareMembersByDisplayOrder)
