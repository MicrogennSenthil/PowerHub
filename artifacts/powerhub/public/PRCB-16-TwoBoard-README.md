# PRCB-16 — Two-Board Split (2-layer each)

The single 4-layer board is now TWO separate 2-layer boards, linked by a 20-pin ribbon cable.

## Board 1 — Motherboard (LOGIC, low voltage only)
Files: PRCB-16-Motherboard.net / -BOM.csv
- ESP32-WROOM-32E (WiFi) + STM32F103RCT6 (control) + MAX485 (RS-485)
- 3.3V LDO, keycard opto-isolators x16 (+ terminals), status LEDs
- NO MAINS on this board -> quiet, cheap, easy 2-layer routing
- Powered by +5V/GND coming from the relay board over J_IBC

## Board 2 — Relay board (POWER, mains)
Files: PRCB-16-RelayBoard.net / -BOM.csv
- Mains protection + HLK-PM01 (5V) + HLK-PM12 (12V) supplies
- ULN2803A x2 -> 16 relays (G5LE 10A / Finder 16A) + flyback + channel LEDs
- 16 fused output terminals + 16 contactor-trigger terminals
- 16 hardware bypass DIP switches (forced-ON)
- Receives 16 CTRL signals from motherboard; sends 5V/GND back

## Inter-board connector J_IBC (identical pinout on both boards)
20-pin IDC ribbon (2x10, 2.54mm):
| Pin | Signal | Direction |
|-----|--------|-----------|
| 1, 20 | +5V | Relay -> Motherboard |
| 2, 19 | GND | common |
| 3..18 | CTRL1..CTRL16 | Motherboard -> Relay |

This connector is the INTERFACE CONTRACT — keep the pinout locked so either board can be revised independently.

## Notes
- Both are schematic-level netlists (connectivity), NOT routed boards. Import into KiCad -> place -> route -> Gerbers.
- Pin assignments on the MCU are preliminary; verify against peripheral conflicts (SWD, crystal, UART) before routing.
- Set mains-net trace width >=2-3mm and clearance >=3-4mm on the RELAY board.
