ANDROID REMOTE WEBRTC - DIRECT + TURN FALLBACK
===============================================

1. Chay AndroidRemote.exe tren ca may A va may B.
2. May A cam phone, bat USB debugging va bam "Bat dau chia se".
3. May A sao chep ma ket noi va gui cho may B.
4. May B dan ma, bam "Ket noi Host".

Mac dinh:
- Rendezvous: ws://103.6.235.189:8443/rendezvous
- STUN/TURN: coturn tren VPS cong 3478
- ICE thu direct truoc va tu dong fallback TURN neu NAT kho
- TURN credential ngan han do rendezvous cap, khong can nhap trong app
- Video H264: toi da 1024px, 24 FPS, 2 Mbps, keyframe moi 1 giay
- Video cu bi bo khi buffer day de tranh tich luy do tre

VPS can mo:
- TCP 8443
- UDP va TCP 3478
- UDP 49160-49200

Viewer log "(direct)" nghia la video khong qua VPS.
Viewer log "(TURN relay)" nghia la video dang qua coturn tren VPS.

Khong mo cong ADB 5037 hoac 5555 truc tiep ra Internet. Ma ket noi la mat
khau cua phien; chi gui cho nguoi duoc phep dieu khien dien thoai.
