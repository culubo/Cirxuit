# Requirements: Circxit

Track: Robotics. Pitch: the board a robot runs on is invisible to the developer writing its firmware. Circxit makes it visible, physically and electrically, so a developer can see what each part does, where current flows, and what their code actually does to the hardware — before a stalled servo browns out the controller in the field.

## Requirement 1: Exploded 3D board view
User story: As a robotics developer, I want to pull a control board apart into its layers so I can see how parts, copper, and power delivery relate on the hardware my code runs on.
1. WHEN the app loads THE SYSTEM SHALL render the built-in demo board in 3D within 2 seconds on a laptop.
2. WHEN the user drags the explode slider THE SYSTEM SHALL smoothly separate the board into stacked layers: substrate, bottom copper, top copper, components, function layer.
3. THE SYSTEM SHALL render solder mask, copper, and silkscreen with physically based materials, not flat colors.
4. WHEN the user orbits, pans, or zooms THE SYSTEM SHALL maintain 60 fps on the demo board.

## Requirement 2: Inspect any part or net
User story: As a robotics developer, I want to click anything and understand what it is, what it connects to, and how much current it draws.
1. WHEN the user clicks a part THE SYSTEM SHALL highlight the part, its pads, and every track on its nets, and dim everything else.
2. WHEN a part is selected THE SYSTEM SHALL show a panel with ref, value, a human-written blurb, its function block, and live voltage and current at each pad.
3. WHEN the user clicks a function block label THE SYSTEM SHALL highlight every part in that block.

## Requirement 3: DC circuit solver
User story: As a robotics developer, I want real numbers for my power budget, not guesses.
1. THE SYSTEM SHALL compute node voltages and branch currents for resistors, potentiometers, voltage sources, LEDs, diodes, NPN transistors, and MCU pins using modified nodal analysis.
2. THE SYSTEM SHALL handle nonlinear parts by piecewise linear state iteration and SHALL report non-convergence instead of showing wrong numbers.
3. WHEN any input changes THE SYSTEM SHALL re-solve in under 16 ms on the demo board.
4. THE SYSTEM SHALL emit plain-language warnings for overcurrent, reverse-biased LEDs, floating inputs, and shorts.

## Requirement 4: Code drives the board
User story: As a robotics developer, I want to run firmware and immediately see what it does to the hardware physically.
1. THE SYSTEM SHALL provide a code editor with an Arduino-style API: pinMode, digitalWrite, digitalRead, analogRead, log.
2. WHEN the user runs code THE SYSTEM SHALL execute it in a sandbox, apply pin states, re-solve, and animate the result.
3. WHEN code calls analogRead THE SYSTEM SHALL return the value implied by the solved voltage and ADC resolution.
4. IF user code throws or loops forever THEN THE SYSTEM SHALL stop it within 500 ms and show a friendly error, without breaking the scene.

## Requirement 5: Current flow visualization
1. WHEN current flows in a track THE SYSTEM SHALL animate glowing particles along it in the direction of conventional current, with speed and density proportional to magnitude.
2. THE SYSTEM SHALL let the user toggle between conventional current and electron flow.
3. WHEN an LED conducts THE SYSTEM SHALL make it emit light with brightness proportional to current.

## Requirement 6: Power budgets under actuator load
User story: As a robotics developer, I want to stall actuators and watch the power rail so I can validate my power budget before the hardware browns out in the field.
1. THE SYSTEM SHALL model a servo as a DC resistive load with a low stall resistance and a higher running resistance.
2. WHEN the user toggles a servo into stall THE SYSTEM SHALL re-solve and show the increased current draw and any resulting rail sag.
3. WHEN a board defines rail limits and a listed net falls below its minimum voltage THE SYSTEM SHALL emit a danger warning naming that net with the board-authored message.
4. THE SYSTEM SHALL let the user switch between the built-in boards, keeping the LED driver demo as the default.

## Requirement 7 (stretch): Import a KiCad board
1. WHEN the user drops a .kicad_pcb file THE SYSTEM SHALL parse outline, footprints, pads, tracks, vias, and nets into the Board model.
2. IF parts lack electrical models THEN THE SYSTEM SHALL still render and inspect them and mark them as "not simulated".

## Non-functional
- Runs fully in the browser. No backend required for the demo.
- The demo path (load, explode, click, run code, see LED light) must never fail. It is covered by an automated end-to-end test.
- Deployed at a public URL before 6 PM.
