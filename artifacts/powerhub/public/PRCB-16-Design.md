# PowerHub Room Controller Board — PRCB-16
## Full Design Document: 16-Channel Relay | Keycard Sensing | Software Bypass | 5A–40A

> ⚠️ **SAFETY WARNING** — This board operates at 230VAC/50Hz mains voltage.
> Creepage ≥6mm must be maintained between HV and LV sections.
> A licensed electrical/electronics engineer must review this design before manufacture.
> The board must meet applicable certifications (CE, UL, BIS, etc.) for hotel/commercial installation.

---

## Board Overview

| Parameter | Value |
|-----------|-------|
| Relay channels | 16 (2 × 8-channel slates) |
| Direct load capacity | 5A – 16A (on-board relays) |
| High-current path | 20A – 40A+ via external contactors |
| Keycard inputs | 16 (one per room, opto-isolated) |
| Hardware bypass switches | 16 (DIP switches, per channel) |
| Software bypass | Per-control flag in PowerHub DB |
| MCUs | ESP32-WROOM-32E + STM32F103C8T6 |
| Communication | WiFi (HTTP poll) + RS-485 (HMS) |
| Supply input | 230VAC / 50Hz |
| Logic supply | 5V / 3.3V on-board |
| Relay coil supply | 12VDC (or 5VDC variant) |
| PCB size (est.) | 220mm × 180mm |
| Layers | 4-layer FR4, 1.6mm |

---

## Full Bill of Materials (BOM)

### Section 1 — Mains Input & Protection

| Ref | Description | Part / Model | Qty | Rating | Purpose |
|-----|-------------|--------------|-----|--------|---------|
| J_MAINS | IEC C14 power inlet | Standard IEC C14 | 1 | 10A / 250VAC | Mains AC input |
| F1 | Ceramic fuse + holder | Littelfuse 217.006 | 1 | **6A / 250VAC** | Logic PSU protection |
| F2 | Ceramic fuse + holder | Littelfuse 217.020 | 1 | **20A / 250VAC** | Relay supply protection |
| RV1 | MOV varistor | Siemens S20K275 | 1 | 275VAC, 20mm disc | Mains surge/spike protection |
| NTC1 | NTC inrush limiter | Ametherm CL-60 | 1 | 5A / 120Ω cold | Prevents PSU inrush damage |
| CX1 | X2 safety capacitor | 100nF / 275VAC X2 | 2 | X2 rated | EMI differential filter |
| CY1 | Y2 safety capacitor | 2.2nF / 250VAC Y2 | 2 | Y2 rated | Common-mode EMI filter |
| PE_TERM | Earth terminal block | DIN rail PE clamp | 1 | 32A | PE / protective earth bonding |

---

### Section 2 — Power Supply

| Ref | Description | Part / Model | Qty | Rating | Purpose |
|-----|-------------|--------------|-----|--------|---------|
| PSU1 | AC-DC 5V module | Hi-Link HLK-PM01 | 1 | **5V / 600mA** | Logic rail (MCU, optos, drivers) |
| PSU2 | AC-DC 12V module | Hi-Link HLK-PM12 | 1 | **12V / 500mA** | Relay coil power (12V relays) |
| U_LDO1 | 3.3V LDO regulator | AMS1117-3.3 (SOT-223) | 2 | 1A | ESP32 core + STM32 I/O rail |
| D_RPP1,2 | Schottky diode | 1N5819 (DO-41) | 2 | 40V / 1A | Reverse-polarity protection on rails |
| C1–C4 | Electrolytic capacitor | 100µF / 25V | 4 | 100µF | Bulk decoupling each rail |
| C5–C12 | Ceramic capacitor | 100nF / 50V (0805) | 8 | 100nF | Rail bypass / decoupling |
| C13–C16 | Electrolytic capacitor | 10µF / 25V | 4 | 10µF | Mid-frequency rail filter |
| LED_PWR | 3mm LED red | Generic T-1 ¾ | 1 | 20mA | Power ON indicator |
| R_PWR | Resistor | 1kΩ / 0.25W | 1 | — | Power LED current limit |

---

### Section 3 — MCU Core

