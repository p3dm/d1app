import './style.css'
import { RemoteDevice, type RemoteDeviceCallbacks } from './remote-device'
import { WebRtcClient, type ConnectionStatusState } from './webrtc-client'

function element<T extends Element>(selector: string, root: ParentNode = document): T {
  const value = root.querySelector<T>(selector)
  if (!value) throw new Error(`Missing element: ${selector}`)
  return value
}

class DeviceCard {
  readonly serial: string
  readonly root: HTMLElement
  readonly #client: WebRtcClient
  readonly #status: HTMLElement
  readonly #canvas: HTMLCanvasElement
  readonly #focusVideo: HTMLVideoElement
  readonly #placeholder: HTMLElement
  readonly #navButtons: HTMLButtonElement[]
  readonly #textInput: HTMLInputElement
  readonly #sendTextButton: HTMLButtonElement
  readonly #focusButton: HTMLButtonElement
  readonly #controlHint: HTMLElement
  readonly #remote: RemoteDevice
  #focused = false
  #streaming = false
  #controlAuthorized = false

  constructor(
    serial: string,
    template: HTMLTemplateElement,
    mountPoint: HTMLElement,
    client: WebRtcClient,
    onToggleFocus: (serial: string) => void
  ) {
    this.serial = serial
    this.#client = client
    const fragment = template.content.cloneNode(true) as DocumentFragment
    this.root = element<HTMLElement>('.device-card', fragment)
    element<HTMLElement>('.device-serial', this.root).textContent = serial
    this.#status = element<HTMLElement>('.device-status', this.root)
    this.#canvas = element<HTMLCanvasElement>('.screen', this.root)
    this.#canvas.setAttribute('aria-label', `Màn hình Android ${serial}`)
    this.#focusVideo = element<HTMLVideoElement>('.focus-screen', this.root)
    this.#focusVideo.setAttribute('aria-label', `Màn hình Focus Android ${serial}`)
    this.#placeholder = element<HTMLElement>('.placeholder', this.root)
    this.#navButtons = [...this.root.querySelectorAll<HTMLButtonElement>('[data-keycode]')]
    const textForm = element<HTMLFormElement>('.text-form', this.root)
    this.#textInput = element<HTMLInputElement>('.text-input', this.root)
    this.#sendTextButton = element<HTMLButtonElement>('.send-text', this.root)
    this.#focusButton = element<HTMLButtonElement>('.focus-toggle', this.root)
    this.#controlHint = element<HTMLElement>('.control-hint', this.root)
    mountPoint.append(this.root)

    const callbacks: RemoteDeviceCallbacks = {
      status: (text, state) => this.#setStatus(text, state),
      log: (text) => console.log(`[${serial}] ${text}`),
      streaming: () => {
        this.#streaming = true
        this.#placeholder.hidden = true
        // A final grid frame can finish decoding after the Focus RTP stream
        // has already been attached. Do not let that stale callback reveal
        // the thumbnail canvas beside the focused video.
        this.#canvas.hidden = Boolean(this.#focusVideo.srcObject)
        this.#refreshControls()
        this.#setStatus(this.#focused ? 'Đang phát chất lượng cao' : 'Thumbnail trực tiếp', 'ok')
      },
      disconnected: () => {
        this.#streaming = false
        this.#controlAuthorized = false
        this.#refreshControls()
        this.#canvas.hidden = true
        this.#placeholder.hidden = false
      },
      controlState: (enabled) => {
        this.#controlAuthorized = enabled
        this.#refreshControls()
        if (enabled) this.#setStatus('Focus · điều khiển đã bật', 'ok')
      }
    }
    this.#remote = new RemoteDevice(this.#canvas, this.#focusVideo, callbacks, (message) => {
      // Decoder recovery is safe in grid mode. User input must still be
      // accepted only for the focused device after Host authorization.
      if (message.type === 'request-keyframe' || (this.#focused && this.#controlAuthorized)) {
        this.#client.sendControl(this.serial, message)
      }
    })
    this.#client.registerDevice(serial, this.#remote)

