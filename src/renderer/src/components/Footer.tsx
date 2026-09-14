export default function Footer({
  adb = { host: '127.0.0.1:5037', connected: true },
  scrcpy = { version: 'v2.4', mode: 'Ultra-Low Latency' },
  packetLoss = '0.00%',
  network = '1.2 Gbps OTG Hub',
  systemReady = true,
  systemLabel = 'MATRIX READY'
}) {
  return (
    <footer className="app-footer" data-purpose="footer-telemetry">
      <div className="app-footer-left">
        <div className="app-footer-service">
          <span
            className={`app-footer-status-dot ${
              adb.connected ? 'app-footer-status-dot-connected' : 'app-footer-status-dot-disconnected'
            }`}
          />
          <span className="app-footer-label">ADB Server:</span>
          <span className="app-footer-value">{adb.host}</span>
          <span
            className={`app-footer-state ${
              adb.connected ? 'app-footer-state-connected' : 'app-footer-state-disconnected'
            }`}
          >
            {adb.connected ? '(Connected)' : '(Disconnected)'}
          </span>
        </div>

        <span className="app-footer-separator">•</span>

        <div className="app-footer-meta">
          <span className="app-footer-label">Scrcpy Engine:</span>
          <span className="app-footer-value">{scrcpy.version}</span>
          <span className="app-footer-meta-mode">({scrcpy.mode})</span>
        </div>
      </div>

      <div className="app-footer-right">
        <div className="app-footer-metric">
          <span className="app-footer-label">Packet Loss:</span>
          <span className="app-footer-value app-footer-value-strong">{packetLoss}</span>
        </div>

        <div className="app-footer-metric">
          <span className="app-footer-label">Network:</span>
          <span className="app-footer-value app-footer-value-strong">{network}</span>
        </div>

        <div
          className={`app-footer-system ${
            systemReady ? 'app-footer-system-ready' : 'app-footer-system-error'
          }`}
        >
          <span
            className={`app-footer-status-dot ${
              systemReady
                ? 'app-footer-status-dot-connected app-footer-status-dot-pulse'
                : 'app-footer-status-dot-disconnected'
            }`}
          />
          {systemLabel}
        </div>
      </div>
    </footer>
  )
}
 