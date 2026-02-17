import express from 'express';
import multer from 'multer';
import path from 'path';
import { buildAdjustedOutput } from './output';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

const port = Number(process.env.PORT) || 3000;
// When compiled, __dirname points to dist/src, so walk up two levels to reach the project root public folder.
const publicDir = path.resolve(__dirname, '..', '..', 'public');

app.use(express.static(publicDir));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/adjust', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'File is required (field name: file)' });
    return;
  }

  const minValue = Number(req.body.min ?? 2);
  const maxValue = Number(req.body.max ?? 6);
  const minRetract = Number.isFinite(minValue) ? minValue : 2;
  const maxRetract = Number.isFinite(maxValue) ? maxValue : 6;
  const inlineDuringTravel = ['true', 'on', '1'].includes(String(req.body.inlineDuringTravel).toLowerCase());

  const startedAt = Date.now();
  console.log(`POST /api/adjust name="${req.file.originalname}" size=${req.file.size}B min=${minRetract} max=${maxRetract}`);

  try {
    const lines = req.file.buffer.toString('utf8').split(/\r?\n/);
    const build = buildAdjustedOutput(lines, {
      minRetract,
      maxRetract,
      minTravel: 10,
      maxTravel: 100,
      inputName: req.file.originalname,
      inlineDuringTravel,
    });

    const {
      outputLines,
      adjustedSeconds,
      originalSeconds,
      slicerSeconds,
      adjustedCalibratedSeconds,
      chosenSeconds,
    } = build;

    const deltaSeconds = originalSeconds - adjustedSeconds;
    const output = outputLines.join('\n');
    const outBuffer = Buffer.from(output, 'utf8');
    const baseName = req.file.originalname.replace(/\.gcode$/i, '') || 'file';
    const formatSlug = (seconds: number) => {
      const totalMinutes = Math.round(seconds / 60);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${h}h${m.toString().padStart(2, '0')}m`;
    };
    const filename = `${baseName}_adj-${formatSlug(chosenSeconds)}.gcode`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', outBuffer.length.toString());
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Original-Time-Sec', originalSeconds.toFixed(3));
    res.setHeader('X-Adjusted-Time-Sec', adjustedSeconds.toFixed(3));
    res.setHeader('X-Time-Saved-Sec', deltaSeconds.toFixed(3));
    if (slicerSeconds) res.setHeader('X-Slicer-Time-Sec', slicerSeconds.toFixed(3));
    if (adjustedCalibratedSeconds) res.setHeader('X-Adjusted-Time-Calibrated-Sec', adjustedCalibratedSeconds.toFixed(3));
    res.send(outBuffer);

    const ms = Date.now() - startedAt;
    console.log(`OK /api/adjust name="${req.file.originalname}" size=${req.file.size}B status=200 bytes=${outBuffer.length} timeMs=${ms}`);
  } catch (err) {
    console.error(`ERR /api/adjust name="${req.file.originalname}" size=${req.file.size}B`, err);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Simple error handler to surface multer/file errors as JSON
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'MulterError') {
    res.status(400).json({ error: (err as Error).message });
    return;
  }
  res.status(500).json({ error: 'Unexpected server error' });
});

app.listen(port, () => {
  // Simple startup log.
  console.log(`Server listening on http://localhost:${port}`);
});
