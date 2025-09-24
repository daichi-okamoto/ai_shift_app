import type { DraggableAttributes } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'

type RenderProps = {
  setNodeRef: (element: HTMLElement | null) => void
  attributes: DraggableAttributes
  listeners: Record<string, unknown> | undefined
  style: React.CSSProperties
  isDragging: boolean
}

export type SortableItemProps = {
  id: string | number
  disabled?: boolean
  children?: ReactNode | ((props: RenderProps) => ReactNode)
}

const SortableItem = ({ id, disabled, children }: SortableItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.6 : undefined,
  }

  if (typeof children === 'function') {
    return children({ setNodeRef, attributes, listeners, style, isDragging }) ?? null
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...(listeners ?? {})}>
      {children}
    </div>
  )
}

export default SortableItem
