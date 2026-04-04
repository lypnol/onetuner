/**
 * YIN pitch detection algorithm.
 * Reference: De Cheveigné & Kawahara (2002)
 */

const YIN_THRESHOLD = 0.15;

export function detectPitch(
  buffer: Float32Array,
  sampleRate: number
): number | null {
  const halfLen = Math.floor(buffer.length / 2);
  const diff = new Float32Array(halfLen);

  // Step 1-2: Squared difference function
  for (let tau = 0; tau < halfLen; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const d = buffer[i] - buffer[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // Step 3: Cumulative mean normalized difference
  const cmndf = new Float32Array(halfLen);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] / (runningSum / tau);
  }

  // Step 4: Absolute threshold — find first dip below threshold
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

  // Step 5: Parabolic interpolation for sub-sample accuracy
  const s0 = cmndf[tauEstimate - 1] ?? cmndf[tauEstimate];
  const s1 = cmndf[tauEstimate];
  const s2 = cmndf[tauEstimate + 1] ?? cmndf[tauEstimate];
  const betterTau =
    tauEstimate + (s0 - s2) / (2 * (s0 - 2 * s1 + s2) || 1);

  const frequency = sampleRate / betterTau;

  // Reject implausible frequencies (human instrument range ~30-5000 Hz)
  if (frequency < 30 || frequency > 5000) return null;

  return frequency;
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