| Ref | Description | Part / Model | Qty | Rating | Purpose |
|-----|-------------|--------------|-----|--------|---------|
| U_ESP | WiFi MCU module | **ESP32-WROOM-32E** | 1 | 3.3V / 500mA | WiFi, PowerHub HTTP-poll protocol, OTA |
| U_STM | Control MCU | **STM32F103C8T6** (LQFP-48) | 1 | 3.3V / 150mA | Relay GPIO control, keycard scan, watchdog |
| Y1 | Crystal oscillator | 8MHz HC-49/S | 1 | — | STM32 clock source |
| C_XTAL1,2 | Crystal load cap | 22pF / 50V (0402) | 2 | — | Crystal load capacitors |
| C_RST | NRST filter cap | 100nF / 50V | 1 | — | STM32 NRST filter |
| R_BOOT1,2 | Pull-down resistor | 10kΩ / 0.25W | 2 | — | BOOT0 pull-down, ESP32 GPIO0 |
| R_EN | Pull-up resistor | 10kΩ / 0.25W | 1 | — | ESP32 EN pull-up |
| JP_BOOT | Boot jumper 2-pin | 2.54mm header + shunt | 2 | — | STM32 bootloader / ESP32 boot mode |
| SW_ESP | Tactile switch 6×6mm | SPST momentary | 2 | — | ESP32 EN reset + GPIO0 flash |
| C_MCU | MCU decoupling | 100nF + 10µF per IC | 8 | — | VDD decoupling |

---

### Section 4 — Keycard / Power-Saver Sensor Inputs ×16

One input per room. Connects to the dry-contact output of the hotel keycard holder switch (e.g. Legrand, Hafele, Salto room energy savers). When keycard is inserted → contact closes → opto fires → STM32 GPIO reads HIGH → reported to PowerHub as "room occupied / powered."

| Ref | Description | Part / Model | Qty | Rating | Purpose |
|-----|-------------|--------------|-----|--------|---------|
| OC1–OC16 | Optocoupler | **PC817** (4-pin DIP) | 16 | LED 5mA, CTR ≥100 | Galvanic isolation from room wiring |
| R_IN1–16 | Series resistor | 470Ω / 0.25W | 16 | — | Opto LED current limit (5V ÷ 470 ≈ 10mA) |
| R_PU1–16 | Pull-up resistor | 10kΩ / 0.25W | 16 | — | 3.3V output pull-up to STM32 GPIO |
| C_KCF1–16 | Input filter cap | 10nF / 50V (0805) | 16 | — | Contact bounce / noise filter |
| J_KC1–16 | Keycard input terminal | Phoenix 1803578 2-pin | 16 | **10A / 250VAC** | Per-room dry contact connection |
| TVS_KC | TVS diode array | PRTR5V0U2X or similar | 4 | ±5V clamping | ESD protection on input lines |

---

### Section 5 — Software Bypass + Hardware Override ×16

Two independent bypass mechanisms:

**Hardware (DIP switches):** Physical override installed at commissioning. When a DIP switch is ON, that relay is forced energised regardless of software. Used for maintenance, VIP rooms, or testing.

**Software (PowerHub app):** `bypass` boolean flag per control in the database. When set, device firmware holds the relay ON and ignores auto-cutoff, timer, or remote-off commands. The PowerHub UI shows a 🔒 badge on bypassed channels.

| Ref | Description | Part / Model | Qty | Rating | Purpose |
|-----|-------------|--------------|-----|--------|---------|
| SW_DIP1 | 8-position DIP switch | CTS 208-8MS | 1 | 100mA / 50VDC | Ch 1–8 hardware bypass |
| SW_DIP2 | 8-position DIP switch | CTS 208-8MS | 1 | 100mA / 50VDC | Ch 9–16 hardware bypass |
| R_DIP1–16 | Pull-down resistor | 10kΩ / 0.25W | 16 | — | DIP switch output pull-down |

---

### Section 6 — Relay Driver Stage

| Ref | Description | Part / Model | Qty | Rating | Purpose |
|-----|-------------|--------------|-----|--------|---------|
| U_DRV1 | Darlington driver | **ULN2803A** (18-pin DIP) | 1 | **500mA/ch**, 8ch, 50V | Drives CH 1–8 relay coils |
| U_DRV2 | Darlington driver | **ULN2803A** (18-pin DIP) | 1 | **500mA/ch**, 8ch, 50V | Drives CH 9–16 relay coils |
| D_FW1–16 | Flyback diode | 1N4007 (DO-41) | 16 | **1A / 1000V** | Suppresses relay coil back-EMF |
| LED_CH1–16 | Channel status LED | 3mm green LED | 16 | 20mA | Per-channel relay ON indicator |
| R_LED1–16 | LED current resistor | 470Ω / 0.25W | 16 | — | CH LED current limit |

