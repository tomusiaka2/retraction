import { adjustGcodeLines, AdjustOptions } from './adjuster';
import { estimateTimeSeconds, parseSlicerEstimateSeconds } from './estimator';

export interface BuildOptions extends AdjustOptions {
  inputName?: string;
}

export interface BuildResult {
  outputLines: string[];
  adjustedLines: string[];
  originalSeconds: number;
  adjustedSeconds: number;
  slicerSeconds: number | null;
  adjustedCalibratedSeconds: number | null;
  chosenSeconds: number;
  totalLayers: number;
}

export function buildAdjustedOutput(lines: string[], options: BuildOptions): BuildResult {
  const { inputName, ...adjustOptions } = options;

  const adjusted = adjustGcodeLines(lines, adjustOptions);

  const originalSeconds = estimateTimeSeconds(lines);
  const adjustedSeconds = estimateTimeSeconds(adjusted);
  const slicerSeconds = parseSlicerEstimateSeconds(lines, inputName ?? '');
  const calibration = slicerSeconds && originalSeconds > 0 ? slicerSeconds / originalSeconds : null;
  const adjustedCalibratedSeconds = calibration ? adjustedSeconds * calibration : null;
  const chosenSeconds = adjustedCalibratedSeconds ?? adjustedSeconds;

  const layerChangeRe = /^;LAYER_CHANGE\b/i;
  const adjustedWithLayers: string[] = [];
  let layerCount = 0;
  adjusted.forEach((line) => {
    adjustedWithLayers.push(line);
    if (layerChangeRe.test(line.trim())) {
      adjustedWithLayers.push(`;layer: ${layerCount}`);
      layerCount += 1;
    }
  });

  const header: string[] = [];
  const totalTimeSeconds = Math.round(chosenSeconds);
  header.push(`;total_time: ${totalTimeSeconds}`);
  header.push(`;total_layers: ${layerCount}`);
  header.push('');
  header.push(`; adjusted_time_sec=${adjustedSeconds.toFixed(3)}`);
  header.push(`; original_time_sec=${originalSeconds.toFixed(3)}`);
  if (slicerSeconds) header.push(`; slicer_time_sec=${slicerSeconds.toFixed(3)}`);
  if (adjustedCalibratedSeconds) header.push(`; adjusted_time_calibrated_sec=${adjustedCalibratedSeconds.toFixed(3)}`);

  const outputLines = [...header, ...adjustedWithLayers];

  return {
    outputLines,
    adjustedLines: adjusted,
    originalSeconds,
    adjustedSeconds,
    slicerSeconds,
    adjustedCalibratedSeconds,
    chosenSeconds,
    totalLayers: layerCount,
  };
}
