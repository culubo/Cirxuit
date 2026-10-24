# Microduck hardware reference

The Microduck hardware view uses Pollen Robotics' **RPI Robot HAT D1** PCB
(`pollen-robotics/elec_RPI_Robot_HAT`, commit
`6de86283297e4c49a9da8312cd3395ab83c437e3`). The source KiCad board and
its Apache-2.0 license are in `vendor/microduck-hat/`. Rebuild the app board
data with `node --experimental-strip-types scripts/generate-microduck-hat.mjs`.

The imported outline, four copper layers, filled polygons, tracks, vias,
footprints, and pad nets come from that KiCad file. Component body heights and
the on-screen reference labels are visual approximations. The HAT's J4 header
connects to a **separate** RK3566 computer. Pollen's [Microduck OS
repository](https://github.com/pollen-robotics/microduck_yocto) lists the Radxa
Zero 3W as the working RK3566 reference board and a Seeed-designed custom beta
board as a newer hardware target. The custom beta PCB layout is not published
there; this view does not claim to reproduce it. [Radxa's hardware
documentation](https://docs.radxa.com/en/zero/zero3) gives the Zero 3W's form
factor and processor.

In Robot view, the imported HAT replaces the placeholder HAT mesh at its
position in Pollen's Microduck CAD model. The head shell is made translucent
for inspection. The adjacent Pi Zero-shaped compute-board mesh in that CAD is
only a mechanical stand-in; its chip placement is not modeled as a real Radxa
PCB. The board picker calls this a **reference** for that reason.

The app's DC solver cannot model the HAT's switching regulator, audio codec,
IMU, motor protocol, or RK3566. This board is intentionally a layout reference:
the UI does not display invented voltage/current results or permit firmware
execution against it. The separate “Biped power (concept)” board remains the
interactive stall and brownout lesson.
