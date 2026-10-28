# Paper datasets

Benchmark runs kept for the paper and for artifact review. Each dataset is
three files with the same name: `.jsonl` (the raw record: environment, every
run, every frame), `.csv` (one row per configuration) and `.summary.json`
(interactivity limits and linear fit per series). See `bench/README.md` for
what the columns mean.

Reports for the team: [first results, M4 Max, 2026-10-08](REPORT-2026-10-08-m4max.md).

| Dataset | Machine | OS | Browser | Code |
|---|---|---|---|---|
| `m4max-20261008-1939` | Apple M4 Max, 14 cores, 36 GB, built-in GPU (Metal) | macOS (Darwin 27.0.0) | Chromium 151.0.7922.34, headed | `0c1f2a3` (squash-merged to `main` as `910262a`) |

Notes on `m4max-20261008-1939`:

- Full default sweep (`npm run bench`): 279 runs, 0 rejected, 0 crashed,
  41 skipped as past the 250 ms limit, 8 cut off by the time budget, 12
  repeated with a longer pacing gap.
- Measured before #73, which changed brush geometry and callbacks in `src/`.
  TimeWidget's numbers on current `main` may differ slightly; re-run before
  quoting them next to data from newer code.
- One high-end machine. Do not generalise to weaker GPUs from this alone.
