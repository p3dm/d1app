ANDROID REMOTE RENDEZVOUS + COTURN
==================================

Architecture
------------
- Node.js listens on TCP 8443 for WebSocket signaling.
- coturn listens on UDP/TCP 3478 and on TCP/UDP 443 as an auxiliary endpoint.
- Native Host uses TURN/UDP 3478; browser Viewer uses TURN/TCP 443. Both relay
  allocations still meet inside the same coturn process.
- coturn relays media only when ICE cannot establish a direct path.
- Rendezvous generates short-lived coturn REST credentials per session. The
  TURN shared secret never ships inside the desktop application.

Required firewall ports
-----------------------
  TCP 8443             rendezvous PoC (use WSS/443 for production)
  UDP 3478             TURN/STUN, preferred low-latency transport
  TCP 3478             TURN fallback when UDP to the VPS is blocked
  TCP 443              browser Viewer TURN transport on restrictive networks
  UDP 443              optional TURN/STUN alternative
  UDP 49160:49200       coturn relay allocations

Install coturn (Ubuntu/Debian)
------------------------------
  apt update
  apt install -y coturn
  openssl rand -hex 32

Copy turnserver.conf.example to /etc/turnserver.conf and replace:
  CHANGE_ME_VPS_PUBLIC_IP
  CHANGE_ME_LONG_RANDOM_SECRET

Create the restricted service account if it does not already exist:
  id -u androidremote >/dev/null 2>&1 || useradd --system --home /opt/android-remote --shell /usr/sbin/nologin androidremote

Create /etc/android-remote.env. TURN_SHARED_SECRET must exactly match coturn's
static-auth-secret:

  TURN_URLS=turn:VPS_PUBLIC_IP:3478?transport=udp,turn:VPS_PUBLIC_IP:443?transport=tcp
  TURN_SHARED_SECRET=THE_SAME_LONG_RANDOM_SECRET
  TURN_CREDENTIAL_TTL_SECONDS=86400
  TURN_ICE_TRANSPORT_POLICY=all

Protect the environment file and start both services:
  chmod 600 /etc/android-remote.env
  install -d -m 755 /etc/systemd/system/coturn.service.d
  cp /opt/android-remote/coturn-android-remote.conf /etc/systemd/system/coturn.service.d/android-remote.conf
  cp /opt/android-remote/android-remote.service /etc/systemd/system/android-remote.service
  systemctl daemon-reload
  systemctl enable --now coturn
  systemctl enable --now android-remote

Open UFW and the VPS provider firewall/security group:
  ufw allow 8443/tcp
  ufw allow 3478/udp
  ufw allow 3478/tcp
  ufw allow 443/udp
  ufw allow 443/tcp
  ufw allow 49160:49200/udp

Verify listeners and logs:
  ss -lntup | grep -E ':(3478|8443)'
  journalctl -u coturn -u android-remote -n 100 --no-pager

Expected server logs:
  [STUN] built-in server disabled; coturn should serve STUN/TURN
  [TURN] ephemeral credentials enabled for turn:VPS_PUBLIC_IP:3478?transport=udp, ...
  [RENDEZVOUS] ws://127.0.0.1:8443/rendezvous

The desktop STUN field may use:
  stun:VPS_PUBLIC_IP:3478

Connection verification
-----------------------
The Viewer log reports the selected candidate pair:
  (direct)       video does not pass through the VPS
  (TURN relay)   video passes through coturn on the VPS

To prove the relay works independently of NAT, temporarily set this in
/etc/android-remote.env and restart android-remote:
  TURN_ICE_TRANSPORT_POLICY=relay

Both peers must then gather/select relay candidates and Viewer must report
"TURN relay". Restore `all` afterward so ICE can use a faster direct path.

For production, terminate TLS at nginx, use wss:// for signaling, and monitor
VPS UDP packet loss, bandwidth, and relay-port exhaustion. TURN does not store,
decode, or transcode video.
