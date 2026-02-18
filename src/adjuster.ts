export interface AdjustOptions {
  minRetract: number;
  maxRetract: number;
  minTravel: number;
  maxTravel: number;
  decimalPlaces?: number;
  inlineDuringTravel?: boolean;
}

interface Move {
  isMove: boolean;
  x?: number;
  y?: number;
  z?: number;
  e?: number;
  f?: number;
}

interface Position {
  x: number;
  y: number;
}

interface RetractionDelta {
  index: number;
  value: number;
  isWipe: boolean;
}

interface RetractionState {
  startIndex: number;
  startPos: Position;
  eDeltas: RetractionDelta[];
  originalAmount: number;
  travelIndices: number[];
  travelMoves: Array<{ index: number; start: Position; end: Position; f?: number; z?: number; raw: string }>;
  retractFeed?: number;
}

const DEFAULT_OPTIONS: AdjustOptions = {
  minRetract: 2,
  maxRetract: 8,
  minTravel: 10,
  maxTravel: 100,
  decimalPlaces: 5,
};

export function computeRetraction(travel: number, options: AdjustOptions = DEFAULT_OPTIONS): number {
  const { minRetract, maxRetract, minTravel, maxTravel } = options;
  if (travel <= minTravel) return minRetract;
  if (travel >= maxTravel) return maxRetract;

  const ratio = (travel - minTravel) / (maxTravel - minTravel);
  return minRetract + ratio * (maxRetract - minRetract);
}

function parseMove(line: string): Move {
  const trimmed = line.trim();
  const isMove = /^G0?1\s/i.test(trimmed);
  if (!isMove) return { isMove: false };

  const match = (axis: string) => {
    const res = trimmed.match(new RegExp(`${axis}(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+))`, 'i'));
    return res ? Number(res[1]) : undefined;
  };

  return {
    isMove: true,
    x: match('X'),
    y: match('Y'),
    z: match('Z'),
    e: match('E'),
    f: match('F'),
  };
}

function formatCoord(value: number, decimalPlaces = DEFAULT_OPTIONS.decimalPlaces): string {
  return value.toFixed(decimalPlaces);
}

function formatE(value: number, decimalPlaces = DEFAULT_OPTIONS.decimalPlaces): string {
  return `E${value.toFixed(decimalPlaces)}`;
}

function replaceEValue(line: string, newE: number, decimalPlaces = DEFAULT_OPTIONS.decimalPlaces): string {
  if (!/E-?(?:\d|\.\d)/i.test(line)) return line;
  return line.replace(/E-?(?:\d+(?:\.\d+)?|\.\d+)/i, formatE(newE, decimalPlaces));
}

function upsertEValue(line: string, newE: number, decimalPlaces = DEFAULT_OPTIONS.decimalPlaces): string {
  if (/E-?(?:\d|\.\d)/i.test(line)) return replaceEValue(line, newE, decimalPlaces);

  const semicolonIndex = line.indexOf(';');
  if (semicolonIndex === -1) {
    return `${line.trimEnd()} ${formatE(newE, decimalPlaces)}`;
  }

  const code = line.slice(0, semicolonIndex).trimEnd();
  const comment = line.slice(semicolonIndex);
  const prefix = code.length > 0 ? `${code} ${formatE(newE, decimalPlaces)}` : formatE(newE, decimalPlaces);
  return `${prefix} ${comment}`;
}

function replaceFValue(line: string, newF: number): string {
  if (!/F-?(?:\d|\.\d)/i.test(line)) return line;
  return line.replace(/F-?(?:\d+(?:\.\d+)?|\.\d+)/i, `F${newF}`);
}

function upsertFValue(line: string, newF: number): string {
  if (/F-?(?:\d|\.\d)/i.test(line)) return replaceFValue(line, newF);

  const semicolonIndex = line.indexOf(';');
  if (semicolonIndex === -1) {
    return `${line.trimEnd()} F${newF}`;
  }

  const code = line.slice(0, semicolonIndex).trimEnd();
  const comment = line.slice(semicolonIndex);
  const prefix = code.length > 0 ? `${code} F${newF}` : `F${newF}`;
  return `${prefix} ${comment}`;
}

function distance(a: Position, b: Position): number {
  const dx = (b.x ?? a.x) - a.x;
  const dy = (b.y ?? a.y) - a.y;
  return Math.hypot(dx, dy);
}

