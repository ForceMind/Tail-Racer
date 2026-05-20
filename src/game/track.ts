import type { RoadSegment, TrackInfo } from './types';

export const CAMERA_DEPTH = 240;
export const FAR_Z = 2800;
export const NEAR_Z = 240;
export const ROAD_SLICE_COUNT = 92;

const ROAD_PALETTE = [
  {
    road: '#9a9288',
    shoulder: '#e7ded0',
    lane: '#ffffff',
    verge: '#78b85f',
  },
  {
    road: '#867f78',
    shoulder: '#ffffff',
    lane: '#e8f4ff',
    verge: '#69a955',
  },
];

const COURSE = [
  { length: 420, curve: 0 },
  { length: 680, curve: 0.48 },
  { length: 460, curve: 0 },
  { length: 760, curve: -0.62 },
  { length: 520, curve: -0.2 },
  { length: 620, curve: 0.82 },
  { length: 560, curve: 0 },
  { length: 720, curve: -0.78 },
  { length: 620, curve: 0.36 },
  { length: 520, curve: 0 },
];

const COURSE_LENGTH = COURSE.reduce((sum, section) => sum + section.length, 0);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sampleCourse(distance: number) {
  let cursor = ((distance % COURSE_LENGTH) + COURSE_LENGTH) % COURSE_LENGTH;

  for (const section of COURSE) {
    if (cursor <= section.length) {
      const progress = cursor / section.length;
      const fade = Math.sin(progress * Math.PI);
      return {
        curve: section.curve * fade,
        targetCurve: section.curve,
        progress,
      };
    }

    cursor -= section.length;
  }

  return { curve: 0, targetCurve: 0, progress: 0 };
}

export function getTrackInfo(distance: number): TrackInfo {
  const sample = sampleCourse(distance + 38);
  const curve = sample.curve;
  const innerSide = Math.abs(curve) < 0.12 ? 0 : curve > 0 ? 1 : -1;

  return {
    curve,
    innerSide,
    label: innerSide === 0 ? 'straight' : innerSide > 0 ? 'right' : 'left',
  };
}

export function buildRoadSegments(distance: number): RoadSegment[] {
  const segments: RoadSegment[] = [];

  for (let i = ROAD_SLICE_COUNT; i >= 0; i -= 1) {
    const depth = i / ROAD_SLICE_COUNT;
    const z = NEAR_Z + (FAR_Z - NEAR_Z) * depth;
    segments.push(getRoadSegmentAt(distance, z));
  }

  return segments;
}

export function getRoadSegmentAt(distance: number, z: number): RoadSegment {
  const clampedZ = clamp(z, NEAR_Z, FAR_Z);
  const sampleDistance = distance + clampedZ * 0.09;
  const track = sampleCourse(sampleDistance);
  const paletteIndex = Math.floor((distance * 0.62 + clampedZ * 0.82) / 150) % ROAD_PALETTE.length;
  const widthPulse = 1 + Math.sin((sampleDistance + 180) * 0.006) * 0.025;

  return {
    z: clampedZ,
    curve: track.curve,
    width: widthPulse,
    color: ROAD_PALETTE[Math.abs(paletteIndex)],
    stripe: Math.floor((distance * 0.78 + clampedZ) / 120) % 2 === 0,
  };
}

export function roadCenterOffset(width: number, z: number, curve: number) {
  const depth = z / FAR_Z;
  const bend = curve * Math.pow(depth, 1.34) * width * 0.42;
  const farSway = Math.sin(depth * Math.PI * 1.8) * curve * width * 0.035;
  return bend + farSway;
}

export function projectedY(height: number, z: number) {
  const horizonY = height * 0.34;
  const projectionHeight = height * 0.65;
  return horizonY + (CAMERA_DEPTH / z) * projectionHeight;
}

export function roadHalfWidth(width: number, z: number, segmentWidth: number) {
  return width * 0.58 * segmentWidth * (CAMERA_DEPTH / z);
}
