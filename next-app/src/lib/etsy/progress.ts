export interface EtsySyncProgress {
  step: string;
  uploaded?: number;
  total?: number;
}

/** Convert per-request image progress into progress for the complete sync run. */
export function cumulativeImageProgress(
  progress: EtsySyncProgress,
  fixedTotal: number,
): EtsySyncProgress {
  if (progress.step !== 'images' || progress.total == null) return progress;

  const remainingBeforeBatch = Math.max(0, progress.total);
  const completedBeforeBatch = Math.max(0, fixedTotal - remainingBeforeBatch);
  const completedThisBatch = Math.max(0, progress.uploaded ?? 0);

  return {
    ...progress,
    uploaded: Math.min(fixedTotal, completedBeforeBatch + completedThisBatch),
    total: fixedTotal,
  };
}
