---
name: Legacy PHP power-automation system
description: Reverse-engineered legacy MSSQL + CodeIgniter hotel power/relay control app being rebuilt in Node/React/Postgres. Domain model, device protocol, and known gaps.
---

# Legacy "mpower" power-automation system (being rebuilt)

Source: CodeIgniter PHP + MSSQL (external instance). Rebuild target: Node/TS + React PWA + PostgreSQL, multi-tenant, ESP32 16-channel relay boards.

## Domain model (MSSQL tables)
- Multi-tenant via `Hotel_Id` (property) on nearly every table.
- Hierarchy: `Mas_Hotel` → `Mas_Block` → `Mas_Floor` → `Mas_Room` (+ `Mas_RoomType`).
- `Mas_Device` = a relay box: `Device` (6-char code), `IP`, `Floor_Id`, `StUpdate` (heartbeat), `Dev_status`. Adding a device auto-creates **16 `Mas_Control` rows**: 8 on Slate 1, 8 on Slate 2 (so 16 relays/box, two 8-bit "slates").
- `Mas_Control` = one physical relay: `Control` (1-8 within slate), `Slate` (1|2), `Device`, `Room_Id`, `ControlType_Id`, `State` (0/1).
- `Mas_ControlType` = LOAD type on a relay (Light, AC, Heater, Outdoor Lights) — NOT the process/action.
- `Mas_Status` = the process/action AND room status: Checkin, Checkout, Cleaning, Maintenance, Visiting, MD Checkin, Bypass On/Off, BOX ON/OFF. `Flag=1` marks a user-selectable process.
- `Mas_Process` = configurable auto-cutoff master: `Process_Id`→`Mas_Status.Status_Id`, `Ptime` (cutoff **minutes**), `IsAuto` (1=auto power-off). E.g. Cleaning Ptime=5 IsAuto=1; Checkout Ptime=4320 IsAuto=0.
- `PowerLog` = command queue + audit trail: `Controlpush`/`Controlpull` (hex bitmask cmds like `*0X0F`/`$0X00`), `Status_Id`, `State`, `RandomNo` (ack token), `FLAG`, timestamps `Rdate`/`Recevied`/`Ofdate`/`Closed`, `Update_Status`.

## Device communication protocol (legacy = POLL-based, not push)
- Any state change rebuilds the **entire per-slate on/off bitmask**, converts to hex, and INSERTs a push/pull pair into `PowerLog` (proc `Exec_Powerpush`).
- ESP32 polls `Api/PowerDeviceApi/<device>` → gets `Device+push+pull#RRRR+` (RRRR=RandomNo). Applies it, then calls `Api/PowerDeviceStatusApi/<device>/<RRRR>` to ack (sets `Update_Status=1,FLAG=1,Closed=now`).
- Online/offline = heartbeat freshness: `datediff(minute, StUpdate, now) > 1` ⇒ Offline. `Get_Device_Status` even injects BOX ON/OFF PowerLog rows on transitions.
- HMS entry point (legacy): `Api/PowerApi/<roomNo>/<state>/.../<statusId>/<ctrl>` — GET-based, looks up room by number, flips relays. HMS was never actually linked; front-office/HMS team will integrate against whatever API we expose.

## CRITICAL GAP: auto-cutoff is NOT implemented in the DB
- `Mas_Process.Ptime`/`IsAuto` exist, but there is **no SQL Agent job** and no stored proc that expires them (only default `syspolicy_purge_history` jobs exist). The countdown/auto-power-off is either missing or was driven by an external PHP cron we don't have.
- **Rebuild must implement the cutoff engine properly**: per-active-session countdown timers, independent per room/control so overlapping processes (e.g. cleaning timer while maintenance runs) don't clobber each other.

## Rebuild decisions (agreed direction, not yet built)
- Node/TS backend (event/timer-heavy poll-ack workload) over Python.
- Move device layer from HTTP-poll to **MQTT** (per-box topic, LWT for online/offline, per-relay commands instead of full-bitmask rewrites to avoid races). Keep REST for HMS-facing webhooks with per-property API keys.
- Postgres, tenant-scoped from day one. React PWA (hybrid/installable) for front-desk.
- User pasted the `sa` password in plain chat once — advised them to rotate it; never echo/store credentials.
