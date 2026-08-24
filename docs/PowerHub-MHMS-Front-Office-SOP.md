# PowerHub × MHMS — Power Automation SOP
**Property:** Hotel Vinayak &nbsp;|&nbsp; **Device:** Relay Box 000010 &nbsp;|&nbsp; **Date:** 21 July 2026
**Canonical M‑HMS source:** `https://github.com/MicrogennSenthil/Final-M-HMS-Running07082026` (`main`)

This document explains what happens automatically when the front office performs actions in MHMS, what PowerHub (the automation system) does, and what the front office team is responsible for.

---

## 1. How it works (one line)

> Front office works **only inside MHMS** as usual. MHMS informs PowerHub, PowerHub switches the room's power within a few seconds, and (for timed processes) switches it OFF automatically when the timer ends.

Front office never has to operate switches manually, and never opens PowerHub for day-to-day work.

---

## 2. Process behaviour table

| MHMS Action | Room Type | Power ON | Power OFF | Timer |
|---|---|---|---|---|
| **Check-in / Walk-in** | AC room | Light **+ AC** together | — | No timer (stays ON till checkout) |
| **Check-in / Walk-in** | Non-AC room | Light **only** (AC stays OFF) | — | No timer |
| **Check-out** | AC room | — | Light **+ AC** both cut off | Immediate |
| **Check-out** | Non-AC room | — | Light cut off (AC was never ON) | Immediate |
| **Visiting** | Any | Light + AC (as per room type) | Automatic | **10 minutes**, then auto cut-off |
| **Cleaning** | Any | Light (+ AC if AC room) | Automatic | **30 minutes**, then auto cut-off |
| **Maintenance** | Any | As required | Automatic | **60 minutes**, then auto cut-off |
| **MD Check-in** | Any | Light + AC | Automatic | **120 minutes**, then auto cut-off |

- Only **Check-in** and **Check-out** are permanent (no timer). Every other process cuts off power automatically when its time ends.
- Timer durations are set in PowerHub → **Process Master** and can be changed by the admin at any time (no code change needed).

---

## 3. PowerHub's role (the system — automatic, no human action)

1. Receives every command from MHMS instantly and queues it for the relay box.
2. The relay box in the hotel picks up commands within **~4 seconds** and switches the actual relays.
3. Starts a **power session** whenever a control turns ON — recording room, guest name, GRC/Bill number, who requested it, and the wattage at that moment.
4. Runs the **auto cut-off timer**: every 30 seconds it checks all timed processes (Visiting, Cleaning, Maintenance, MD Check-in) and sends OFF commands the moment their time expires. No one needs to remember to switch off.
5. Calculates **electricity consumption and cost** (wattage × hours ON × tariff) for reports.
6. Shows live room/box status on the dashboard (green = box online).

## 4. Front office team's role (your responsibility)

1. **Do everything through MHMS only.** Check-in, check-out, visiting, cleaning, maintenance, MD check-in — the power follows your MHMS entry automatically.
2. **Select the correct room type (AC / Non-AC) at check-in.** This decides whether the AC gets power. Wrong selection = guest complaint or wasted electricity.
3. **Enter the correct room number.** Power goes to exactly the room number entered.
4. **Always perform check-out in MHMS when a guest leaves.** If you skip it, the room's power stays ON and the electricity is billed to that room in reports.
5. **Use Visiting / Cleaning / Maintenance processes instead of doing a fake check-in** — these switch off by themselves; a check-in never does.
6. **Give the guest a heads-up for timed processes** (e.g. "power is on for 10 minutes for visiting"). If more time is needed, raise the process again in MHMS — the timer restarts.
7. **Do not touch the relay box, the bridge PC, or the room's automation wiring.** The bridge computer (the PC running the PowerHub Bridge window) must stay **ON 24×7** with the black window running.
8. **If power does not respond within ~10 seconds:** check the PowerHub dashboard — the box tile must be **green**. If it is red/grey, check the bridge PC is on and connected to hotel WiFi, then inform the admin. Do not repeat the MHMS action multiple times.

## 5. Quick troubleshooting for front office

| Symptom | First check | Then |
|---|---|---|
| Room power not turning ON after check-in | Box tile green in PowerHub dashboard? | Bridge PC on & black window running? Inform admin. |
| AC on in a Non-AC check-in | Was room type selected correctly in MHMS? | Correct the entry; do checkout + fresh check-in. |
| Visiting power went off too early/late | Timer is 10 min by default | Ask admin to change it in Process Master. |
| Guest still checked-in but power off | Was a timed process (cleaning etc.) run last? | Re-run Check-in for that room in MHMS. |

---

*Timers currently configured: Visiting 10 min · Cleaning 30 min · Maintenance 60 min · MD Check-in 120 min. Admin can edit these in PowerHub → Masters → Process.*
