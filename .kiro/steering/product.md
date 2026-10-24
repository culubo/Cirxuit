---
inclusion: always
---

# Product overview

Circuit X-Ray is a browser-based tool that makes a robot's control board physically and electrically legible, so a developer can understand and validate the hardware their firmware actually runs on. Its primary user is a developer working on robotics: someone who writes the MCU code and needs to see what that code does to the board — where current flows, which rails sag under load, and when an actuator stall will brown out the controller.

Track: Robotics.

- The core demo loads a hand-authored board, lets the developer inspect parts and nets, run Arduino-style firmware, and see the resulting simulated voltages, currents, warnings, and actuator/LED state.
- The scene uses an exploded 3D board and function blocks to tie physical layout to electrical behavior, so a developer can reason about power delivery and signal paths before committing to hardware.
- Two built-in boards ship today: the LED driver demo (the default, and the automated demo path) and a biped power board whose four servos can be stalled to watch the battery rail collapse and the rail warning fire.
- A servo is modelled as a DC resistive load (low stall resistance, higher run resistance); stalling actuators is how a developer stress-tests a power budget here.
- A KiCad board importer is a stretch capability. Boards without electrical models can still be viewed, but should not imply simulated behavior for those parts.

Use `.kiro/specs/circuit-xray/requirements.md` for the product requirements. Follow `quality.md` for the current quality bar and demo safety rules.
