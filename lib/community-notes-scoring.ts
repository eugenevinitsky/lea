/**
 * Community Notes Bridging Algorithm
 *
 * Matrix factorization model that predicts each rating as:
 *   r_hat(u, n) = mu + i_u + i_n + f_u * f_n
 *
 * where:
 *   mu  = global intercept
 *   i_u = rater intercept (generous/harsh bias)
 *   i_n = note intercept (helpfulness score — key output)
 *   f_u = rater factor (1D viewpoint)
 *   f_n = note factor (1D viewpoint appeal)
 *
 * Intercept regularization (0.15) is 5x factor regularization (0.03).
 * This forces the model to explain variance through viewpoint factors first.
 * A note can only achieve a high intercept if raters across different viewpoints agree.
 */

// Hyperparameters
const EPOCHS = 300;
const LEARNING_RATE = 0.01;
const REG_INTERCEPT = 0.15;
const REG_FACTOR = 0.03;
// Adam optimizer params
const BETA1 = 0.9;
const BETA2 = 0.999;
const EPSILON = 1e-8;

// Minimum thresholds for inclusion
const MIN_RATINGS_PER_NOTE = 5;
const MIN_RATINGS_PER_RATER = 10;

// Status thresholds (from Twitter reference)
const CRH_INTERCEPT = 0.40;
const CRH_MAX_FACTOR = 0.50;
const CRNH_BASE = -0.05;
const CRNH_FACTOR_WEIGHT = 0.8;

export type NoteStatus = 'CRH' | 'CRNH' | 'NMR';

export interface Rating {
  noteId: string;
  raterDid: string;
  helpfulness: number; // 0.0, 0.5, or 1.0
}

export interface NoteScore {
  noteId: string;
  intercept: number;
  factor: number;
  ratingCount: number;
  status: NoteStatus;
}

function deriveStatus(intercept: number, factor: number): NoteStatus {
  if (intercept >= CRH_INTERCEPT && Math.abs(factor) < CRH_MAX_FACTOR) {
    return 'CRH';
  }
  if (intercept <= CRNH_BASE - CRNH_FACTOR_WEIGHT * Math.abs(factor)) {
    return 'CRNH';
  }
  return 'NMR';
}

/**
 * Adam optimizer state for a single parameter
 */
interface AdamState {
  m: number; // first moment
  v: number; // second moment
}

function adamUpdate(
  param: number,
  grad: number,
  state: AdamState,
  t: number,
  lr: number
): number {
  state.m = BETA1 * state.m + (1 - BETA1) * grad;
  state.v = BETA2 * state.v + (1 - BETA2) * grad * grad;
  const mHat = state.m / (1 - Math.pow(BETA1, t));
  const vHat = state.v / (1 - Math.pow(BETA2, t));
  return param - lr * mHat / (Math.sqrt(vHat) + EPSILON);
}

/**
 * Run the bridging matrix factorization algorithm.
 *
 * @param ratings - All ratings across all notes
 * @returns Array of NoteScore for each note that meets minimum thresholds
 */
