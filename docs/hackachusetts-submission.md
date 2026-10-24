# Hackachusetts submission draft

**Track:** Robotics & Hardware  
**Project:** Circxit  
**Public source:** https://github.com/culubo/Cirxuit  
**Working demo:** https://circuit-xray.vercel.app/  
**Video:** Add the public video URL after uploading it. The exported video must be **under 3:00**.

## Project description

Circxit is a browser workbench for understanding the electronics behind robot behavior. Run a small firmware sketch against an interactive circuit model, click a part to inspect its voltage and current, and follow the connection through a schematic and exploded PCB layers. A biped power example lets you stall servos and see the battery rail sag and the controller brownout warning. A controller assembly sequence shows where its parts go. You can also inspect an imported Robot HAT layout from a published hardware design; that board is clearly marked as a layout reference because its processor and complex devices are not simulated.

## How Kiro was used

I used the Kiro IDE for spec-driven development. The root `.kiro/specs/` folder contains requirements, designs, and task lists for the original circuit workbench, editable electrical values, the schematic overlay, PCB realism, and the IDE layout. Breaking those into small tasks made it possible to check the solver, UI, and demo path separately while the product grew.

The always-loaded steering documents in `.kiro/steering/` defined the product goal, architecture boundaries, and quality bar. In particular, they kept the solver pure, required real units instead of placeholder numbers, and preserved the end-to-end LED demo while visual work was added. The `.kiro/hooks/` configuration runs type checks and unit tests on TypeScript saves, board validation when board JSON changes, and the solver sweep when solver code changes. A separate hook checks whether exported solver or runtime API changes call for README updates.

The project configures Playwright and Context7 MCP servers in `.kiro/settings/mcp.json`. For visual verification, scripted Playwright captures were used when the browser MCP path was unreliable; the screenshots and acceptance tests helped check changes to the 3D scene and workbench. We also used a deterministic 210-case solver stress sweep. We did not use a property-based testing framework, so we do not claim PBT results.

## Testing instructions

Open the working demo URL in a desktop browser. On the LED driver board, run the starter sketch, click the LED or transistor, then open the schematic and layer sheets. Switch to **Biped power (concept)**, select two servos, stall them, and observe the battery rail warning. To run locally:

```bash
npm ci
npm run dev
```

For automated checks, run `npm run build`, `npm test`, and `npx playwright test`. The repository includes the source, assets, lockfile, `.kiro/` directory, and the provenance and license notes for imported hardware and art.

## Before submitting

- Add every team member in the submission form (maximum four), and choose one authorized representative.
- Record and upload a public video shorter than three minutes to one of the platforms named in the rules, then add its URL to the form. [Recording script](demo-video-script.md).
- Check the final video for third-party logos and copyrighted music. The original LED and Biped boards give a complete demo without showing the imported Microduck model.
- Review third-party asset terms and attribution, especially [`public/models/microduck/README.md`](../public/models/microduck/README.md), [`vendor/microduck-hat/LICENSE`](../vendor/microduck-hat/LICENSE), and [`src/scene/art/OSIFONT-LICENSE.md`](../src/scene/art/OSIFONT-LICENSE.md).
- Verify the demo URL remains free and accessible to judges through the judging period. Freeze the submitted repo and demo after the submission period closes unless the organizers permit a change.
