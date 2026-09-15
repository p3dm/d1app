import React from 'react'

interface PhoneSharedSetupProps {
  invite: string
  status: string
  onInviteChange: (value: string) => void
  onConnect: () => void
}

export default function PhoneSharedSetup({
  invite,
  status,
  onInviteChange,
  onConnect
}: PhoneSharedSetupProps): React.JSX.Element {
  return (
    <section className="remote-share-setup">
      <p className="remote-share-eyebrow">Remote connection</p>
      <h2 className="remote-share-title">Kết nối tới Host</h2>
      <p className="remote-share-description">
        Nhập mã kết nối được chia sẻ từ máy Host để xem và điều khiển các phone.
      </p>
      <label>
        Mã kết nối từ Host
        <textarea
          className="input remote-share-invite-input"
          value={invite}
          onChange={(event) => onInviteChange(event.target.value)}
          placeholder="Dán mã kết nối tại đây"
          spellCheck={false}
        />
      </label>
      <button className="btn btn-primary" onClick={onConnect} disabled={!invite.trim()}>
        Kết nối
      </button>
      {status ? <div className="remote-share-status">{status}</div> : null}
    </section>
  )
}