---

### Section 7a — Direct On-Board Relays (5A – 16A)

PCB footprint supports interchangeable relay types. Select by load:

| Ref | Description | Part / Model | Qty | Rating | Best For |
|-----|-------------|--------------|-----|--------|---------|
| RLY1–8 | 10A PCB relay | **OMRON G5LE-1-E-5DC** | 8 | **10A / 250VAC**, 5V coil | Lights (5A), fans, small loads |
| RLY9–16 | 16A PCB relay | **Finder 40.52.8.012** | 8 | **16A / 250VAC**, 12V coil | AC units up to 16A, medium loads |
| ALT_5A | Alternative 5A relay | SRD-05VDC-SL-C | — | **5A / 250VAC**, 5V coil | Budget option for light loads only |
| ALT_10A | Alternative 10A relay | HF115F-I/012-1H3A | — | **10A / 250VAC**, 12V coil | Drop-in 10A alternate |
| F_OUT1–8 | Output fuse + holder | 5×20mm holder + 10A fuse | 8 | **10A** | Per-channel output protection |
| F_OUT9–16 | Output fuse + holder | 5×20mm holder + 16A fuse | 8 | **16A** | Per-channel output protection |
| J_OUT1–16 | Relay output terminal | Phoenix MKDS 3-pin 2.5mm² | 16 | 16A / 250VAC | COM / NO / NC per channel |

---

### Section 7b — Contactor Trigger Outputs (20A – 40A)

For loads above 16A (geysers, main room supply, large AC units), the PCB relay coil-drives an external DIN-rail contactor. Select contactor by actual load current:

| Load Current | Model | Rating | Coil | Use Case |
|-------------|-------|--------|------|---------|
| **20–25A** | Schneider Electric LC1D09 | 25A / 440VAC | **230VAC** | Small geyser, 1.5T AC |
| **25–32A** | Schneider Electric LC1D18 | 32A / 440VAC | **230VAC** | Standard geyser (25A), 2T AC |
| **32–40A** | Schneider Electric LC1D25 | 40A / 440VAC | **230VAC** | Large geyser (32A) |
| **40A+** | Schneider Electric LC1D32 | 50A / 440VAC | **230VAC** | Main room supply, large geyser |

| Ref | Description | Part / Model | Qty | Rating |
|-----|-------------|--------------|-----|--------|
| RLY_TRIG1–16 | Trigger relay (on-board) | Finder 40.52 16A | up to 16 | 16A / 250VAC |
| J_TRIG1–16 | Trigger output terminal | Phoenix 2-pin 2.5mm² | 16 | 10A / 250VAC |

---

### Section 8 — Communication

| Ref | Description | Part / Model | Qty | Rating | Purpose |
|-----|-------------|--------------|-----|--------|---------|
| U_485 | RS-485 transceiver | **MAX485** (8-DIP) | 1 | 5V, ±15kV ESD | HMS serial bus |
| J_RS485 | RS-485 terminal | Phoenix 3-pin 2.5mm² | 1 | — | A, B, GND |
| R_TERM | Line termination | 120Ω / 0.25W (jumper) | 1 | — | End-of-bus termination |
| J_USB | USB-B connector | USB-B right-angle PCB | 1 | — | STM32 flash/debug via PC |
| J_SWD | SWD debug header | 2.54mm 4-pin header | 1 | — | STM32 SWD (SWDIO, SWDCLK, 3V3, GND) |
| J_UART | ESP32 UART header | 2.54mm 4-pin header | 1 | — | TX, RX, EN, GND |
| LED_WIFI | WiFi status LED | 3mm blue LED | 1 | 20mA | ESP32 WiFi connected indicator |
| LED_HMS | HMS activity LED | 3mm yellow LED | 1 | 20mA | RS-485 / HMS bus activity |
| LED_FLT | Fault LED | 3mm red LED | 1 | 20mA | Watchdog fault / error |
| R_LED_ST | LED resistors | 470Ω / 0.25W | 4 | — | Status LED current limit |

---

## BOM Quick-Count Summary

