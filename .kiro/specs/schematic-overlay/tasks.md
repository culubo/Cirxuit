# Tasks: Schematic Overlay

- [x] 1. Geometry: `schematicFit`, `symbolPins`, `symbolKind`, rotation (+ unit tests)
- [x] 2. Current direction: `flow.ts` (`netCurrent`, `netEndpoints`, `orientSegments`);
      switch `CurrentParticles` to it (+ unit tests, incl. demo LED_A direction)
- [x] 3. Focus: `focusOf`, store `hover` / net selection / schematic toggles; `SceneRoot`
      and `PartModel` use them (+ unit tests)
- [x] 4. Symbol art: `drawSymbol` canvas renderer for every kind, labels upright
- [x] 5. Overlay layer: plane, symbols, voltage-tinted wires, labels, tethers, fade/opacity
- [x] 6. Interaction: symbol/wire hover and click, `TracePicker` for board traces
- [x] 7. Schematic particles in sync with the board
- [x] 8. Controls, DOM mirror, inspector net panel, camera headroom
- [x] 9. Verify: tsc, unit, e2e (incl. schematic.spec.ts if present), build, screenshots
