import { FAR_Z } from './track';
import type { OpponentCar } from './types';

const LANES = [-0.66, -0.42, -0.18, 0.16, 0.42, 0.66];
const COLORS = [
  ['#ef476f', '#ffd166'],
  ['#118ab2', '#a7f3ff'],
  ['#06d6a0', '#e7fff7'],
  ['#ff8c42', '#fff0cf'],
  ['#7c5cff', '#d8d1ff'],
  ['#f72585', '#ffe1ef'],
];

export function makeOpponentCar(id: number, random: () => number): OpponentCar {
  const lane = LANES[Math.floor(random() * LANES.length)];
  const colorSet = COLORS[Math.floor(random() * COLORS.length)];

  return {
    id,
    z: FAR_Z * (0.88 + random() * 0.1),
    lane,
    width: 0.9 + random() * 0.28,
    cruiseSpeed: 82 + random() * 62,
    color: colorSet[0],
    accent: colorSet[1],
    passed: false,
  };
}

export function overtakeAward(lateralGap: number) {
  if (lateralGap < 0.13) {
    return { points: 800, label: 'Extreme +800', color: '#ffef5c' };
  }

  if (lateralGap < 0.25) {
    return { points: 300, label: 'Close +300', color: '#69f4ff' };
  }

  return { points: 100, label: 'Overtake +100', color: '#ffffff' };
}
