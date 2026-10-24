# Circxit demo video — target 2:45 to 3:00

Record the screen at 16:9 after the final build is deployed. Speak at a natural pace and leave the short pauses for the visuals. The quoted lines are the voiceover; the actions are a shot list, not words to read.

| Time | On screen | Voiceover |
| --- | --- | --- |
| 0:00–0:20 | Start on the LED driver board, already framed close enough to read it. | “When a robot acts strangely, I want to see the board and the code in the same place. This is Circxit. It lets me run a sketch against a circuit model and inspect what happens.” |
| 0:20–0:55 | Show the sketch, run it, then select the LED or transistor. Pause on the voltage and current readings. | “Here’s a small example. The sketch changes an output pin. That drives a transistor, which switches the LED. When I run it, the current path appears on the board, and I can click a part to see its electrical readings. I can trace the effect of one line of code all the way to a component.” |
| 0:55–1:20 | Open the schematic, then the layer sheets. Move slowly between views. | “The same circuit has a schematic and a physical PCB view. I can pull the board apart into layers, then use the schematic to check how the parts connect. That makes it easier to move between a symptom I see in code and a connection I can actually find on the board.” |
| 1:20–1:55 | Switch to Biped power. Stall two servos and show the rail warning and Robot view. | “This board models a battery powering a walking robot. If two servos stall, their load pulls the battery rail down. The controller can brown out. In Circxit I can make that happen deliberately and see the warning, instead of discovering it only after the robot fails.” |
| 1:55–2:20 | Switch to the robot controller; play the assembly sequence. | “There’s also a build view. The robot controller is assembled part by part, so the layout is something you can watch take shape, then inspect when it powers on.” |
| 2:20–2:47 | Switch to Microduck Robot HAT, open the layers, then show it inside the translucent head in Robot view. | “For Microduck, I imported Pollen Robotics’ published Robot HAT design. Its outline, copper layers, tracks, vias, and footprints come from the KiCad source. Here it is in the robot’s head. This view is a hardware reference: the separate RK3566 computer is still a CAD stand-in, and I’m not claiming to simulate that processor.” |
| 2:47–3:00 | Return to a clean hero view with the site URL visible. | “The goal is simple: make robot electronics easier to see, test, and explain. You can try Circxit in the browser.” |

## Recording notes

- Capture the screen first, then add the voiceover. Keep the mouse still while each result is visible.
- Use the built-in LED demo and Biped power board for the live electrical readings. The Microduck HAT is a sourced layout reference, so do not press Run or claim live current values for it.
- If any transition takes longer, trim the wait in editing rather than speeding up the whole video.
