# Requirements

## Functional
- Scale retraction/deretraction based on travel: ≤10 mm → 2 mm, ≥100 mm → max (default 8 mm; configurable `--min/--max`); linear interpolation in between.
- Match each retract with a deretract of equal magnitude (within tolerance); leave unmatched retracts unchanged.
- Preserve original feed rates on existing moves; when inlining retract during travel, carry the travel feed unchanged and apply retract speed only to the retract portion.
- Inline during travel (when enabled and wipes are off): perform the minimum retract stationary, then apply the remaining retract on the first travel move without creating extra travel segments; deretract only after travel.
- When wipes are present and inline is enabled: keep wipe moves (capped by the target retract), spend the minimum retract stationary, then inline only the remaining retract onto the first XY travel move; deretract after travel.
- Do not add deretract on travel moves; do not introduce extra travel moves; do not split travel moves when inlining.
- Ignore Z-only moves for travel measurement and inline placement; never inline retract or deretract onto Z lifts—use the next XY travel move instead.
- If the computed target retract is at or below the configured minimum, keep the full retract stationary and do not inline during travel.
- Inline default: split the first XY travel move so the retract-bearing portion uses retract feed and the remainder uses travel feed; optional unsplit mode keeps travel as a single move.
- When wipes are present and inline is enabled: enforce a 50/50 minimum split of the configured minimum retract (half stationary, half wipe); wipes are capped/scaled to the target retract, and any remaining retract is inlined onto the first XY travel move.
- Keep extrusion mode assumptions: operates on relative extrusion patterns (`G1 E-…` / `G1 E…`).

## Interfaces
- CLI: `node dist/index.js --input <in> --output <out> [--min <mm>] [--max <mm>] [--inlineDuringTravel]`.
- Server/UI: exposes `/api/adjust`; UI allows min/max, input file, and "Retract during travel" toggle (works with wipes).

## Defaults and limits
- Default min retract 2 mm; default max retract 8 mm unless overridden.
- Travel distance thresholds: minTravel 10 mm; maxTravel 100 mm.
- Upload limit 500 MB on server; oversize returns JSON error.

## Behavior guarantees
- Preserve original travel feed values; preserve retract feed values when present.
- Time estimate headers/comments: return slicer estimate when present and a calibrated adjusted estimate; include in response headers and injected comments.
- If port 3002 is occupied, server attempts to free it before starting.

## Non-goals / caveats
- Absolute extrusion patterns are not fully supported.
- If no matching deretract is found, leave the retract untouched.

## Testing
- `npm test` validates fixtures including inline-during-travel behavior.
- Build with `npm run build`; dev server via `npm run start:server` (or `npm run dev:server`).
