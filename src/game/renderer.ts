import { CAMERA_DEPTH, FAR_Z, NEAR_Z, getRoadSegmentAt, projectedY, roadCenterOffset, roadHalfWidth } from './track';
import type { GameState, OpponentCar, RoadSegment } from './types';
import { drawHud } from './ui';

interface RoadPoint {
  x: number;
  y: number;
  halfWidth: number;
  scale: number;
}

interface PropPoint extends RoadPoint {
  z: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function fract(value: number) {
  return value - Math.floor(value);
}

function polygon(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, fillStyle: string) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  ctx.fill();
}

function projectRoad(segment: RoadSegment, width: number, height: number): RoadPoint {
  const scale = CAMERA_DEPTH / segment.z;
  const y = projectedY(height, segment.z);
  const halfWidth = roadHalfWidth(width, segment.z, segment.width);
  const x = width / 2 + roadCenterOffset(width, segment.z, segment.curve);

  return { x, y, halfWidth, scale };
}

function projectAtZ(state: GameState, z: number, width: number, height: number): PropPoint {
  const segment = getRoadSegmentAt(state.visualDistance, z);
  return { ...projectRoad(segment, width, height), z };
}

function projectCar(car: OpponentCar, state: GameState, width: number, height: number) {
  if (car.z > FAR_Z || car.z < NEAR_Z * 0.52) {
    return null;
  }

  const segment = getRoadSegmentAt(state.visualDistance, car.z);
  const point = projectRoad(segment, width, height);
  const laneLimit = point.halfWidth * 0.78;
  const x = point.x + car.lane * laneLimit;
  const carWidth = clamp(width * 0.17 * point.scale * car.width, 10, width * 0.28);
  const carHeight = carWidth * 0.58;
  const y = point.y - carHeight * 0.76;

  return { x, y, width: carWidth, height: carHeight, scale: point.scale };
}

