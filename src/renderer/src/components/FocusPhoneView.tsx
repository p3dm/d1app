import { useMemo, useState, type JSX } from 'react'
import type { WebRtcClient } from '../../../main/web/src/webrtc-client'
import type { ControlMessage } from '../../../main/shared/protocol'
import DeviceStream from './DeviceStream'
import type { PhoneGridDevice } from './PhoneGrid'

interface FocusedPhoneViewProps {
  device: PhoneGridDevice
  remoteClient: WebRtcClient
  onClose: () => void
}

interface Command {
  id: string
  label: string
  hint?: string
  icon: string
  danger?: boolean
}

const COMMANDS: Command[] = [
  {
    id: 'change-number',
    label: 'Change Number',
    hint: '#NUM',
    icon: '#'
  },
  {
    id: 'change-name',
    label: 'Change Name',
    hint: 'EDIT',
    icon: '✎'
  },
  {
    id: 'restart',
    label: 'Restart Device',
    hint: 'REBOOT',
    icon: '↻'
  },
  {
    id: 'install-apk',
    label: 'Install APK',
    hint: 'FAST',
    icon: '⇩'
  },
  {
    id: 'import-file',
    label: 'Import File',
    hint: 'SCP',
    icon: '⇩'
  },
  {
    id: 'export-file',
    label: 'Export File',
    hint: 'PULL',
    icon: '⇧'
  },
  {
    id: 'adb-console',
    label: 'ADB Console',
    hint: '>',
    icon: '>_'
  },
  {
    id: 'execute-task',
    label: 'Execute Task',
    icon: '▶'
  },
  {
    id: 'end-task',
    label: 'End Task',
    hint: 'KILL',
    icon: '×',
    danger: true
  }
]

export default function FocusedPhoneView({
  device,
  remoteClient,
  onClose
}: FocusedPhoneViewProps): JSX.Element {
  const [search, setSearch] = useState('')

  const filteredCommands = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return COMMANDS
    }

    return COMMANDS.filter((command) => command.label.toLowerCase().includes(query))
  }, [search])

  const sendKey = (keyCode: number): void => {
    const message: ControlMessage = {
      type: 'key',
      action: 'press',
      keyCode
    }

    remoteClient.sendControl(device.id, message)
  }

  const executeCommand = (commandId: string): void => {
    /*
     * Chỗ này để nối với command protocol thật của project.
     *
     * Ví dụ sau này:
     *
     * remoteClient.sendControl(device.id, {
     *   type: 'command',
     *   command: commandId
     * })
     *
     * Hiện tại chưa tự ý tạo ControlMessage mới
     * vì protocol hiện tại của bạn chưa được cung cấp.
     */
    console.debug('[FocusedPhoneView] command:', commandId, 'device:', device.id)
  }

  return (
    <section className="focused-phone-view">
      {/* =====================================================
          LEFT: PHONE
          ===================================================== */}
      <div className="focused-phone-stage">
        <div className="focused-phone-device">
          <div className="focused-phone-device-header">
            <div className="focused-phone-device-info">
              <span className="focused-phone-device-index">
                {device.id.slice(0, 2).toUpperCase()}
              </span>

              <div>
                <strong>{device.model ?? device.id}</strong>

                <span>{device.connectionTag ?? 'NODE'}</span>
              </div>
            </div>

            <button
              type="button"
              className="focused-phone-close"
              onClick={onClose}
              title="Close Panel"
              aria-label="Close focused phone"
            >
              ✕
            </button>
          </div>

          <DeviceStream device={device} remoteClient={remoteClient} focused />

          <div className="focused-phone-device-footer">
            <span>{device.ip ?? device.id}</span>

            <span className="focused-phone-stream-indicator">● LIVE</span>
          </div>
        </div>
      </div>

      {/* =====================================================
          RIGHT: CONTROL PANEL
          ===================================================== */}
      <aside className="focused-phone-control">
        <header className="focused-phone-control-header">
          <div className="focused-phone-control-device">
            <span className="focused-phone-control-index">
              {device.id.slice(0, 2).toUpperCase()}
            </span>

            <div>
              <strong>{device.model ?? device.id}</strong>

              <span>{device.connectionTag ?? 'NODE'}</span>
            </div>
          </div>

          <button
            type="button"
            className="focused-phone-control-close"
            onClick={onClose}
            title="Close Panel"
          >
            ✕
          </button>
        </header>

        {/* Search */}
        <div className="focused-phone-search">
          <div className="focused-phone-search-box">
            <span aria-hidden="true">⌕</span>

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search functions..."
              aria-label="Search functions"
            />

            <kbd>⌘K</kbd>
          </div>
        </div>

        {/* Command section */}
        <div className="focused-phone-command-header">
          <span>
            <b>✳</b>
            COMMAND OPS
          </span>

          <span className="focused-phone-active">
            <i />
            ACTIVE
          </span>
        </div>

        {/* Commands */}
        <div className="focused-phone-command-list">
          {filteredCommands.map((command) => (
            <button
              key={command.id}
              type="button"
              className={
                command.danger
                  ? 'focused-phone-command focused-phone-command-danger'
                  : 'focused-phone-command'
              }
              onClick={() => executeCommand(command.id)}
            >
              <span className="focused-phone-command-icon">{command.icon}</span>

              <span className="focused-phone-command-label">{command.label}</span>

              {command.hint ? (
                <small>{command.hint}</small>
              ) : command.id === 'execute-task' ? (
                <i className="focused-phone-command-live" />
              ) : null}
            </button>
          ))}
        </div>

        {/* Bottom dock */}
        <footer className="focused-phone-control-footer">
          <div className="focused-phone-apps-header">
            <strong>
              <span>◆</span>
              APPS DOCK
            </strong>

            <div>
              <button type="button" title="Sync App List">
                ↻
              </button>

              <button type="button" title="More Options">
                •••
              </button>
            </div>
          </div>

          <div className="focused-phone-control-nav">
            <button type="button" onClick={() => sendKey(187)} title="Recents">
              □
            </button>

            <button type="button" onClick={() => sendKey(3)} title="Home">
              ○
            </button>

            <button type="button" onClick={() => sendKey(4)} title="Back">
              ◁
            </button>
          </div>
        </footer>
      </aside>
    </section>
  )
}
