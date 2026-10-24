# Bugfix: Solver review findings

## Evidence

`src/solver/__tests__/review.test.ts` records Gemini's confirmed review cases. After the demo Playwright test passed, the review suite reproduced five failing tests and one passing test on October 24, 2026. Use that test file as the acceptance reference.

## Current behavior (defects)

1. WHEN a 5 V NPN circuit uses a 9 kΩ/1 kΩ base divider and 1 kΩ collector load, THEN the solver reports Q1 active and its collector at 27.22 V, although the base drive is below turn-on.
2. WHEN R1 is 100 kΩ and D1 has a 3.0 V forward drop on the demo board, THEN the solver reports Q1 saturated and 7.83 mA collector current while β × base current is about 4.30 mA.
3. WHEN an LED cathode pad has no net, THEN the solver still reports about 13.0 mA through that LED.
4. WHEN a capacitor's second pad is on an otherwise empty net, THEN the DC solve fails with a singular matrix even though the capacitor is open at DC.
5. WHEN D1 exceeds its current rating, THEN the warning tells the user to reduce the series resistor. WHEN the MCU ref is changed to MCU7, THEN its floating-input message still says U1.

## Expected behavior

1. WHEN the base divider cannot turn Q1 on, THEN Q1 SHALL be cut off and the collector SHALL remain at 5 V.
2. WHEN base drive limits collector current, THEN the transistor SHALL not be marked saturated and collector current SHALL be no greater than β × base current within solver tolerance.
3. WHEN an LED terminal is unconnected, THEN its branch current SHALL be zero.
4. WHEN a net is connected only through a DC-open capacitor, THEN the solver SHALL return a valid finite result rather than failing solely because that net has no DC conductance.
5. WHEN LED current exceeds its rating, THEN guidance SHALL tell the user to increase the series resistance. WHEN warning text names an MCU, THEN it SHALL use that part's current ref.

## Unchanged behavior (regression prevention)

- WHEN a zero-ohm resistor loads a voltage source, THEN the solver SHALL CONTINUE TO report a short or failure without non-finite values. This review case already passes.
- WHEN the built-in demo loads, code drives D8 high, and the LED is inspected, THEN the Playwright demo path SHALL CONTINUE TO pass with D1 current in its asserted range and no browser errors.
- Existing `src/solver/__tests__/solve.test.ts` and `sweep.test.ts` behavior SHALL remain valid. Keep the solver pure and use the types in `src/model/board-model.ts`.
