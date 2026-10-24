# Requirements: Editable Values

Track: Robotics. A developer validating hardware needs to change a part's electrical
parameters and immediately see the effect on the circuit — current, warnings, and device
state — without leaving the inspector or editing JSON.

## Requirement 1: Editable electrical parameters
User story: As a robotics developer, when I select a part I want to edit its electrical
parameters in the inspector and have the circuit re-solve live.

1. WHEN a part is selected THE SYSTEM SHALL show its editable electrical parameters:
   - resistor: ohms
   - potentiometer: wiper (0..1, as a slider)
   - LED: forward voltage vf
   - NPN: beta
   - voltage source: volts
   - servo: run ohms and stall ohms
2. WHEN the user changes any parameter to a valid value THE SYSTEM SHALL re-solve the
   board and update currents, warnings, and device state within one interaction.
3. THE SYSTEM SHALL accept engineering notation for numeric fields: plain (220), kilo
   (4.7k), mega (1M), milli (1m), micro (1u / 100u), nano (100n), pico (1p).
4. THE SYSTEM SHALL display each field's current value in a canonical, re-editable form.

## Requirement 2: Input validation
User story: As a robotics developer, I want bad input rejected clearly without losing my
working circuit.

1. WHEN the user enters a negative, empty, or non-numeric value THE SYSTEM SHALL reject it,
   show an inline error message, and keep the last valid value in effect.
2. WHILE an invalid value is shown THE SYSTEM SHALL leave the solved circuit (currents,
   warnings, device state) unchanged from the last valid value.
3. THE SYSTEM SHALL clear the inline error as soon as a valid value is entered.

## Requirement 3: Out-of-range but valid values
User story: As a robotics developer, I want extreme-but-legal values to surface as
warnings, not crashes.

1. WHEN a valid value drives the circuit into an unsafe regime (e.g. LED overcurrent)
   THE SYSTEM SHALL emit a solver warning.
2. THE SYSTEM SHALL never produce NaN / non-finite results or a frozen UI for any valid
   numeric input.

## Requirement 4: Device state display
User story: As a robotics developer, I want to see what state a device settled into.

1. WHEN a part with a device state is selected THE SYSTEM SHALL show that state in the
   selected-part summary: LED/diode on/off; NPN cutoff/active/saturated.

## Requirement 5: Modified markers and reset
User story: As a robotics developer, I want to see which values I changed and be able to
return to the board's originals.

1. WHEN a parameter differs from the board's original value THE SYSTEM SHALL show a subtle
   "modified" marker on that field.
2. THE SYSTEM SHALL provide a Reset board control that restores every parameter to its
   original value and re-solves.
3. WHEN the board is reset THE SYSTEM SHALL clear all warnings that resulted from edits.

## Requirement 6: Warning test hooks
1. A warning that carries a part ref SHALL be rendered with data-testid `warning-<ref>`.
2. A warning that carries a net id SHALL be rendered with data-testid `warning-<netId>`.
3. The overcurrent warning message SHALL contain the word "overcurrent".

## Non-functional
- All editing happens in the browser; re-solve is synchronous and live.
- Acceptance: `e2e/edit-values.spec.ts` passes unedited, and `demo.spec.ts` and
  `biped.spec.ts` continue to pass.
