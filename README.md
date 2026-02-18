# 3d Printing G-code Retraction Optimizer

CLI/server/UI written in TypeScript that optimizes a G-code file to reduce unnecessarily long retractions, and thus to speed up printing and reduce risk of heat creep. When traveling long distances, the long retractions will be preserved but when traveling short distances, the retraction will be shortened. Additionally, it can be configured to continue retracting during travel to prevent oozing. A minimum retraction option is there to "stretch" the filament in a bowden tube and pull up a little from the nozzle, even on short travels to prevent stringing on short travels.

## Behavior
- Assumes initial retraction length of 8 mm (default max) and 2 mm default min.
- Travel distance ≤ 10 mm → retraction/deretraction set to 2 mm (default min).
- Travel distance ≥ 100 mm → retraction/deretraction set to 8 mm (default max).
- Travel between 10 mm and 100 mm → linear interpolation between min and max.
- Minimum and maximum retraction values can be overridden via flags or UI fields.
- Shortened retraction will also shorten wipe moves.
- Optional: "Retract during travel" keeps travel feed untouched, works with wipes (min retract stays stationary, wipes keep their movement up to the target, remaining retract is applied on the first XY travel move).

Notes:
- Designed for G-code that uses relative extrusion for retractions (common `G1 E-5` / `G1 E5` pairs).
- Travel distance is measured across non-extruding `G0/G1` moves between the retraction and the matching deretraction.
- Feed rates and other fields on the retraction lines are preserved; only the `E` value is rewritten.

## Setup
```bash
npm install
npm run build
```

## CLI usage
```bash
node dist/index.js --input path/to/file.gcode --output path/to/output.gcode
```

Optional flags:
- `--min <mm>`: Minimum retraction/deretraction (default 2).
- `--max <mm>`: Maximum retraction/deretraction (default 8).
- `--help`: Show usage.
- `--inlineDuringTravel`: Enable inlining retract onto the first XY travel move while preserving travel feed.

## Web server + UI
```bash
npm run build
npm run start:server
# open http://localhost:3000
```

## General usage
- Slice an STL using slicer of your choice. Select a high retraction length - one that won't cause oozing even at distances over 100 mm.
- Upload generated `.gcode` file, optionally adjust min/max values, and download the adjusted file.
- Optionally, adjust options for min retract, max retract and retract during travel.
- Click "Process file" to generate and download optimized `.gcode` file. The new estimated amount of time is shown.
- If an error occurs, it could be due to download routine. Try "Direct download" button.

## Additional notes
- Upload limit is 500 MB; oversized uploads return a JSON error.
- If the slicer-provided estimate is present (PrusaSlicer/filename patterns), the server returns it and a calibrated adjusted time; both are also embedded as comments at the top of the adjusted G-code.
- If port 3000 is in use, `npm run start:server` will try to free it automatically before starting.
- If no matching deretraction is found after a retraction, that retraction is left unchanged.
- Absolute extrusion or unusual retraction patterns may not be fully supported; adjust logic in `src/adjuster.ts` as needed.

## Development
- `npm run dev -- --input sample.gcode` to run without building.
- `npm run build` to emit compiled JS into `dist/`.
- `npm run dev:server` to run the server with ts-node.
- `npm test` to validate expected adjustment output using the provided fixtures.
- Regenerate fixtures with `npx ts-node scripts/regenerate-fixtures.ts`.
