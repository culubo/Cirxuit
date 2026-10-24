# Microduck

Model and walking policy of Microduck by **Pollen Robotics**, used by Circxit's
Robot view (non-commercial project).

- MJCF (`scene.xml`, `robot_groundcontact.xml`): from
  [pollen-robotics/microduck_rl](https://github.com/pollen-robotics/microduck_rl)
  @ `b02fdea`, Apache License 2.0.
- Meshes (`assets/*.stl`): Copyright Pollen Robotics, licensed under
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
  **Modified**: decimated to about 6% of their triangles so the model
  loads in a browser. These adapted meshes are licensed under CC BY-NC-SA 4.0 as well.
- Policy (`velstand.onnx`): from
  [pollen-robotics/microduck-policies](https://huggingface.co/pollen-robotics/microduck-policies)
  @ `665ae4e`, Apache License 2.0. Unmodified.

Regenerate with `node scripts/prepare-microduck.mjs`.