export function scoreNotes(ratings: Rating[]): NoteScore[] {
  // Count ratings per note and per rater
  const noteRatingCounts = new Map<string, number>();
  const raterRatingCounts = new Map<string, number>();

  for (const r of ratings) {
    noteRatingCounts.set(r.noteId, (noteRatingCounts.get(r.noteId) ?? 0) + 1);
    raterRatingCounts.set(r.raterDid, (raterRatingCounts.get(r.raterDid) ?? 0) + 1);
  }

  // Filter: notes need ≥5 ratings, raters need ≥10 ratings
  const validNotes = new Set<string>();
  for (const [noteId, count] of noteRatingCounts) {
    if (count >= MIN_RATINGS_PER_NOTE) validNotes.add(noteId);
  }
  const validRaters = new Set<string>();
  for (const [raterDid, count] of raterRatingCounts) {
    if (count >= MIN_RATINGS_PER_RATER) validRaters.add(raterDid);
  }

  // Filter ratings to only valid note+rater pairs
  const filtered = ratings.filter(
    (r) => validNotes.has(r.noteId) && validRaters.has(r.raterDid)
  );

  if (filtered.length === 0) {
    // Return NMR for all notes that had ratings but didn't meet threshold
    return Array.from(noteRatingCounts.keys()).map((noteId) => ({
      noteId,
      intercept: 0,
      factor: 0,
      ratingCount: noteRatingCounts.get(noteId) ?? 0,
      status: 'NMR' as NoteStatus,
    }));
  }

  // Build index maps
  const noteIds = Array.from(new Set(filtered.map((r) => r.noteId)));
  const raterIds = Array.from(new Set(filtered.map((r) => r.raterDid)));
  const noteIdx = new Map<string, number>();
  const raterIdx = new Map<string, number>();
  noteIds.forEach((id, i) => noteIdx.set(id, i));
  raterIds.forEach((id, i) => raterIdx.set(id, i));

  const N = noteIds.length;
  const U = raterIds.length;

  // Initialize parameters
  let mu = 0.5; // global intercept starts at midpoint
  const noteIntercepts = new Float64Array(N); // i_n
  const noteFactor = new Float64Array(N); // f_n
  const raterIntercepts = new Float64Array(U); // i_u
  const raterFactor = new Float64Array(U); // f_u

  // Small random initialization for factors
  for (let i = 0; i < N; i++) noteFactor[i] = (Math.random() - 0.5) * 0.1;
  for (let i = 0; i < U; i++) raterFactor[i] = (Math.random() - 0.5) * 0.1;

  // Adam optimizer states
  const muAdam: AdamState = { m: 0, v: 0 };
  const noteInterceptAdam: AdamState[] = Array.from({ length: N }, () => ({ m: 0, v: 0 }));
  const noteFactorAdam: AdamState[] = Array.from({ length: N }, () => ({ m: 0, v: 0 }));
  const raterInterceptAdam: AdamState[] = Array.from({ length: U }, () => ({ m: 0, v: 0 }));
  const raterFactorAdam: AdamState[] = Array.from({ length: U }, () => ({ m: 0, v: 0 }));

  // Pre-index ratings for fast access
  const indexedRatings = filtered.map((r) => ({
    nIdx: noteIdx.get(r.noteId)!,
    uIdx: raterIdx.get(r.raterDid)!,
    value: r.helpfulness,
  }));

  // Training loop
  for (let epoch = 1; epoch <= EPOCHS; epoch++) {
    const t = epoch; // Adam timestep

    // Accumulate gradients
    let muGrad = REG_INTERCEPT * mu;
    const niGrads = new Float64Array(N);
    const nfGrads = new Float64Array(N);
    const riGrads = new Float64Array(U);
    const rfGrads = new Float64Array(U);

    // Initialize with regularization
    for (let i = 0; i < N; i++) {
      niGrads[i] = REG_INTERCEPT * noteIntercepts[i];
      nfGrads[i] = REG_FACTOR * noteFactor[i];
    }
    for (let i = 0; i < U; i++) {
      riGrads[i] = REG_INTERCEPT * raterIntercepts[i];
      rfGrads[i] = REG_FACTOR * raterFactor[i];
    }

    for (const { nIdx, uIdx, value } of indexedRatings) {
      const pred =
        mu +
        raterIntercepts[uIdx] +
        noteIntercepts[nIdx] +
        raterFactor[uIdx] * noteFactor[nIdx];
      const err = pred - value; // d(loss)/d(pred) = 2*(pred - value), we absorb the 2 into lr

      muGrad += err;
      riGrads[uIdx] += err;
      niGrads[nIdx] += err;
      rfGrads[uIdx] += err * noteFactor[nIdx];
      nfGrads[nIdx] += err * raterFactor[uIdx];
    }

    // Update parameters with Adam
    mu = adamUpdate(mu, muGrad, muAdam, t, LEARNING_RATE);
    for (let i = 0; i < N; i++) {
      noteIntercepts[i] = adamUpdate(noteIntercepts[i], niGrads[i], noteInterceptAdam[i], t, LEARNING_RATE);
      noteFactor[i] = adamUpdate(noteFactor[i], nfGrads[i], noteFactorAdam[i], t, LEARNING_RATE);
    }
    for (let i = 0; i < U; i++) {
      raterIntercepts[i] = adamUpdate(raterIntercepts[i], riGrads[i], raterInterceptAdam[i], t, LEARNING_RATE);
      raterFactor[i] = adamUpdate(raterFactor[i], rfGrads[i], raterFactorAdam[i], t, LEARNING_RATE);
    }
  }

  // Build results for ALL notes (including those that didn't meet threshold)
  const results: NoteScore[] = [];

  for (const noteId of noteRatingCounts.keys()) {
    const idx = noteIdx.get(noteId);
    const count = noteRatingCounts.get(noteId) ?? 0;

    if (idx !== undefined) {
      // Note was included in MF
      const intercept = noteIntercepts[idx];
      const factor = noteFactor[idx];
      results.push({
        noteId,
        intercept,
        factor,
        ratingCount: count,
        status: deriveStatus(intercept, factor),
      });
    } else {
      // Note didn't meet threshold — NMR
      results.push({
        noteId,
        intercept: 0,
        factor: 0,
        ratingCount: count,
        status: 'NMR',
      });
    }
  }

  return results;
}
