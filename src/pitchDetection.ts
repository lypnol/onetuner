/**
 * Pitch detection: HPS (Harmonic Product Spectrum) + YIN hybrid.
 *
 * HPS identifies the true fundamental by exploiting harmonic structure —
 * it multiplies downsampled copies of the magnitude spectrum so the
 * fundamental is the only bin where all harmonics align. This kills
 * octave errors and suppresses inharmonic noise.
 *
 * YIN provides sub-sample precision via parabolic interpolation.
 *
 * Strategy: run both, use HPS to validate/correct YIN when it locks
 * onto a harmonic instead of the fundamental.
 */

const YIN_THRESHOLD = 0.15;
const HPS_HARMONICS = 5; // multiply spectrum at 1x, 2x, 3x, 4x, 5x
const MIN_FREQ = 30;
const MAX_FREQ = 5000;

// ── FFT (radix-2, in-place, Cooley–Tukey) ──────────────────────────

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  // Butterfly passes
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const a = i + j;
        const b = a + halfLen;
        const tRe = curRe * re[b] - curIm * im[b];
        const tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

// ── Hann window (pre-computed per buffer size) ──────────────────────

const hannCache = new Map<number, Float64Array>();
function getHann(n: number): Float64Array {
  let w = hannCache.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    }
    hannCache.set(n, w);
  }
  return w;
}

// ── HPS: find fundamental via harmonic product spectrum ─────────────

function hpsDetect(buffer: Float32Array, sampleRate: number): number | null {
  const n = buffer.length;
  const hann = getHann(n);

  // Windowed FFT
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = buffer[i] * hann[i];
  }
  fft(re, im);

  // Magnitude spectrum (only need first half)
  const halfN = n >> 1;
  const mag = new Float64Array(halfN);
  for (let i = 0; i < halfN; i++) {
    mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }

  // Frequency resolution
  const binHz = sampleRate / n;

  // HPS range: bins corresponding to MIN_FREQ..MAX_FREQ
  const minBin = Math.max(1, Math.ceil(MIN_FREQ / binHz));
  const maxBin = Math.min(Math.floor(MAX_FREQ / binHz), Math.floor(halfN / HPS_HARMONICS));

  // Build harmonic product spectrum
  const hps = new Float64Array(maxBin + 1);
  for (let bin = minBin; bin <= maxBin; bin++) {
    let product = mag[bin];
    for (let h = 2; h <= HPS_HARMONICS; h++) {
      const hBin = bin * h;
      if (hBin < halfN) {
        product *= mag[hBin];
      } else {
        product = 0;
        break;
      }
    }
    hps[bin] = product;
  }

  // Find peak
  let peakBin = minBin;
  let peakVal = hps[minBin];
  for (let bin = minBin + 1; bin <= maxBin; bin++) {
    if (hps[bin] > peakVal) {
      peakVal = hps[bin];
      peakBin = bin;
    }
  }

  if (peakVal === 0) return null;

  // Parabolic interpolation on the HPS peak for sub-bin accuracy
  const s0 = peakBin > 0 ? hps[peakBin - 1] : hps[peakBin];
  const s1 = hps[peakBin];
  const s2 = peakBin + 1 <= maxBin ? hps[peakBin + 1] : hps[peakBin];
  const denom = 2 * (s0 - 2 * s1 + s2);
  const interpBin = denom !== 0 ? peakBin + (s0 - s2) / denom : peakBin;

  return interpBin * binHz;
}

// ── YIN pitch detection ─────────────────────────────────────────────

function yinDetect(
  buffer: Float32Array,
  sampleRate: number
): number | null {
  const halfLen = Math.floor(buffer.length / 2);
  const diff = new Float32Array(halfLen);

  // Squared difference
  for (let tau = 0; tau < halfLen; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const d = buffer[i] - buffer[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalized difference
  const cmndf = new Float32Array(halfLen);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] / (runningSum / tau);
  }

  // Absolute threshold — find first dip below threshold
  let tauEstimate = -1;
  for (let tau = 2; tau < halfLen; tau++) {
    if (cmndf[tau] < YIN_THRESHOLD) {
      while (tau + 1 < halfLen && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) return null;

  // Parabolic interpolation
  const s0 = cmndf[tauEstimate - 1] ?? cmndf[tauEstimate];
  const s1 = cmndf[tauEstimate];
  const s2 = cmndf[tauEstimate + 1] ?? cmndf[tauEstimate];
  const betterTau =
    tauEstimate + (s0 - s2) / (2 * (s0 - 2 * s1 + s2) || 1);

  const frequency = sampleRate / betterTau;
  if (frequency < MIN_FREQ || frequency > MAX_FREQ) return null;

  return frequency;
}

// ── Combined detector: HPS validates YIN ────────────────────────────

/**
 * Detects pitch using HPS+YIN hybrid.
 * YIN is precise but can lock onto harmonics (octave errors).
 * HPS is robust to harmonics but has coarser resolution.
 * We use HPS as the truth for which octave we're in, and YIN for precision.
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number
): number | null {
  const yinFreq = yinDetect(buffer, sampleRate);
  const hpsFreq = hpsDetect(buffer, sampleRate);

  // If neither detected anything, no pitch
  if (!yinFreq && !hpsFreq) return null;

  // If only one succeeded, use it
  if (!yinFreq) return hpsFreq;
  if (!hpsFreq) return yinFreq;

  // Both detected — check if YIN locked onto a harmonic of the HPS fundamental.
  // If YIN is ~Nx the HPS frequency (within 1 semitone), correct it down.
  const ratio = yinFreq / hpsFreq;
  const roundedRatio = Math.round(ratio);

  if (roundedRatio >= 2 && roundedRatio <= 6) {
    // Check if ratio is close to an integer (within ~1 semitone = ~6%)
    const deviation = Math.abs(ratio - roundedRatio) / roundedRatio;
    if (deviation < 0.06) {
      // YIN locked onto a harmonic — use HPS frequency but
      // refine with YIN's sub-harmonic precision
      return yinFreq / roundedRatio;
    }
  }

  // If they roughly agree (within 1 semitone), prefer YIN for precision
  const semitoneDiff = Math.abs(12 * Math.log2(yinFreq / hpsFreq));
  if (semitoneDiff < 1) {
    return yinFreq;
  }

  // Disagreement — trust HPS (more robust against harmonics/noise)
  return hpsFreq;
}

/**
 * Check if buffer has enough energy to consider it "sound".
 */
export function hasSignal(buffer: Float32Array, threshold = 0.002): boolean {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sum / buffer.length);
  return rms > threshold;
}
