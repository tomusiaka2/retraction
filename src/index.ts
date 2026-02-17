import fs from 'fs';
import path from 'path';
import { adjustGcodeLines } from './adjuster';
import { estimateTimeSeconds, parseSlicerEstimateSeconds } from './estimator';
import { buildAdjustedOutput } from './output';

interface CliArgs {
  input: string;
  output?: string;
  min?: number;
  max?: number;
  help?: boolean;
}

function printHelp(): void {
  console.log(`Usage: retraction-adjust --input <file.gcode> [options]

Options:
  --input, -i     Path to the source G-code file (required)
  --output, -o    Path for the adjusted output file (default: <name>.adjusted.gcode)
  --min           Minimum retraction/deretraction length in mm (default: 2)
  --max           Maximum retraction/deretraction length in mm (default: 6)
  --help, -h      Show this help message

Behavior:
  - Retraction and deretraction start at 6 mm.
  - Travel <= 10 mm => 2 mm retraction/deretraction.
  - Travel >= 100 mm => 6 mm retraction/deretraction.
  - Travel between 10 mm and 100 mm => linear scaling between 2 and 6 mm.
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { input: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--input':
      case '-i':
        args.input = argv[++i];
        break;
      case '--output':
      case '-o':
        args.output = argv[++i];
        break;
      case '--min':
        args.min = Number(argv[++i]);
        break;
      case '--max':
        args.max = Number(argv[++i]);
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.input) {
    printHelp();
    if (!args.input) process.exitCode = 1;
    return;
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  const baseName = path.basename(args.input, path.extname(args.input));

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const gcodeText = fs.readFileSync(inputPath, 'utf8');
  const lines = gcodeText.split(/\r?\n/);

  const minRetract = args.min ?? 2;
  const maxRetract = args.max ?? 6;

  const build = buildAdjustedOutput(lines, {
    minRetract,
    maxRetract,
    minTravel: 10,
    maxTravel: 100,
    inputName: path.basename(args.input),
  });

  const {
    outputLines,
    adjustedLines,
    originalSeconds,
    adjustedSeconds,
    slicerSeconds,
    adjustedCalibratedSeconds,
    chosenSeconds,
  } = build;
  const deltaSeconds = originalSeconds - adjustedSeconds;

  const formatTime = (seconds: number) => {
    if (seconds >= 3600) return `${(seconds / 3600).toFixed(2)} h`;
    if (seconds >= 60) return `${(seconds / 60).toFixed(1)} min`;
    return `${seconds.toFixed(1)} s`;
  };

  const formatSlug = (seconds: number) => {
    const totalMinutes = Math.round(seconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h${m.toString().padStart(2, '0')}m`;
  };

  const autoName = `${baseName}_adj-${formatSlug(chosenSeconds)}.gcode`;
  const outputPath = path.resolve(process.cwd(), args.output || autoName);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf8');

  console.log(`Adjusted file written to: ${outputPath}`);
  console.log(`Original estimate: ${formatTime(originalSeconds)} (${originalSeconds.toFixed(1)} s)`);
  console.log(`Adjusted estimate: ${formatTime(adjustedSeconds)} (${adjustedSeconds.toFixed(1)} s)`);
  console.log(`Time saved: ${deltaSeconds > 0 ? formatTime(deltaSeconds) : '0 s'}`);
  if (slicerSeconds) {
    console.log(`Slicer estimate (from file): ${formatTime(slicerSeconds)} (${slicerSeconds.toFixed(1)} s)`);
    if (adjustedCalibratedSeconds) {
      const calSaved = slicerSeconds - adjustedCalibratedSeconds;
      console.log(`Adjusted (calibrated): ${formatTime(adjustedCalibratedSeconds)} (${adjustedCalibratedSeconds.toFixed(1)} s)`);
      console.log(`Saved (calibrated): ${calSaved > 0 ? formatTime(calSaved) : '0 s'}`);
    }
  }
}

main();
