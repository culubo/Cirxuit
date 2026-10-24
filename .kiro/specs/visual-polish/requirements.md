# Requirements: Visual Polish

Track: Robotics. Realise the "Visual language" and "Scene details" sections of
`.kiro/specs/circuit-xray/design.md`. The 3D scene is the hero; the chrome stays thin and
quiet. Every change must preserve the existing data-testid selectors and keep all e2e and
unit tests green, and hold 60 fps on the demo board.

## Requirement 1: Exploded layer view
User story: As a robotics developer, I want to pull the board apart into its layers so I
can see how substrate, copper, components, and the function layer relate.
1. THE SYSTEM SHALL provide an explode control (slider, 0..1).
2. WHEN the explode factor changes THE SYSTEM SHALL separate the board along +z into
   stacked layers: substrate, B.Cu, F.Cu, components, function layer.
3. THE SYSTEM SHALL animate the separation with an eased spring, settling under ~1 s.
4. WHEN exploded THE SYSTEM SHALL keep the scene at 60 fps on the demo board.

## Requirement 2: PBR materials and lighting
1. THE SYSTEM SHALL render the substrate as green solder mask with a slight clearcoat,
   copper as a metallic PBR surface, and silkscreen as white.
2. THE SYSTEM SHALL light the scene with a drei Environment preset and soft contact
   shadows.
3. IF the Environment preset fails to load (offline) THEN THE SYSTEM SHALL fall back to a
   built-in light rig so the scene is never unlit or blank.

## Requirement 3: Current particles
1. THE SYSTEM SHALL animate current as glowing particles in a single InstancedMesh.
2. THE SYSTEM SHALL move particles along each conducting track in the direction of
   conventional current, with speed and spacing derived from |I|.
3. THE SYSTEM SHALL render particles with additive blending and a bloom post-process.
4. THE SYSTEM SHALL offer a toggle between conventional-current and electron-flow
   direction.
5. WHEN there is no current in a track THE SYSTEM SHALL show no particles on it.

## Requirement 4: LED glow
1. WHEN an LED conducts THE SYSTEM SHALL make it emit light with brightness proportional
   to its forward current.

## Requirement 5: Selection focus
1. WHEN a part is selected THE SYSTEM SHALL emphasise that part and the tracks on its nets
   and dim everything else.
2. THE SYSTEM SHALL ease the dim/undim transition within 200 ms.

## Requirement 6: Design tokens and typography
1. THE SYSTEM SHALL define a dark "lab instrument" palette as design tokens, including
   accent-power, accent-mcu, accent-driver, accent-sensor (and the biped board block
   colors), plus phosphor-green (current), amber (warn), and red (danger).
2. Scene and UI SHALL reference tokens rather than raw hex where a token exists.
3. THE SYSTEM SHALL render all electrical numbers in a monospace face via
   `formatQuantity`, with real units and three significant figures.

## Non-functional / constraints
- All existing data-testid selectors keep working; all e2e and unit tests pass.
- 60 fps on the demo board.
- No external runtime assets that could fail offline, except drei's Environment preset,
  which must degrade to a fallback light rig.
