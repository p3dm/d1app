import type { ControlMessage, TouchMessage } from '../../shared/protocol'

export class RemoteController {
  readonly #activePointers = new Set<number>()
  #pendingMove?: TouchMessage
  #moveFrame?: number

  constructor(
    readonly canvas: HTMLElement,
    readonly send: (message: ControlMessage) => void
  ) {
    canvas.addEventListener('pointerdown', this.#onPointer)
    canvas.addEventListener('pointermove', this.#onPointer)
    canvas.addEventListener('pointerup', this.#onPointer)
    canvas.addEventListener('pointercancel', this.#onPointer)
    canvas.addEventListener('contextmenu', this.#onContextMenu)
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.#onPointer)
    this.canvas.removeEventListener('pointermove', this.#onPointer)
    this.canvas.removeEventListener('pointerup', this.#onPointer)
    this.canvas.removeEventListener('pointercancel', this.#onPointer)
    this.canvas.removeEventListener('contextmenu', this.#onContextMenu)
    if (this.#moveFrame !== undefined) cancelAnimationFrame(this.#moveFrame)
    this.#moveFrame = undefined
    this.#pendingMove = undefined
    this.#activePointers.clear()
  }

  readonly #onContextMenu = (event: Event): void => event.preventDefault()

  readonly #onPointer = (event: PointerEvent): void => {
    event.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))

    if (event.type === 'pointerdown') {
      this.#activePointers.add(event.pointerId)
      this.canvas.setPointerCapture(event.pointerId)
      this.send({
        type: 'touch',
        action: 'down',
        pointerId: event.pointerId,
        x,
        y,
        buttons: event.buttons || 1
      })
      return
    }
    if (!this.#activePointers.has(event.pointerId)) return
    if (event.type === 'pointermove') {
      this.#pendingMove = {
        type: 'touch',
        action: 'move',
        pointerId: event.pointerId,
        x,
        y,
        buttons: event.buttons || 1
      }
      if (this.#moveFrame === undefined) {
        this.#moveFrame = requestAnimationFrame(() => {
          this.#moveFrame = undefined
          if (this.#pendingMove) this.send(this.#pendingMove)
          this.#pendingMove = undefined
        })
      }
      return
    }
    this.#activePointers.delete(event.pointerId)
    this.#pendingMove = undefined
    this.send({ type: 'touch', action: 'up', pointerId: event.pointerId, x, y, buttons: 0 })
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId)
  }
}
