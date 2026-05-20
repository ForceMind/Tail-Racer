import type { GameState } from './types';

function drawLabel(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, align: CanvasTextAlign) {
  ctx.textAlign = align;
  ctx.fillStyle = 'rgba(18, 32, 45, 0.62)';
  ctx.font = '600 10px Inter, system-ui, sans-serif';
  ctx.fillText(label, x, y);
  ctx.fillStyle = '#10202d';
  ctx.font = '800 17px Inter, system-ui, sans-serif';
  ctx.fillText(value, x, y + 18);
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: number,
  x: number,
  y: number,
  width: number,
  color: string,
) {
  const height = 8;
  const fill = Math.max(0, Math.min(1, value / 100));

  ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(4, width * fill), height, 4);
  ctx.fill();

  ctx.fillStyle = 'rgba(18, 32, 45, 0.74)';
  ctx.font = '700 9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 4);
}

function drawBottomGauges(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
  const radius = Math.max(24, Math.min(34, width * 0.075));
  const leftX = 46;
  const y = height - 46;

  ctx.save();
  ctx.globalAlpha = 0.86;
  ctx.strokeStyle = '#7ce9ff';
  ctx.fillStyle = 'rgba(14, 41, 58, 0.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(leftX, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftX, y + radius * 0.68);
  ctx.quadraticCurveTo(leftX + state.currentCurve * radius * 2.8, y, leftX, y - radius * 0.68);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MAP', leftX, y + radius + 13);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(10, 23, 34, 0.36)';
  ctx.font = '900 54px Inter, system-ui, sans-serif';
  ctx.fillText(`${Math.round(state.speed)}`, width - 16, height - 18);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(20, 36, 48, 0.58)';
  ctx.lineWidth = 4;
  ctx.strokeText(`${Math.round(state.speed)}`, width - 16, height - 18);
  ctx.fillText(`${Math.round(state.speed)}`, width - 16, height - 18);
  ctx.font = '900 10px Inter, system-ui, sans-serif';
  ctx.fillText('km/h', width - 20, height - 7);
  ctx.restore();
}

export function drawHud(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
  if (state.mode !== 'running') {
    return;
  }

  const topPad = Math.max(12, height * 0.018);
  const panelX = 12;
  const panelY = topPad;
  const panelWidth = width - 24;

  ctx.save();
  ctx.fillStyle = 'rgba(248, 252, 255, 0.72)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelWidth, 76, 8);
  ctx.fill();
  ctx.stroke();

  drawLabel(ctx, 'SPEED', `${Math.round(state.speed)} km/h`, panelX + 12, panelY + 17, 'left');
  drawLabel(ctx, 'SCORE', `${Math.round(state.score)}`, width / 2, panelY + 17, 'center');
  drawLabel(ctx, 'DIST', `${Math.round(state.distance)} m`, width - panelX - 12, panelY + 17, 'right');

  ctx.fillStyle = state.combo > 0 ? '#e23d79' : 'rgba(18, 32, 45, 0.58)';
  ctx.font = '800 13px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`COMBO x${state.combo}`, panelX + 12, panelY + 58);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#10202d';
  ctx.fillText(`${Math.ceil(state.timeLeft)}s`, width - panelX - 12, panelY + 58);

  const barWidth = Math.min(118, panelWidth * 0.31);
  drawBar(ctx, 'NITRO', state.nitroEnergy, width / 2 - barWidth - 7, panelY + 58, barWidth, '#f04d8b');
  drawBar(ctx, 'DRAFT', state.slipstream, width / 2 + 7, panelY + 58, barWidth, state.draftActive ? '#32c7e6' : '#6ad6ef');
  drawBottomGauges(ctx, state, width, height);
  ctx.restore();
}
