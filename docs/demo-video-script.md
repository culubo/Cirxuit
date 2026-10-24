# Circxit demo video — target 2:35–2:45

The Hackachusetts limit is **less than three minutes**. Leave at least 15 seconds of margin in the exported file, including the title and end card. Record the browser running on the computer it was built for. The quoted lines are voiceover; the actions are the shot list.

| Time | On screen | Voiceover |
| --- | --- | --- |
| 0:00–0:17 | Start close on the LED driver board. | “A robot can fail because of one line of code or one connection on its board. I built Circxit to see both at once.” |
| 0:17–0:48 | Show the sketch, run it, then select the LED or transistor. Hold on the readings. | “Here, changing an output pin drives a transistor and switches an LED. When I run the sketch, Circxit shows the current path. I can click a part to inspect its voltage and current, then follow the effect of my code through the circuit.” |
| 0:48–1:12 | Open the schematic and the PCB layer sheets. Move slowly. | “The same board has a schematic and a physical layer view. I can pull the layers apart and check where each connection goes. That helps me find a hardware cause without guessing from the code alone.” |
| 1:12–1:43 | Switch to Biped power, stall two servos, show the rail warning, then Robot view. | “Here’s a more serious case. Two stalled servos demand more current, the battery rail sags, and the controller can brown out. Circxit lets me stress the power budget deliberately and see the warning before I build that mistake into a robot.” |
| 1:43–2:04 | Show the robot controller placement sequence, then its completed board. | “The build view shows how a controller comes together, part by part. Once it is assembled, I can inspect the board and run its lamp test.” |
| 2:04–2:30 | Briefly show `.kiro/specs/circxit/requirements.md`, a task list, `.kiro/steering/quality.md`, and a hook file, then return to the app. | “I used Kiro’s specs to turn the idea into requirements, design decisions, and small implementation tasks. Steering documents kept the electrical model and visual rules consistent. Hooks ran type checks and tests as the project changed, while browser tests checked the real demo path.” |
| 2:30–2:42 | Hold on a clean Circxit view with the URL as an edited end card. | “Circxit makes robot electronics easier to see, test, and explain. You can try it in the browser.” |

## Recording and submission notes

- Capture screen footage first, then record the voiceover. Keep the pointer still while readings and warnings are visible.
- Use the original LED and Biped boards for live electrical readings. The sourced Microduck HAT is a layout reference, not a live electrical simulation.
- Keep third-party logos, trademarks, and copyrighted music out of the video unless you have permission. Use the app’s original demo boards for this cut.
- Export at 2:45 or shorter. Upload the video publicly to one of the platforms named in the rules and put its link in the submission form.
