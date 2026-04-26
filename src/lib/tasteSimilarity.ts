import type { MovieShowItem } from '../components/EntryRowMovieShow';

export interface TasteSimilarityConfig {
  alpha: number;
  beta: number;
  sigmaTop: number;
  sigmaBot: number;
  top10BoostWeight: number;
  topBoostCount: number;
  lowScoreCurveStrength: number;
  lowScoreCurveZeroMultiplier: number;
  confidenceK: number;
}

export interface TasteSimilarityComputation {
  score: number | null;
  overlapCount: number;
  confidence: number;
  baseSimilarity: number;
  boostedSimilarity: number;
  finalSimilarity: number;
  top10BonusNormalized: number;
  totalWeight: number;
  message?: string;
}

const DEFAULT_CONFIG: TasteSimilarityConfig = {
  alpha: 1.0,
  beta: 0.6,
  sigmaTop: 0.22,
  sigmaBot: 0.14,
  top10BoostWeight: 0.15,
  topBoostCount: 10,
  lowScoreCurveStrength: 0,
  lowScoreCurveZeroMultiplier: 4,
  confidenceK: 40,
};
const TASTE_SIMILARITY_CONFIG_STORAGE_KEY = 'clastone-taste-similarity-config-v1';
const TASTE_SIMILARITY_CONFIG_STORAGE_KEY_MOVIES = 'clastone-taste-similarity-config-movies-v1';
const TASTE_SIMILARITY_CONFIG_STORAGE_KEY_SHOWS = 'clastone-taste-similarity-config-shows-v1';

export function getDefaultTasteSimilarityConfig(): TasteSimilarityConfig {
  return { ...DEFAULT_CONFIG };
}

export function loadTasteSimilarityConfig(): TasteSimilarityConfig {
  if (typeof window === 'undefined') return getDefaultTasteSimilarityConfig();
  try {
    const raw = window.localStorage.getItem(TASTE_SIMILARITY_CONFIG_STORAGE_KEY);
    if (!raw) return getDefaultTasteSimilarityConfig();
    const parsed = JSON.parse(raw) as Partial<TasteSimilarityConfig>;
    return {
      alpha: Number.isFinite(parsed.alpha) ? Number(parsed.alpha) : DEFAULT_CONFIG.alpha,
      beta: Number.isFinite(parsed.beta) ? Number(parsed.beta) : DEFAULT_CONFIG.beta,
      sigmaTop: Number.isFinite(parsed.sigmaTop) ? Number(parsed.sigmaTop) : DEFAULT_CONFIG.sigmaTop,
      sigmaBot: Number.isFinite(parsed.sigmaBot) ? Number(parsed.sigmaBot) : DEFAULT_CONFIG.sigmaBot,
      top10BoostWeight: Number.isFinite(parsed.top10BoostWeight)
        ? Number(parsed.top10BoostWeight)
        : DEFAULT_CONFIG.top10BoostWeight,
      topBoostCount: Number.isFinite(parsed.topBoostCount)
        ? Math.max(1, Math.round(Number(parsed.topBoostCount)))
        : DEFAULT_CONFIG.topBoostCount,
      lowScoreCurveStrength: Number.isFinite(parsed.lowScoreCurveStrength)
        ? Math.max(0, Math.min(1, Number(parsed.lowScoreCurveStrength)))
        : DEFAULT_CONFIG.lowScoreCurveStrength,
      lowScoreCurveZeroMultiplier: Number.isFinite(parsed.lowScoreCurveZeroMultiplier)
        ? Math.max(1, Number(parsed.lowScoreCurveZeroMultiplier))
        : DEFAULT_CONFIG.lowScoreCurveZeroMultiplier,
      confidenceK: Number.isFinite(parsed.confidenceK) ? Number(parsed.confidenceK) : DEFAULT_CONFIG.confidenceK,
    };
  } catch {
    return getDefaultTasteSimilarityConfig();
  }
}

export function saveTasteSimilarityConfig(config: TasteSimilarityConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TASTE_SIMILARITY_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore localStorage failures (private mode/quota).
  }
}

function getScopedKey(scope: 'movies' | 'shows'): string {
  return scope === 'movies'
    ? TASTE_SIMILARITY_CONFIG_STORAGE_KEY_MOVIES
    : TASTE_SIMILARITY_CONFIG_STORAGE_KEY_SHOWS;
}

export function loadTasteSimilarityConfigScoped(scope: 'movies' | 'shows'): TasteSimilarityConfig {
  if (typeof window === 'undefined') return getDefaultTasteSimilarityConfig();
  try {
    const scoped = window.localStorage.getItem(getScopedKey(scope));
    if (scoped) {
      const parsed = JSON.parse(scoped) as Partial<TasteSimilarityConfig>;
      return {
        alpha: Number.isFinite(parsed.alpha) ? Number(parsed.alpha) : DEFAULT_CONFIG.alpha,
        beta: Number.isFinite(parsed.beta) ? Number(parsed.beta) : DEFAULT_CONFIG.beta,
        sigmaTop: Number.isFinite(parsed.sigmaTop) ? Number(parsed.sigmaTop) : DEFAULT_CONFIG.sigmaTop,
        sigmaBot: Number.isFinite(parsed.sigmaBot) ? Number(parsed.sigmaBot) : DEFAULT_CONFIG.sigmaBot,
        top10BoostWeight: Number.isFinite(parsed.top10BoostWeight)
          ? Number(parsed.top10BoostWeight)
          : DEFAULT_CONFIG.top10BoostWeight,
      topBoostCount: Number.isFinite(parsed.topBoostCount)
        ? Math.max(1, Math.round(Number(parsed.topBoostCount)))
        : DEFAULT_CONFIG.topBoostCount,
      lowScoreCurveStrength: Number.isFinite(parsed.lowScoreCurveStrength)
        ? Math.max(0, Math.min(1, Number(parsed.lowScoreCurveStrength)))
        : DEFAULT_CONFIG.lowScoreCurveStrength,
      lowScoreCurveZeroMultiplier: Number.isFinite(parsed.lowScoreCurveZeroMultiplier)
        ? Math.max(1, Number(parsed.lowScoreCurveZeroMultiplier))
        : DEFAULT_CONFIG.lowScoreCurveZeroMultiplier,
        confidenceK: Number.isFinite(parsed.confidenceK) ? Number(parsed.confidenceK) : DEFAULT_CONFIG.confidenceK,
      };
    }
    // Backward compatibility with the older single shared key.
    return loadTasteSimilarityConfig();
  } catch {
    return getDefaultTasteSimilarityConfig();
  }
}

