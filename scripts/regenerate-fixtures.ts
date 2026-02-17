import fs from 'fs';
import path from 'path';
import { buildAdjustedOutput } from '../src/output';

const fixturesDir = path.join(__dirname, '..', 'test', 'fixtures');
const inputMain = path.join(__dirname, '..', 'test', 'retraction-test.gcode');
const inputNoWipe = path.join(__dirname, '..', 'test', 'retraction-test-no-wipe.gcode');

const readLines = (p: string) => fs.readFileSync(p, 'utf8').split(/\r?\n/);
const writeLines = (p: string, lines: string[]) => fs.writeFileSync(p, lines.join('\n'));

function gen(inputPath: string, options: Parameters<typeof buildAdjustedOutput>[1], outName: string) {
  const lines = readLines(inputPath);
  const { outputLines } = buildAdjustedOutput(lines, options);
  const outPath = path.join(fixturesDir, outName);
  writeLines(outPath, outputLines);
  console.log(`wrote ${outName} lines: ${outputLines.length}`);
}

gen(inputMain, {
  minRetract: 2,
  maxRetract: 5,
  minTravel: 10,
  maxTravel: 100,
  inlineDuringTravel: true,
  decimalPlaces: 5,
  inputName: path.basename(inputMain),
}, 'retraction-test.inline.expected.gcode');

gen(inputMain, {
  minRetract: 2,
  maxRetract: 5,
  minTravel: 10,
  maxTravel: 100,
  inlineDuringTravel: true,
  splitInlineTravel: true,
  decimalPlaces: 5,
  inputName: path.basename(inputMain),
}, 'retraction-test.inline.split.expected.gcode');

gen(inputNoWipe, {
  minRetract: 2,
  maxRetract: 5,
  minTravel: 10,
  maxTravel: 100,
  inlineDuringTravel: true,
  decimalPlaces: 5,
  inputName: path.basename(inputNoWipe),
}, 'retraction-test-no-wipe.expected.gcode');
