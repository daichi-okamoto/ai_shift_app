import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { UniqueIdentifier } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { ReactNode } from 'react'

export type SortDirection = 'vertical' | 'horizontal'

export type SortableListProps<T extends UniqueIdentifier> = {
  items: T[]
  onReorder: (items: T[]) => void
  children: ReactNode
  direction?: SortDirection
  disabled?: boolean
}

const strategyByDirection: Record<SortDirection, typeof verticalListSortingStrategy> = {
  vertical: verticalListSortingStrategy,
  horizontal: horizontalListSortingStrategy,
}

const SortableList = <T extends UniqueIdentifier>({
  items,
  onReorder,
  children,
  direction = 'vertical',
  disabled = false,
}: SortableListProps<T>) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  if (disabled) {
    return <>{children}</>
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return
        const oldIndex = items.indexOf(active.id as T)
        const newIndex = items.indexOf(over.id as T)
        if (oldIndex < 0 || newIndex < 0) return
        onReorder(arrayMove(items, oldIndex, newIndex))
      }}
    >
      <SortableContext items={items} strategy={strategyByDirection[direction]}>{children}</SortableContext>
    </DndContext>
  )
}

export default SortableList
