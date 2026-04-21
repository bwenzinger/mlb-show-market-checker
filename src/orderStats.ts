const OUTLIER_IQR_MULTIPLIER = 3;

function average(values: number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: number[], quantile: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = (sortedValues.length - 1) * quantile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];

  if (lowerIndex === upperIndex) {
    return lowerValue;
  }

  const weight = index - lowerIndex;
  return lowerValue + (upperValue - lowerValue) * weight;
}

export function calculateRobustAverage(values: number[]): number | null {
  const sortedValues = values
    .filter((value) => Number.isFinite(value))
    .slice()
    .sort((a, b) => a - b);

  if (sortedValues.length === 0) {
    return null;
  }

  if (sortedValues.length < 4) {
    return average(sortedValues);
  }

  const firstQuartile = percentile(sortedValues, 0.25);
  const thirdQuartile = percentile(sortedValues, 0.75);
  const interquartileRange = thirdQuartile - firstQuartile;
  const lowerFence =
    firstQuartile - interquartileRange * OUTLIER_IQR_MULTIPLIER;
  const upperFence =
    thirdQuartile + interquartileRange * OUTLIER_IQR_MULTIPLIER;
  const filteredValues = sortedValues.filter(
    (value) => value >= lowerFence && value <= upperFence
  );

  return average(filteredValues.length > 0 ? filteredValues : sortedValues);
}
