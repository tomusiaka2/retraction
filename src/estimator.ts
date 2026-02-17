interface ParsedMove {
  isMove: boolean;
  x?: number;
  y?: number;
  z?: number;
  e?: number;
  f?: number;
}

interface Position3D {
  x: number;
  y: number;
  z: number;
}

function parseMove(line: string): ParsedMove {
  const trimmed = line.trim();
  const isMove = /^G0?1\s/i.test(trimmed);
  if (!isMove && !/\bF-?\d/i.test(trimmed)) return { isMove: false };

  const match = (axis: string) => {
    const res = trimmed.match(new RegExp(`${axis}(-?\\d+(?:\\.\\d+)?)`, 'i'));
    return res ? Number(res[1]) : undefined;
  };

  return {
    isMove,
    x: match('X'),
    y: match('Y'),
    z: match('Z'),
    e: match('E'),
    f: match('F'),
  };
}

export function estimateTimeSeconds(lines: string[]): number {
  let pos: Position3D = { x: 0, y: 0, z: 0 };
  let ePos = 0;
  let feedrate = 0; // mm/min
  let totalSeconds = 0;

  for (const line of lines) {
    const move = parseMove(line);
    if (!move.isMove) {
      if (typeof move.f === 'number') {
        feedrate = move.f;
      }
      continue;
    }

    const next: Position3D = {
      x: move.x ?? pos.x,
      y: move.y ?? pos.y,
      z: move.z ?? pos.z,
    };

    const nextE = move.e !== undefined ? ePos + move.e : ePos;

    if (typeof move.f === 'number') {
      feedrate = move.f;
    }

    const xyzDistance = Math.hypot(next.x - pos.x, next.y - pos.y, next.z - pos.z);
    const eDistance = Math.abs(nextE - ePos);
    const distance = xyzDistance > 0 ? xyzDistance : eDistance;
    if (distance > 0 && feedrate > 0) {
      const speedMmPerSec = feedrate / 60;
      totalSeconds += distance / speedMmPerSec;
    }

    pos = next;
    ePos = nextE;
  }

  return totalSeconds;
}

function parseHmsToSeconds(text: string): number | null {
  const hoursMatch = text.match(/(\d+)\s*h/i);
  const minutesMatch = text.match(/(\d+)\s*m/i);
  const secondsMatch = text.match(/(\d+)\s*s/i);
  if (!hoursMatch && !minutesMatch && !secondsMatch) return null;
  const h = hoursMatch ? Number(hoursMatch[1]) : 0;
  const m = minutesMatch ? Number(minutesMatch[1]) : 0;
  const s = secondsMatch ? Number(secondsMatch[1]) : 0;
  return h * 3600 + m * 60 + s;
}

export function parseSlicerEstimateSeconds(lines: string[], fallbackName?: string): number | null {
  // PrusaSlicer comment pattern
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^;\s*estimated printing time/i.test(trimmed)) {
      const seconds = parseHmsToSeconds(trimmed);
      if (seconds != null) return seconds;
    }
    // SuperSlicer/Prusa TIME field
    const timeField = trimmed.match(/^;\s*TIME\s*:\s*(\d+)/i);
    if (timeField) return Number(timeField[1]);
  }

  // Fallback: infer from filename like name_16h19m.gcode
  if (fallbackName) {
    const fname = fallbackName.toLowerCase();
    const match = fname.match(/_(\d+)h(\d+)m/);
    if (match) {
      const h = Number(match[1]);
      const m = Number(match[2]);
      return h * 3600 + m * 60;
    }
  }

  return null;
}
