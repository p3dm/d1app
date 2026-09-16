import { useEffect, useRef, useState, type JSX } from 'react'
import { RemoteDevice } from '../../../main/web/src/remote-device'
import type { WebRtcClient } from '../../../main/web/src/webrtc-client'
import type { ControlMessage } from '../../../main/shared/protocol'
import type { PhoneGridDevice } from './PhoneGrid'

interface DeviceStreamProps {
  device: PhoneGridDevice
  remoteClient: WebRtcClient
  focused?: boolean
}

export default function DeviceStream({
  device,
  remoteClient,
  focused = false
}: DeviceStreamProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [status, setStatus] = useState('Đang chờ stream...')

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) {
      return
    }

    const remote = new RemoteDevice(
      canvasRef.current,
      videoRef.current,
      {
        status: (text) => setStatus(text),

        log: () => undefined,

        streaming: () => {
          setStatus('Đang phát trực tiếp')
        },

        disconnected: () => {
          setStatus('Đã ngắt kết nối')
        },

        controlState: (enabled) => {
          setStatus(enabled ? 'Đang điều khiển' : 'Đã kết nối')
        }
      },
      (message) => {
        remoteClient.sendControl(device.id, message)
      }
    )

    remoteClient.registerDevice(device.id, remote)

    return () => {
      remoteClient.unregisterDevice(device.id, remote)
      remote.disconnect()
    }
  }, [device.id, remoteClient])

  const sendKey = (keyCode: number): void => {
    const message: ControlMessage = {
      type: 'key',
      action: 'press',
      keyCode
    }

    remoteClient.sendControl(device.id, message)
  }

  return (
    <div className={`device-stream${focused ? ' device-stream-focused' : ''}`}>
      <canvas ref={canvasRef} aria-label={`Màn hình ${device.id}`} />

      <video ref={videoRef} autoPlay muted playsInline />

      <span className="device-stream-status">{status}</span>

      {focused ? (
        <div className="device-stream-navigation" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => sendKey(187)} title="Recents">
            |||
          </button>

          <button type="button" onClick={() => sendKey(3)} title="Home">
            ○
          </button>

          <button type="button" onClick={() => sendKey(4)} title="Back">
            &lt;
          </button>
        </div>
      ) : null}
    </div>
  )
}