export class GameRenderer {
  render(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;

    const shakeX = (Math.sin(state.sceneTime * 97) + Math.sin(state.sceneTime * 61)) * state.shake * 3.4;
    const shakeY = Math.cos(state.sceneTime * 81) * state.shake * 2.2;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    this.drawBackground(ctx, state, width, height);
    this.drawTrackside(ctx, state, width, height);
    this.drawRoad(ctx, state, width, height);
    this.drawStartLine(ctx, state, width, height);
    this.drawOverheadSigns(ctx, state, width, height);
    this.drawTraffic(ctx, state, width, height);
    this.drawWorldTexts(ctx, state, width, height);
    this.drawSpeedLines(ctx, state, width, height);
    this.drawPlayer(ctx, state, width, height);
    this.drawCountdown(ctx, state, width, height);
    ctx.restore();

    this.drawCollisionFlash(ctx, state, width, height);
    drawHud(ctx, state, width, height);
    this.drawCrtOverlay(ctx, width, height);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    const horizon = height * 0.34;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + height * 0.18);
    sky.addColorStop(0, '#8ed9ff');
    sky.addColorStop(0.58, '#d7f3ff');
    sky.addColorStop(1, '#ffe7a8');
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, width + 40, height + 40);

    ctx.fillStyle = 'rgba(255, 244, 168, 0.92)';
    ctx.beginPath();
    ctx.arc(width * 0.78, height * 0.14, Math.max(24, width * 0.075), 0, Math.PI * 2);
    ctx.fill();

    this.drawClouds(ctx, state, width, height);
    this.drawMountains(ctx, state, width, height, horizon);
    this.drawCity(ctx, state, width, height, horizon);

    const ground = ctx.createLinearGradient(0, horizon, 0, height);
    ground.addColorStop(0, '#9bd77b');
    ground.addColorStop(1, '#5fae62');
    ctx.fillStyle = ground;
    ctx.fillRect(-20, horizon, width + 40, height - horizon + 40);
  }

  private drawTrackside(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    this.drawSideWalls(ctx, state, width, height);

    const props: Array<{ z: number; side: -1 | 1; kind: 'tree' | 'billboard' | 'crowd' | 'building' }> = [];
    const span = FAR_Z - NEAR_Z;

    for (let i = 0; i < 18; i += 1) {
      const seed = fract(i * 0.318 + 0.17);
      const z = FAR_Z - fract(i * 0.157 + state.visualDistance * 0.00074) * span;
      const side = i % 2 === 0 ? -1 : 1;
      const kind = seed < 0.28 ? 'tree' : seed < 0.5 ? 'billboard' : seed < 0.72 ? 'crowd' : 'building';
      props.push({ z, side, kind });
    }

    props
      .sort((a, b) => b.z - a.z)
      .forEach((prop) => {
        const point = projectAtZ(state, prop.z, width, height);
        if (point.y < height * 0.27 || point.y > height * 1.05) {
          return;
        }

        if (prop.kind === 'tree') {
          this.drawTree(ctx, point, prop.side, width);
        } else if (prop.kind === 'billboard') {
          this.drawBillboard(ctx, point, prop.side, width);
        } else if (prop.kind === 'crowd') {
          this.drawCrowd(ctx, point, prop.side, width);
        } else {
          this.drawSideBuilding(ctx, point, prop.side, width);
        }
      });
  }

  private drawSideWalls(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    const segments = state.roadSegments;

    for (let i = 0; i < segments.length - 1; i += 1) {
      const far = projectRoad(segments[i], width, height);
      const near = projectRoad(segments[i + 1], width, height);
      const wallHeightFar = clamp(height * 0.15 * far.scale, 4, height * 0.18);
      const wallHeightNear = clamp(height * 0.15 * near.scale, 5, height * 0.22);

      for (const side of [-1, 1] as const) {
        const bottomFarX = far.x + side * far.halfWidth * 1.12;
        const bottomNearX = near.x + side * near.halfWidth * 1.12;
        const topFarX = far.x + side * far.halfWidth * 1.64;
        const topNearX = near.x + side * near.halfWidth * 1.64;
        const wallColor = side < 0 ? (i % 2 === 0 ? '#6fb2c7' : '#5f9eb6') : i % 2 === 0 ? '#c0a36f' : '#ad9363';

        polygon(
          ctx,
          [
            [bottomFarX, far.y],
            [bottomNearX, near.y],
            [topNearX, near.y - wallHeightNear],
            [topFarX, far.y - wallHeightFar],
          ],
          wallColor,
        );

        if (i % 4 === 0) {
          ctx.save();
          ctx.globalAlpha = 0.34;
          ctx.strokeStyle = side < 0 ? '#d9f6ff' : '#755f3d';
          ctx.lineWidth = Math.max(1, near.scale * 1.2);
          ctx.beginPath();
          ctx.moveTo(bottomFarX, far.y - wallHeightFar * 0.45);
          ctx.lineTo(bottomNearX, near.y - wallHeightNear * 0.45);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  private drawTree(ctx: CanvasRenderingContext2D, point: PropPoint, side: -1 | 1, width: number) {
    const x = point.x + side * point.halfWidth * 1.72;
    const trunkHeight = clamp(width * 0.22 * point.scale, 9, 84);
    const trunkWidth = clamp(width * 0.024 * point.scale, 2, 10);
    const crown = clamp(width * 0.11 * point.scale, 9, 52);
    const y = point.y - trunkHeight * 0.35;

    ctx.save();
    ctx.fillStyle = '#705235';
    ctx.fillRect(x - trunkWidth * 0.5, y - trunkHeight, trunkWidth, trunkHeight);
    ctx.fillStyle = '#208c52';
    ctx.beginPath();
    ctx.arc(x, y - trunkHeight, crown, 0, Math.PI * 2);
    ctx.arc(x + side * crown * 0.48, y - trunkHeight * 0.72, crown * 0.82, 0, Math.PI * 2);
    ctx.arc(x - side * crown * 0.34, y - trunkHeight * 0.62, crown * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBillboard(ctx: CanvasRenderingContext2D, point: PropPoint, side: -1 | 1, width: number) {
    const boardWidth = clamp(width * 0.34 * point.scale, 22, 128);
    const boardHeight = boardWidth * 0.38;
    const x = point.x + side * point.halfWidth * 1.9 - (side < 0 ? boardWidth : 0);
    const y = point.y - clamp(width * 0.2 * point.scale, 16, 90);

    ctx.save();
    ctx.fillStyle = '#304b7d';
    ctx.fillRect(x, y, boardWidth, boardHeight);
    ctx.fillStyle = '#79e5ff';
    ctx.fillRect(x + boardWidth * 0.06, y + boardHeight * 0.18, boardWidth * 0.88, boardHeight * 0.18);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.max(6, boardHeight * 0.34)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('TAIL', x + boardWidth * 0.5, y + boardHeight * 0.72);
    ctx.fillStyle = '#2b3142';
    ctx.fillRect(x + boardWidth * 0.18, y + boardHeight, Math.max(2, point.scale * 3), boardHeight * 0.85);
    ctx.fillRect(x + boardWidth * 0.78, y + boardHeight, Math.max(2, point.scale * 3), boardHeight * 0.85);
    ctx.restore();
  }

  private drawCrowd(ctx: CanvasRenderingContext2D, point: PropPoint, side: -1 | 1, width: number) {
    const x = point.x + side * point.halfWidth * 1.52;
    const y = point.y - clamp(width * 0.05 * point.scale, 3, 24);
    const dot = clamp(width * 0.012 * point.scale, 1.5, 6);
    const count = Math.max(4, Math.floor(18 * point.scale));

    ctx.save();
    for (let i = 0; i < count; i += 1) {
      const px = x + side * i * dot * 1.5;
      const py = y - (i % 3) * dot * 1.4;
      ctx.fillStyle = ['#ffffff', '#ffdf5d', '#3ee0ff', '#f45f86'][i % 4];
      ctx.fillRect(px, py, dot, dot * 1.4);
    }
    ctx.restore();
  }

  private drawSideBuilding(ctx: CanvasRenderingContext2D, point: PropPoint, side: -1 | 1, width: number) {
    const buildingWidth = clamp(width * 0.22 * point.scale, 16, 110);
    const buildingHeight = clamp(width * 0.34 * point.scale, 24, 160);
    const x = point.x + side * point.halfWidth * 1.98 - (side < 0 ? buildingWidth : 0);
    const y = point.y - buildingHeight;

    ctx.save();
    ctx.fillStyle = side < 0 ? '#446a82' : '#e0d5c8';
    ctx.fillRect(x, y, buildingWidth, buildingHeight);
    ctx.fillStyle = side < 0 ? '#c3f3ff' : '#8b7c6a';
    const rows = Math.max(2, Math.floor(buildingHeight / 18));
    const cols = Math.max(2, Math.floor(buildingWidth / 18));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        ctx.fillRect(x + 5 + col * 16, y + 7 + row * 16, 5, 5);
      }
    }
    ctx.restore();
  }

  private drawClouds(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.76)';

    for (let i = 0; i < 6; i += 1) {
      const drift = state.visualDistance * 0.000035 + state.sceneTime * 0.006;
      const x = fract(i * 0.213 + drift) * (width + 130) - 65;
      const y = height * (0.08 + fract(i * 0.331) * 0.16);
      const s = width * (0.042 + fract(i * 0.17) * 0.026);

      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.45, s * 0.56, 0, 0, Math.PI * 2);
      ctx.ellipse(x + s * 0.8, y + s * 0.06, s * 1.1, s * 0.48, 0, 0, Math.PI * 2);
      ctx.ellipse(x - s * 0.75, y + s * 0.1, s, s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawMountains(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    width: number,
    height: number,
    horizon: number,
  ) {
    const layers = [
      { color: '#89aac2', y: horizon - height * 0.055, amp: height * 0.06, speed: 0.018 },
      { color: '#6f9db2', y: horizon - height * 0.02, amp: height * 0.045, speed: 0.032 },
    ];

    for (const layer of layers) {
      const offset = (state.visualDistance * layer.speed) % width;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(-width - offset, horizon + height * 0.1);

      for (let x = -width; x <= width * 2; x += width / 8) {
        const px = x - offset;
        const peak = layer.y - Math.abs(Math.sin((x + width * 0.3) * 0.012)) * layer.amp;
        ctx.lineTo(px, peak);
      }

      ctx.lineTo(width * 2, horizon + height * 0.12);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawCity(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number, horizon: number) {
    const baseY = horizon + height * 0.018;
    const offset = (state.visualDistance * 0.04) % 90;

    ctx.fillStyle = 'rgba(68, 91, 115, 0.72)';
    for (let i = -2; i < 16; i += 1) {
      const blockWidth = 26 + fract(i * 0.44) * 28;
      const blockHeight = height * (0.035 + fract(i * 0.27) * 0.075);
      const x = i * 48 - offset;
      ctx.fillRect(x, baseY - blockHeight, blockWidth, blockHeight);

      ctx.fillStyle = 'rgba(255, 237, 135, 0.54)';
      for (let win = 0; win < 3; win += 1) {
        ctx.fillRect(x + 6 + win * 8, baseY - blockHeight + 10, 3, 5);
      }
      ctx.fillStyle = 'rgba(68, 91, 115, 0.72)';
    }
  }

  private drawRoad(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    const segments = state.roadSegments;
    if (segments.length < 2) {
      return;
    }

    for (let i = 0; i < segments.length - 1; i += 1) {
      const far = projectRoad(segments[i], width, height);
      const near = projectRoad(segments[i + 1], width, height);
      const shoulderFar = far.halfWidth * 1.12 + far.scale * 8;
      const shoulderNear = near.halfWidth * 1.12 + near.scale * 8;

      polygon(
        ctx,
        [
          [far.x - shoulderFar, far.y],
          [far.x + shoulderFar, far.y],
          [near.x + shoulderNear, near.y],
          [near.x - shoulderNear, near.y],
        ],
        segments[i].color.shoulder,
      );

      polygon(
        ctx,
        [
          [far.x - far.halfWidth, far.y],
          [far.x + far.halfWidth, far.y],
          [near.x + near.halfWidth, near.y],
          [near.x - near.halfWidth, near.y],
        ],
        segments[i].color.road,
      );

      if (segments[i].stripe) {
        this.drawLaneStripe(ctx, far, near, segments[i].color.lane);
      }

      this.drawLaneGuides(ctx, far, near);
      this.drawRoadEdges(ctx, far, near);
    }
  }

  private drawRoadEdges(ctx: CanvasRenderingContext2D, far: RoadPoint, near: RoadPoint) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = Math.max(1.2, near.scale * 2.2);

    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(far.x + side * far.halfWidth * 0.96, far.y);
      ctx.lineTo(near.x + side * near.halfWidth * 0.96, near.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawLaneStripe(ctx: CanvasRenderingContext2D, far: RoadPoint, near: RoadPoint, color: string) {
    const farW = Math.max(1.4, far.halfWidth * 0.018);
    const nearW = Math.max(1.8, near.halfWidth * 0.018);

    polygon(
      ctx,
      [
        [far.x - farW, far.y],
        [far.x + farW, far.y],
        [near.x + nearW, near.y],
        [near.x - nearW, near.y],
      ],
      color,
    );
  }

  private drawLaneGuides(ctx: CanvasRenderingContext2D, far: RoadPoint, near: RoadPoint) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';

    for (const lane of [-0.36, 0.36]) {
      const farX = far.x + lane * far.halfWidth;
      const nearX = near.x + lane * near.halfWidth;
      const farW = Math.max(0.8, far.halfWidth * 0.006);
      const nearW = Math.max(1, near.halfWidth * 0.006);

      polygon(ctx, [[farX - farW, far.y], [farX + farW, far.y], [nearX + nearW, near.y], [nearX - nearW, near.y]], '#ffffff');
    }

    ctx.restore();
  }

  private drawOverheadSigns(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    const signs: PropPoint[] = [];
    const span = FAR_Z - NEAR_Z;

    for (let i = 0; i < 5; i += 1) {
      const z = FAR_Z - fract(i * 0.41 + state.visualDistance * 0.00038) * span;
      if (z > 760 && z < FAR_Z * 0.96) {
        signs.push(projectAtZ(state, z, width, height));
      }
    }

    signs
      .sort((a, b) => b.z - a.z)
      .forEach((point, index) => {
        const signWidth = clamp(point.halfWidth * 1.14, 30, width * 0.45);
        const signHeight = clamp(height * 0.075 * point.scale, 8, 42);
        const y = point.y - clamp(height * 0.18 * point.scale, 18, 118);
        const postTop = y + signHeight;
        const leftPost = point.x - point.halfWidth * 0.9;
        const rightPost = point.x + point.halfWidth * 0.9;

        ctx.save();
        ctx.fillStyle = '#3a4d86';
        ctx.fillRect(leftPost - point.scale * 1.5, postTop, Math.max(1, point.scale * 3), point.y - postTop);
        ctx.fillRect(rightPost - point.scale * 1.5, postTop, Math.max(1, point.scale * 3), point.y - postTop);
        ctx.fillStyle = index % 2 === 0 ? '#5f83d8' : '#405da9';
        ctx.fillRect(point.x - signWidth * 0.5, y, signWidth, signHeight);
        ctx.fillStyle = '#dff7ff';
        ctx.fillRect(point.x - signWidth * 0.42, y + signHeight * 0.22, signWidth * 0.28, signHeight * 0.16);
        ctx.fillRect(point.x + signWidth * 0.12, y + signHeight * 0.22, signWidth * 0.28, signHeight * 0.16);
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.max(6, signHeight * 0.36)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('BOOST', point.x, y + signHeight * 0.78);
        ctx.restore();
      });
  }

  private drawStartLine(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    const lineZ = state.racePhase === 'grid' ? 418 : 418 - state.distance * 5.8;
    if (state.mode !== 'running' || lineZ < NEAR_Z * 0.65 || lineZ > 700) {
      return;
    }

    const far = projectAtZ(state, lineZ + 24, width, height);
    const near = projectAtZ(state, lineZ, width, height);
    const tiles = 12;

    for (let i = 0; i < tiles; i += 1) {
      const left = -1 + (i / tiles) * 2;
      const right = -1 + ((i + 1) / tiles) * 2;
      const color = i % 2 === 0 ? '#ffffff' : '#1f2933';

      polygon(
        ctx,
        [
          [far.x + left * far.halfWidth * 0.94, far.y],
          [far.x + right * far.halfWidth * 0.94, far.y],
          [near.x + right * near.halfWidth * 0.94, near.y],
          [near.x + left * near.halfWidth * 0.94, near.y],
        ],
        color,
      );
    }

    if (state.racePhase === 'grid') {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.strokeStyle = 'rgba(16, 32, 45, 0.58)';
      ctx.lineWidth = 3;
      ctx.font = `900 ${Math.max(14, width * 0.05)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeText('START', near.x, near.y - 10);
      ctx.fillText('START', near.x, near.y - 10);
      ctx.restore();
    }
  }

  private drawCountdown(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    if (state.mode !== 'running' || state.racePhase !== 'grid') {
      return;
    }

    const number = Math.max(1, Math.min(3, Math.ceil(state.startCountdown)));
    const pulse = 1 + (1 - fract(state.startCountdown)) * 0.16;

    ctx.save();
    ctx.translate(width / 2, height * 0.34);
    ctx.scale(pulse, pulse);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(12, 24, 36, 0.42)';
    ctx.font = `900 ${Math.max(22, width * 0.07)}px Inter, system-ui, sans-serif`;
    ctx.fillText('READY', 0, -58);
    ctx.font = `900 ${Math.max(86, width * 0.26)}px Inter, system-ui, sans-serif`;
    ctx.strokeStyle = 'rgba(16, 31, 45, 0.66)';
    ctx.lineWidth = 8;
    ctx.fillStyle = number === 1 ? '#ffef5c' : '#ffffff';
    ctx.strokeText(`${number}`, 0, 18);
    ctx.fillText(`${number}`, 0, 18);
    ctx.restore();
  }

  private drawTraffic(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    const cars = [...state.traffic].sort((a, b) => b.z - a.z);

    for (const car of cars) {
      const projected = projectCar(car, state, width, height);
      if (!projected) {
        continue;
      }

      if (projected.y < height * 0.28 || projected.y > height + 80) {
        continue;
      }

      this.drawOpponentCar(ctx, car, projected.x, projected.y, projected.width, projected.height);
    }
  }

  private drawOpponentCar(
    ctx: CanvasRenderingContext2D,
    car: OpponentCar,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(17, 25, 32, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, height * 0.44, width * 0.52, height * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-width * 0.45, -height * 0.42, width * 0.9, height * 0.78, Math.max(3, width * 0.05));
    ctx.fill();

    ctx.fillStyle = car.accent;
    ctx.fillRect(-width * 0.28, -height * 0.27, width * 0.56, height * 0.22);

    ctx.fillStyle = '#151d26';
    ctx.fillRect(-width * 0.5, -height * 0.12, width * 0.12, height * 0.38);
    ctx.fillRect(width * 0.38, -height * 0.12, width * 0.12, height * 0.38);

    ctx.fillStyle = '#ffef74';
    ctx.fillRect(-width * 0.38, height * 0.14, width * 0.16, height * 0.09);
    ctx.fillRect(width * 0.22, height * 0.14, width * 0.16, height * 0.09);
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    const carWidth = clamp(width * 0.36, 112, 176);
    const carHeight = carWidth * 0.62;
    const x = width / 2 + state.playerX * Math.min(width * 0.31, 148);
    const y = height * 0.8;
    const tilt = state.playerTilt * 0.08;
    const flamePower = clamp(state.speed / 260, 0.15, 1) + (state.nitroActive ? 0.7 : 0);
    const flicker = 0.82 + Math.sin(state.sceneTime * 38) * 0.18;
    const hitAlpha = state.collisionFlash > 0 ? 0.55 + Math.sin(state.sceneTime * 52) * 0.35 : 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.globalAlpha = hitAlpha;

    ctx.fillStyle = 'rgba(15, 24, 34, 0.34)';
    ctx.beginPath();
    ctx.ellipse(0, carHeight * 0.45, carWidth * 0.56, carHeight * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#221922';
    ctx.fillRect(-carWidth * 0.55, -carHeight * 0.34, carWidth * 1.1, carHeight * 0.08);
    ctx.fillRect(-carWidth * 0.42, -carHeight * 0.31, carWidth * 0.08, carHeight * 0.25);
    ctx.fillRect(carWidth * 0.34, -carHeight * 0.31, carWidth * 0.08, carHeight * 0.25);

    this.drawExhaust(ctx, -carWidth * 0.22, carHeight * 0.36, carWidth, flamePower * flicker, state.nitroActive);
    this.drawExhaust(ctx, carWidth * 0.22, carHeight * 0.36, carWidth, flamePower * (1.05 - flicker * 0.05), state.nitroActive);

    ctx.fillStyle = '#101924';
    ctx.fillRect(-carWidth * 0.48, -carHeight * 0.02, carWidth * 0.14, carHeight * 0.5);
    ctx.fillRect(carWidth * 0.34, -carHeight * 0.02, carWidth * 0.14, carHeight * 0.5);

    const bodyGradient = ctx.createLinearGradient(0, -carHeight * 0.45, 0, carHeight * 0.42);
    bodyGradient.addColorStop(0, '#ff4773');
    bodyGradient.addColorStop(0.52, '#d4143c');
    bodyGradient.addColorStop(1, '#6e0b21');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.moveTo(-carWidth * 0.42, -carHeight * 0.36);
    ctx.lineTo(carWidth * 0.42, -carHeight * 0.36);
    ctx.lineTo(carWidth * 0.5, carHeight * 0.28);
    ctx.quadraticCurveTo(0, carHeight * 0.5, -carWidth * 0.5, carHeight * 0.28);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#123451';
    ctx.beginPath();
    ctx.roundRect(-carWidth * 0.24, -carHeight * 0.28, carWidth * 0.48, carHeight * 0.22, 5);
    ctx.fill();

    ctx.strokeStyle = '#67dfff';
    ctx.lineWidth = Math.max(1, carWidth * 0.015);
    ctx.beginPath();
    ctx.moveTo(-carWidth * 0.08, -carHeight * 0.26);
    ctx.lineTo(-carWidth * 0.18, -carHeight * 0.08);
    ctx.moveTo(carWidth * 0.08, -carHeight * 0.26);
    ctx.lineTo(carWidth * 0.18, -carHeight * 0.08);
    ctx.stroke();

    ctx.fillStyle = '#ff315f';
    ctx.fillRect(-carWidth * 0.39, carHeight * 0.08, carWidth * 0.18, carHeight * 0.08);
    ctx.fillRect(carWidth * 0.21, carHeight * 0.08, carWidth * 0.18, carHeight * 0.08);

    ctx.fillStyle = '#0f1824';
    ctx.fillRect(-carWidth * 0.36, carHeight * 0.29, carWidth * 0.72, carHeight * 0.08);
    ctx.fillStyle = '#e7f6ff';
    ctx.fillRect(-carWidth * 0.08, carHeight * 0.31, carWidth * 0.16, carHeight * 0.035);
    ctx.fillStyle = '#111827';
    for (let i = -2; i <= 2; i += 1) {
      ctx.fillRect(i * carWidth * 0.07 - carWidth * 0.01, -carHeight * 0.02, carWidth * 0.018, carHeight * 0.24);
    }

    ctx.restore();
  }

  private drawExhaust(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    carWidth: number,
    power: number,
    nitro: boolean,
  ) {
    const length = carWidth * (0.12 + power * 0.18);
    const width = carWidth * (0.055 + power * 0.025);
    const gradient = ctx.createLinearGradient(x, y, x, y + length);
    gradient.addColorStop(0, nitro ? '#7df5ff' : '#fff0a3');
    gradient.addColorStop(0.42, nitro ? '#318cff' : '#ff8a32');
    gradient.addColorStop(1, 'rgba(255, 76, 36, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.5, y);
    ctx.lineTo(x + width * 0.5, y);
    ctx.lineTo(x, y + length);
    ctx.closePath();
    ctx.fill();
  }

  private drawSpeedLines(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    const intensity = state.nitroActive ? 1 : clamp((state.speed - 205) / 75, 0, 0.7);
    if (intensity <= 0) {
      return;
    }

    const horizon = height * 0.34;
    ctx.save();
    ctx.globalAlpha = intensity * 0.62;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = state.nitroActive ? 2 : 1;

    for (let i = 0; i < 28; i += 1) {
      const seed = fract(Math.sin(i * 9.123) * 43758.5453);
      const side = seed > 0.5 ? 1 : -1;
      const t = fract(seed + state.sceneTime * (0.95 + state.speed * 0.006));
      const y = horizon + Math.pow(t, 1.85) * (height - horizon);
      const x = width / 2 + side * (width * (0.18 + seed * 0.42));
      const len = height * (0.018 + t * 0.055);

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * width * 0.05, y + len);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawWorldTexts(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    for (const text of state.floatingTexts) {
      const alpha = clamp(1 - text.age / text.ttl, 0, 1);
      const x = width / 2 + text.x * Math.min(width * 0.31, 148);
      const y = height * text.y;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = text.color;
      ctx.strokeStyle = 'rgba(16, 31, 45, 0.65)';
      ctx.lineWidth = 3;
      ctx.font = '900 18px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText(text.text, x, y);
      ctx.fillText(text.text, x, y);
      ctx.restore();
    }
  }

  private drawCollisionFlash(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
    if (state.collisionFlash <= 0) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = state.collisionFlash * 0.34;
    ctx.fillStyle = '#ff3c55';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private drawCrtOverlay(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#0f1f2c';
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 1);
    }

    const vignette = ctx.createRadialGradient(width / 2, height * 0.48, width * 0.2, width / 2, height * 0.5, width * 0.76);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