    this.root.addEventListener('dblclick', (event) => {
      if ((event.target as Element).closest('button, input')) return
      onToggleFocus(this.serial)
    })
    this.#focusButton.addEventListener('click', () => onToggleFocus(this.serial))
    this.#navButtons.forEach((button) =>
      button.addEventListener('click', () => {
        this.#remote.send({ type: 'key', action: 'press', keyCode: Number(button.dataset.keycode) })
      })
    )
    textForm.addEventListener('submit', (event) => {
      event.preventDefault()
      if (!this.#textInput.value) return
      this.#remote.send({ type: 'text', text: this.#textInput.value })
      this.#textInput.select()
    })
    this.#canvas.hidden = true
    this.#refreshControls()
  }

  #setStatus(text: string, state: ConnectionStatusState): void {
    this.#status.textContent = text
    this.#status.dataset.state = state
  }

  #refreshControls(): void {
    const enabled = this.#focused && this.#streaming && this.#controlAuthorized
    this.#navButtons.forEach((button) => {
      button.disabled = !enabled
    })
    this.#sendTextButton.disabled = !enabled
    this.#textInput.disabled = !enabled
    this.#controlHint.textContent = enabled
      ? 'Đang chọn · có thể chạm và điều khiển'
      : 'Double-click để phóng to và bật điều khiển'
  }

  setFocused(focused: boolean): void {
    this.#focused = focused
    this.root.classList.toggle('is-focused', focused)
    this.root.setAttribute('aria-selected', String(focused))
    this.#focusButton.textContent = focused ? 'Thu nhỏ' : 'Phóng to'
    this.#focusButton.setAttribute('aria-label', focused ? 'Thu nhỏ thiết bị' : 'Phóng to thiết bị')
    this.#refreshControls()
    if (this.#streaming) {
      this.#setStatus(
        focused ? 'Đang chuyển sang Focus…' : 'Thumbnail trực tiếp',
        focused ? 'busy' : 'ok'
      )
    }
    if (focused) this.root.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  dispose(): void {
    this.#client.unregisterDevice(this.serial, this.#remote)
    this.#remote.disconnect()
    this.root.remove()
  }
}

const pageStatus = element<HTMLElement>('#status')
const emptyState = element<HTMLElement>('#empty-state')
const grid = element<HTMLElement>('#device-grid')
const template = element<HTMLTemplateElement>('#device-template')
const cards = new Map<string, DeviceCard>()
let focusedSerial: string | undefined

function setPageStatus(text: string, state: ConnectionStatusState): void {
  pageStatus.textContent = text
  pageStatus.dataset.state = state
}

function setFocusedDevice(serial?: string): void {
  if (serial === focusedSerial) serial = undefined
  const previous = focusedSerial
  focusedSerial = serial
  if (previous) cards.get(previous)?.setFocused(false)
  if (serial) {
    cards.get(serial)?.setFocused(true)
    client.selectDevice(serial)
  } else if (previous) {
    client.clearSelection(previous)
  }
}

function syncDevices(serials: string[]): void {
  const wanted = new Set(serials)
  for (const [serial, card] of cards) {
    if (wanted.has(serial)) continue
    if (focusedSerial === serial) focusedSerial = undefined
    card.dispose()
    cards.delete(serial)
  }
  for (const serial of serials) {
    if (cards.has(serial)) continue
    cards.set(serial, new DeviceCard(serial, template, grid, client, setFocusedDevice))
  }
  emptyState.hidden = cards.size > 0
  setPageStatus(`${cards.size} thiết bị ADB · WebRTC`, cards.size ? 'ok' : 'idle')
}

const params = new URLSearchParams(location.search)
const signalUrl = params.get('signal') ?? ''
const sessionId = params.get('session') ?? ''
const sessionSecret = params.get('secret') ?? ''
const client = new WebRtcClient(
  {
    devices: syncDevices,
    status: setPageStatus,
    log: (text) => console.log(text)
  },
  { url: signalUrl, sessionId, sessionSecret }
)

if (!('VideoDecoder' in window)) {
  setPageStatus('Máy này không hỗ trợ hardware VideoDecoder', 'error')
} else if (!signalUrl || !sessionId || !sessionSecret) {
  setPageStatus('Thiếu thông tin phiên WebRTC từ ứng dụng', 'error')
} else {
  client.connect()
}

window.addEventListener('pagehide', () => {
  client.close()
  for (const card of cards.values()) card.dispose()
  cards.clear()
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && focusedSerial) setFocusedDevice()
})