export function adjustGcodeLines(lines: string[], options: AdjustOptions = DEFAULT_OPTIONS): string[] {
  const decimalPlaces = options.decimalPlaces !== undefined ? options.decimalPlaces : DEFAULT_OPTIONS.decimalPlaces;
  const inlineDuringTravel = options.inlineDuringTravel ?? false;
  let currentPos: Position = { x: 0, y: 0 };
  let state: RetractionState | null = null;
  let travel = 0;
  const removals = new Set<number>();
  // insertions map retained for future insertions, currently unused
  const insertions = new Map<number, string[]>();
  const epsilon = 1e-6;
  let inWipe = false;

  const updated = [...lines];

  lines.forEach((line, index) => {
    if (/;\s*WIPE_START/i.test(line)) inWipe = true;
    if (/;\s*WIPE_END/i.test(line)) inWipe = false;

    const move = parseMove(line);

    if (!state) {
      if (move.isMove && typeof move.e === 'number' && move.e < 0) {
        state = {
          startIndex: index,
          startPos: { ...currentPos },
          eDeltas: [{ index, value: move.e, isWipe: inWipe }],
          originalAmount: Math.abs(move.e),
          travelIndices: [],
            travelMoves: [],
          retractFeed: move.f,
        };
        travel = 0;
      }
    } else {
      if (move.isMove && typeof move.e === 'number') {
        // Collect extrusion deltas (negative and positive) within the segment.
        state.eDeltas.push({ index, value: move.e, isWipe: inWipe });

        if (move.e > 0) {
          // Deretraction encountered: rescale entire segment so total retract matches target.
          const negatives = state.eDeltas.filter((d) => d.value < 0);
          const totalRetract = negatives.reduce((sum, d) => sum + Math.abs(d.value), 0);

          const targetRetract = computeRetraction(travel, options);
          const clamped = Math.min(Math.max(targetRetract, options.minRetract), options.maxRetract);

          const hasWipeMoves = negatives.some((d) => d.isWipe);
          const wipeMoves = negatives.slice(1).filter((d) => d.isWipe);
          const wipeTotal = wipeMoves.reduce((s, d) => s + Math.abs(d.value), 0);
          const canInlineRetract = inlineDuringTravel && state.travelIndices.length > 0;
          const shouldInlineRetract = canInlineRetract && clamped > options.minRetract + epsilon;

          if (shouldInlineRetract) {
            // When wipes are present, bias the lead retract upward if the wipe is short so the minimum retract is met before the wipe.
            const preferredWipe = hasWipeMoves ? Math.min(wipeTotal, options.minRetract * 0.5) : 0;
            const leadTarget = hasWipeMoves
              ? Math.max(options.minRetract - wipeTotal, options.minRetract * 0.5)
              : options.minRetract;
            const stationaryRetract = Math.min(clamped, leadTarget);
            let remainingBudget = clamped - stationaryRetract;

            negatives.slice(1).forEach((delta) => {
              if (!delta.isWipe) removals.add(delta.index);
            });

            const lead = negatives[0];
            if (lead) {
              if (stationaryRetract < epsilon) {
                removals.add(lead.index);
              } else {
                updated[lead.index] = replaceEValue(updated[lead.index], -stationaryRetract, decimalPlaces);
              }
            }

            if (wipeMoves.length > 0 && remainingBudget > epsilon) {
              const targetWipe = Math.min(remainingBudget, preferredWipe);
              const scale = wipeTotal > epsilon ? targetWipe / wipeTotal : 0;

              let used = 0;
              wipeMoves.forEach((delta, idx) => {
                const magnitude = Math.abs(delta.value);
                const targetMag = scale > 0 ? magnitude * scale : 0;
                const newMag = idx === wipeMoves.length - 1
                  ? Math.max(0, targetWipe - used)
                  : targetMag;
                const newE = delta.value < 0 ? -newMag : newMag;

                if (Math.abs(newE) < epsilon) {
                  removals.add(delta.index);
                } else {
                  updated[delta.index] = replaceEValue(updated[delta.index], newE, decimalPlaces);
                }

                used += newMag;
              });

              remainingBudget = Math.max(remainingBudget - targetWipe, 0);
            }

            let remainingInline = Math.max(remainingBudget, 0);
            const travelIndex = state.travelIndices[0];
            if (travelIndex !== undefined && remainingInline > epsilon) {
              updated[travelIndex] = upsertEValue(updated[travelIndex], -remainingInline, decimalPlaces);
              remainingInline = 0;
            }

            if (remainingInline > epsilon && lead) {
              removals.delete(lead.index);
              updated[lead.index] = replaceEValue(
                updated[lead.index],
                -(stationaryRetract + remainingInline),
                decimalPlaces,
              );
            }

            updated[index] = replaceEValue(updated[index], clamped, decimalPlaces);
            state = null;
            return;
          }

          if (clamped < totalRetract - epsilon) {
            // Shorten proportionally while keeping per-move speed: scale the lead retract, then trim wipe moves by keeping full moves until the wipe budget is met and shortening the final kept wipe move.
            const negatives = state.eDeltas.filter((d) => d.value < 0);
            if (negatives.length > 0) {
              const ratio = clamped / totalRetract;
              const first = negatives[0];
              const firstMag = Math.abs(first.value);
              const wipeMoves = negatives.slice(1).filter((d) => d.isWipe);
              const tailMoves = negatives.slice(1).filter((d) => !d.isWipe);
              const wipeTotal = wipeMoves.reduce((s, d) => s + Math.abs(d.value), 0);
              const tailTotal = tailMoves.reduce((s, d) => s + Math.abs(d.value), 0);
              const targetFirstMag = firstMag * ratio;
              const targetWipe = wipeTotal * ratio;
              const targetTail = tailTotal * ratio;

              // Apply scaled lead retract
              if (targetFirstMag < epsilon) {
                removals.add(first.index);
              } else {
                const scaledFirst = first.value < 0 ? -targetFirstMag : targetFirstMag;
                updated[first.index] = replaceEValue(updated[first.index], scaledFirst, decimalPlaces);
              }

              const trimBudget = (budget: number, deltas: RetractionDelta[]) => {
                let remaining = budget;
                deltas.forEach((delta) => {
                  if (remaining <= epsilon) {
                    removals.add(delta.index);
                    return;
                  }

                  const magnitude = Math.abs(delta.value);
                  if (magnitude <= remaining + epsilon) {
                    updated[delta.index] = replaceEValue(updated[delta.index], delta.value, decimalPlaces);
                    remaining -= magnitude;
                  } else {
                    const newMag = remaining;
                    const newE = delta.value < 0 ? -newMag : newMag;
                    if (Math.abs(newE) < epsilon) {
                      removals.add(delta.index);
                    } else {
                      updated[delta.index] = replaceEValue(updated[delta.index], newE, decimalPlaces);
                    }
                    remaining = 0;
                  }
                });
              };

              trimBudget(targetWipe, wipeMoves);
              trimBudget(targetTail, tailMoves);
            }
          } else {
            const scale = totalRetract > 0 ? clamped / totalRetract : 1;
            state.eDeltas.forEach((delta) => {
              const newE = delta.value * scale;
              if (Math.abs(newE) < epsilon) {
                removals.add(delta.index);
              } else {
                updated[delta.index] = replaceEValue(updated[delta.index], newE, decimalPlaces);
              }
            });
          }

          // Ensure final deretract equals target retract magnitude
          updated[index] = replaceEValue(updated[index], clamped, decimalPlaces);

          state = null;
        }
      } else if (move.isMove && (move.e === undefined || move.e === 0)) {
        const hasXYChange = move.x !== undefined || move.y !== undefined;
        if (hasXYChange) {
          const nextPos: Position = {
            x: move.x ?? currentPos.x,
            y: move.y ?? currentPos.y,
          };
          travel += distance(currentPos, nextPos);
          state.travelIndices.push(index);
          state.travelMoves.push({ index, start: { ...currentPos }, end: nextPos, f: move.f, z: move.z, raw: line });
          currentPos = nextPos;
        }
        return; // position already updated when XY changed
      }
    }

    if (move.isMove) {
      currentPos = {
        x: move.x ?? currentPos.x,
        y: move.y ?? currentPos.y,
      };
    }
  });

  const result: string[] = [];
  updated.forEach((line, idx) => {
    if (line === undefined || line === null) return;
    if (removals.has(idx)) return;
    result.push(line);
  });

  return result;
}
