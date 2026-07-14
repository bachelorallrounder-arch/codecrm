// Basic priority calculation based on lead properties.
// Returns number between 0 and 10.
export const calcPriority = ({ sourceScore = 0, courseDemand = 0, attemptSuccess = 0, isHot = false, freshnessScore = 0, demoBooked = false }) => {
  // weights (tunable)
  const wSource = 1.5;
  const wCourse = 2;
  const wAttempt = 1.5;
  const wHot = 2;
  const wFresh = 1.5;
  const wDemo = 1.5;

  let score = (sourceScore * wSource) + (courseDemand * wCourse) + (attemptSuccess * wAttempt) + (freshnessScore * wFresh);
  if (isHot) score += wHot * 2;
  if (demoBooked) score += wDemo * 2;

  // normalize to 0-10
  const max = 10;
  if (score > max) score = max;
  if (score < 0) score = 0;
  return Math.round(score);
};
