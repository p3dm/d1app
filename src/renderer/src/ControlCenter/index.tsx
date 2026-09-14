import React, { useState } from 'react'
import PhoneGrid, { SAMPLE_DEVICES } from '../components/PhoneGrid'

function ControlCenter(): React.JSX.Element {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(SAMPLE_DEVICES[0]?.id ?? null)

  const selectedDevice = SAMPLE_DEVICES.find((device) => device.id === selectedDeviceId) ?? null

  return (
    <section className="section control-center">
      <PhoneGrid
        devices={SAMPLE_DEVICES}
        onSelectDevice={(device) => setSelectedDeviceId(device.id)}
      />
    </section>
  )
}

export default ControlCenter