| Component | Part | Qty |
|-----------|------|-----|
| WiFi MCU | ESP32-WROOM-32E | 1 |
| Control MCU | STM32F103C8T6 | 1 |
| On-board relay 10A | OMRON G5LE-1-E | 8 |
| On-board relay 16A | Finder 40.52 | 8 |
| Relay driver | ULN2803A | 2 |
| Optocoupler (keycard) | PC817 | 16 |
| DIP bypass switch (8-pos) | CTS 208-8MS | 2 |
| Flyback diode | 1N4007 | 16 |
| Schottky diode | 1N5819 | 2 |
| PSU 5V | HLK-PM01 | 1 |
| PSU 12V | HLK-PM12 | 1 |
| LDO 3.3V | AMS1117-3.3 | 2 |
| RS-485 | MAX485 | 1 |
| Crystal 8MHz | HC-49/S | 1 |
| MOV varistor | S20K275 | 1 |
| Fuse holder + fuse | 5×20mm | 18 |
| Tactile switch | 6×6mm | 2 |
| Resistors (various) | 0.25W / 0805 | ~65 |
| Capacitors (various) | Electro + ceramic | ~35 |
| LEDs 3mm | Various colours | 21 |
| 2-pin screw terminal | Phoenix 2.5mm² | 34 |
| 3-pin screw terminal | Phoenix 2.5mm² | 17 |
| Crystal load caps | 22pF 0402 | 2 |
| TVS diode array | PRTR5V0U2X | 4 |
| **External contactor** | **Schneider LC1D** series | **per install** |

---

## PCB Specifications

| Parameter | Value |
|-----------|-------|
| Layers | 4 (Top Signal · GND plane · 12V plane · Bottom Signal) |
| Material | FR4, Tg150, 1.6mm thickness |
| Size | ~220mm × 180mm |
| Copper weight | 2oz outer (relay/mains), 1oz inner |
| Min signal trace | 0.2mm |
| Relay output trace | ≥2mm (10A), ≥3.5mm (16A) |
| Mains bus trace | ≥5mm |
| HV/LV clearance | **≥3mm air, ≥6mm creepage** |
| Isolation slot | Routed PCB slot between mains and logic |
| Surface finish | ENIG or HASL lead-free |
| Solder mask | Green both sides |
| Mounting | M3 standoffs × 4 corners |
| Connectors | Phoenix Contact cage-clamp, 2.5mm² rated |
| Enclosure | IP20 minimum, HV warning labels |

---

## Software Additions Required in PowerHub

### 1. Keycard Status Detection
- **DB:** Add `keycard_inserted BOOLEAN DEFAULT FALSE` to `rooms` table
- **API:** `PATCH /devices/:id/keycard-status` — device firmware POSTS keycard state per room on change
- **Logic:** On keycard removal, start configurable timer (e.g. 30s); if not reinserted, trigger power cutoff for that room (respects bypass flag)
- **UI:**
  - Room Chart: show 🔑 badge when keycard is in, ⬜ when vacant
  - Dashboard: live occupancy count from keycard states

### 2. Control / Room Bypass
- **DB:** Add `bypass BOOLEAN DEFAULT FALSE` to `controls` table
- **API:** `PATCH /controls/:id` already exists — add bypass to `ControlUpdate` schema
- **Logic:** Firmware ignores power-off commands when `bypass=true`; applies to auto-cutoff, process timers, and manual off
- **UI:**
  - DeviceDetail: bypass toggle per channel (with confirmation dialog)
  - Room Chart: 🔒 badge on bypassed channels
  - Bulk assign dialog: bulk bypass toggle per room
  - Audit log: record all bypass changes (user, timestamp, old/new value)

---

## Safety & Compliance Checklist

- [ ] PCB isolation slot routed between HV relay contacts and LV logic (≥6mm creepage)
- [ ] All relay outputs individually fused at output terminals
- [ ] Mains copper track widths verified: ≥5mm bus, ≥3.5mm relay output
- [ ] PE earth terminal connected to metal enclosure
- [ ] MOV and X/Y capacitors installed on mains input
- [ ] All low-voltage signal cables (keycard, RS-485, USB) exit enclosure separately from mains cables
- [ ] Contactor trigger wiring rated for 230VAC insulation
- [ ] External contactors (20–40A) mounted on separate DIN rail section, never on PCB
- [ ] Design reviewed by licensed electrical engineer
- [ ] CE / BIS / applicable certification obtained before hotel installation
- [ ] Enclosure labelled: "DANGER 230VAC", keycard terminal ratings, relay ratings
