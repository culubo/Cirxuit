# Requirements: IDE Workbench and PCB Builder

Track: Robotics. Today the app is a 3D view with a small textarea; a developer cannot
tell what to do, cannot see what their program did step by step, cannot tell whether
their code or board is broken, and cannot make their own board. Turn it into a small IDE.

## Requirement 1: Code editor
1. THE SYSTEM SHALL provide a code editor with line numbers, JavaScript syntax
   highlighting, bracket matching, undo/redo, and autocomplete for the Arduino-style API
   (pinMode, digitalWrite, digitalRead, analogRead, log, HIGH, LOW).
2. THE SYSTEM SHALL keep a separate sketch per board, seeded with a commented starter.
3. Keyboard: Mod-Enter runs, F10 steps.
4. The Arduino-style API SHALL stay exactly as it is (no new functions).

## Requirement 2: Build checks ("is something wrong?")
1. WHEN the code changes THE SYSTEM SHALL check it without running it and report:
   syntax errors with line and column; unknown functions (with "did you mean");
   wrong argument counts; pins that do not exist on the current board; invalid levels
   and modes; calls to unavailable functions such as delay(); loops that never end.
2. Problems SHALL appear underlined in the editor, in a Problems panel, and as a count in
   a status bar that reads "Build OK" when clean.
3. IF the code has build errors THEN Run SHALL not execute it and SHALL say why.
4. THE SYSTEM SHALL run electrical rules checks on the board: unconnected pads, missing
   power source, missing ground, a supply shorted to itself, an MCU without power, and
   nets that reach only one pad.
5. Runtime errors SHALL be reported with the line that threw; solver warnings and solver
   failures SHALL appear in the same Problems panel.
6. Clicking a problem SHALL jump to its line or select its part.

## Requirement 3: Slow down a run
1. Each run SHALL record a trace of every pin call and log with its source line.
2. THE SYSTEM SHALL let the user pick a speed (Instant, Fast, Normal, Slow, Very slow).
   Instant applies the final state at once; slower speeds replay the trace and re-solve
   the circuit after every step.
3. THE SYSTEM SHALL provide Step, Pause/Resume, and Restart, a scrubber, and a Trace list.
4. WHILE replaying THE SYSTEM SHALL highlight the current line in the editor.

## Requirement 4: Directions
1. THE SYSTEM SHALL show a guide for the current board: a short list of steps with what
   to do and why, ticked off automatically when the user does them.
2. THE SYSTEM SHALL point at the control each step needs.
3. The guide SHALL be collapsible and never cover the editor, inspector, or run controls.

## Requirement 5: Build a PCB from scratch
1. THE SYSTEM SHALL provide a Build mode with a 2D board editor for a user board
   ("My board"), leaving the built-in boards read-only.
2. Users SHALL place parts from a palette (supply, microcontroller, resistor, LED,
   capacitor, NPN transistor, potentiometer, servo), move, rotate, and delete them, and
   wire pad to pad. Wires route as copper traces; wiring merges nets automatically.
3. Users SHALL edit part values, start from a blank board or a working starter, and
   export the board as JSON.
4. The user board SHALL persist across reloads.
5. Switching to Simulate SHALL show the user board in 3D, solved and runnable.
6. Board checks SHALL update live while building and mark unconnected pads.

## Non-functional
- Every existing data-testid keeps working; unit tests and all acceptance e2e specs pass.
- Runs fully in the browser, offline.
