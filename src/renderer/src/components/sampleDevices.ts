export const SAMPLE_DEVICES = [
  { id: '01', model: 'Pixel 3a', ip: '192.168.4.116', apps: ['YT', 'FB', 'TT'] },
  { id: '02', model: 'SM-A505F', ip: '192.168.5.147' },
  { id: '03', model: 'SM-G998B', ip: '192.168.4.234' },
  { id: '04', model: 'M2007J20', ip: '192.168.5.121' },
  { id: '05', model: 'CPH2139', ip: '192.168.5.23' },
  { id: '06', model: 'RMX2185', ip: '192.168.5.192' },
  { id: '07', model: 'G301', ip: '192.168.5.22' },
  {
    id: '08',
    model: 'Pixel 5',
    ip: '192.168.5.37',
    isControlled: true,
    controlledLabel: 'Master mirror active',
    toolbarActive: [0, 1]
  },
  { id: '09', model: 'SM-A315F', ip: '192.168.5.72' },
  { id: '10', model: 'SM-A107F', ip: '192.168.5.158' },
  { id: '11', model: 'SM-E625F', ip: '192.168.5.87' },
  { id: '12', model: 'YAL-L21', ip: '192.168.4.250' },
  { id: '13', model: 'Redmi 9', ip: '192.168.5.92' },
  { id: '14', model: 'GT20', ip: '192.168.4.50' },
  { id: '15', model: 'SM-G973F', ip: '192.168.5.4' },
  { id: '16', model: 'Vivo 1818', ip: '192.168.4.182' }
]

export const SAMPLE_DEVICE_GRID = [
  { id: '01', status: 'rented', group: 'Group ig' },
  { id: '02', status: 'rented', group: 'Group ig' },
  { id: '03', status: 'available' },
  { id: '04', status: 'available' },
  { id: '05', status: 'available' },
  { id: '06', status: 'available' },
  { id: '07', status: 'available' },
  { id: '08', status: 'available' },
  { id: '09', status: 'rented', group: 'proxy-vn' },
  { id: '10', status: 'rented', group: 'proxy-vn' },
  { id: '11', status: 'rented', group: 'proxy-vn' },
  { id: '12', status: 'rented', group: 'proxy-vn' },
  { id: '13', status: 'available' },
  { id: '14', status: 'rented', group: 'cloudfarm' },
  { id: '15', status: 'available' },
  { id: '16', status: 'available' },
  { id: '17', status: 'available' },
  { id: '18', status: 'available' },
  { id: '19', status: 'available' }
]

export const SAMPLE_SESSIONS = [
  {
    id: 'tiktok-alpha',
    name: 'TikTok Nurture Alpha Fleet',
    email: 'trader.mmo88@gmail.com',
    deviceLabel: 'Node 08 (Pixel 5)',
    phoneCount: 1,
    daysLeft: 18,
    progress: 60,
    expDate: '28/10/2026',
    expTime: '23:59 UTC',
    status: 'ok'
  },
  {
    id: 'proxy-vn',
    name: 'Proxy VN Farming Cluster',
    email: 'vuthe.ops@gmail.com',
    deviceLabel: 'Devices 09, 10, 11, 12',
    phoneCount: 4,
    daysLeft: 5,
    progress: 25,
    expDate: '15/10/2026',
    expTime: '23:59 UTC',
    status: 'warn'
  },
  {
    id: 'ig-affiliate',
    name: 'IG Affiliate Booster #02',
    email: 'marketing.lead@agency.co',
    deviceLabel: 'Group ig (01, 02)',
    phoneCount: 2,
    daysLeft: 2,
    progress: 10,
    expDate: '12/10/2026',
    expTime: '23:59 UTC',
    status: 'danger'
  },
  {
    id: 'shopee-live',
    name: 'Shopee Live Automation X',
    email: 'cloudfarm.test@gmail.com',
    deviceLabel: 'Device 14 (SM-G973U)',
    phoneCount: 1,
    daysLeft: 27,
    progress: 90,
    expDate: '06/11/2026',
    expTime: '23:59 UTC',
    status: 'ok'
  }
]