export function saveTasteSimilarityConfigScoped(scope: 'movies' | 'shows', config: TasteSimilarityConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getScopedKey(scope), JSON.stringify(config));
  } catch {
    // Ignore localStorage failures (private mode/quota).
  }
}

function percentileForRank(rank: number, listLength: number): number {
  if (listLength <= 1) return 1.0;
  return 1 - (rank - 1) / (listLength - 1);
}

function gaussianWeight(q: number, config: TasteSimilarityConfig): number {
  const top = config.alpha * Math.exp(-((q - 1.0) ** 2) / (2 * (config.sigmaTop ** 2)));
  const bottom = config.beta * Math.exp(-(q ** 2) / (2 * (config.sigmaBot ** 2)));
  return top + bottom;
}

function rankMapForList(items: MovieShowItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < items.length; i += 1) {
    out.set(items[i].id, i + 1);
  }
  return out;
}

export function computeTasteSimilarity(
  mine: MovieShowItem[],
  theirs: MovieShowItem[],
  configInput?: Partial<TasteSimilarityConfig>
): TasteSimilarityComputation {
  const config: TasteSimilarityConfig = {
    ...DEFAULT_CONFIG,
    ...(configInput ?? {}),
  };

  const myRanks = rankMapForList(mine);
  const theirRanks = rankMapForList(theirs);
  const overlapIds: string[] = [];
  myRanks.forEach((_, id) => {
    if (theirRanks.has(id)) overlapIds.push(id);
  });

  const overlapCount = overlapIds.length;
  if (overlapCount < 5) {
    return {
      score: null,
      overlapCount,
      confidence: Math.tanh(overlapCount / config.confidenceK),
      baseSimilarity: 0,
      boostedSimilarity: 0,
      finalSimilarity: 0,
      top10BonusNormalized: 0,
      totalWeight: 0,
      message: 'Not enough shared movies to compare.',
    };
  }

  let rawScore = 0;
  let totalWeight = 0;

  for (const id of overlapIds) {
    const rankA = myRanks.get(id);
    const rankB = theirRanks.get(id);
    if (!rankA || !rankB) continue;

    const pA = percentileForRank(rankA, mine.length);
    const pB = percentileForRank(rankB, theirs.length);
    const q = (pA + pB) / 2;
    const w = gaussianWeight(q, config);
    const d = pA - pB;
    const agreement = 1 - 2 * Math.abs(d);
    const score = w * agreement;
    rawScore += score;
    totalWeight += w;
  }

  const baseSimilarity = totalWeight > 0 ? rawScore / totalWeight : 0;

  const top10A = mine.slice(0, Math.max(1, Math.round(config.topBoostCount)));
  let top10RawBonus = 0;
  const boostWindow = Math.max(1, Math.round(config.topBoostCount));
  const maxRankDiff = Math.max(1, boostWindow - 1);
  for (let i = 0; i < top10A.length; i += 1) {
    const item = top10A[i];
    const rankInB = theirRanks.get(item.id);
    if (!rankInB) continue;
    const rankDiff = Math.abs(i + 1 - rankInB);
    const positionAgreement = Math.max(0, 1 - rankDiff / maxRankDiff);
    top10RawBonus += positionAgreement;
  }
  const top10BonusNormalized = top10RawBonus / boostWindow;

  const boostedSimilarity =
    baseSimilarity +
    config.top10BoostWeight * top10BonusNormalized * (1 - baseSimilarity);

  const confidence = Math.tanh(overlapCount / config.confidenceK);
  const finalSimilarity = boostedSimilarity * confidence;

  // Optional grading-curve style lift for low positive scores:
  // at strength=1, 0 gets up to 3x multiplier and 100 gets 1x.
  const positivePercent = Math.max(0, Math.min(100, finalSimilarity * 100));
  const lambda = 0.045;
  const expAtScore = Math.exp(-lambda * positivePercent);
  const expAtMax = Math.exp(-lambda * 100);
  const decay01 = (expAtScore - expAtMax) / (1 - expAtMax); // 1 at score=0, 0 at score=100
  const decayPow3 = Math.max(0, Math.min(1, decay01)) ** 3;
  const zeroMult = Math.max(1, config.lowScoreCurveZeroMultiplier);
  const curveMultiplier = 1 + (zeroMult - 1) * config.lowScoreCurveStrength * decayPow3;
  const curvedSimilarity =
    finalSimilarity >= 0
      ? Math.min(1, finalSimilarity * curveMultiplier)
      : finalSimilarity;
  const score = Math.round(curvedSimilarity * 1000) / 10;

  return {
    score,
    overlapCount,
    confidence,
    baseSimilarity,
    boostedSimilarity,
    finalSimilarity: curvedSimilarity,
    top10BonusNormalized,
    totalWeight,
  };
}
