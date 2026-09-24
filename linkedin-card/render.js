// Draws the card onto a canvas and works out where each text layer sits.

/** Scale factors for drawing the background image under each sizing mode. */
function imageScale(fit, iw, ih, W, H) {
  switch (fit) {
    case 'contain': {
      const s = Math.min(W / iw, H / ih);
      return [s, s];
    }
    case 'stretch':
      return [W / iw, H / ih];
    case 'original':
      return [1, 1];
    default: {
      const s = Math.max(W / iw, H / ih);
      return [s, s];
    }
  }
}

export function imageRect(bg, image, W, H) {
  const [sx, sy] = imageScale(bg.fit, image.width, image.height, W, H);
  const w = image.width * sx * bg.zoom;
  const h = image.height * sy * bg.zoom;
  return {
    x: (W - w) / 2 + bg.offsetX * W,
    y: (H - h) / 2 + bg.offsetY * H,
    w,
    h,
  };
}

const fontString = (layer) => `${layer.italic ? 'italic ' : ''}${layer.weight} ${layer.size}px "${layer.font}", system-ui, sans-serif`;

function applyTextStyle(ctx, layer) {
  ctx.font = fontString(layer);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${layer.tracking * layer.size}px`;
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const next = `${line} ${word}`;
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Lays out a text layer: its wrapped lines and bounding box in canvas px. */
export function layout(ctx, layer, W, H) {
  ctx.save();
  applyTextStyle(ctx, layer);
  const w = layer.width * W;
  const lines = wrap(ctx, layer.text, w).map((text) => ({ text, width: ctx.measureText(text).width }));
  ctx.restore();
  const lineHeight = layer.size * layer.leading;
  return {
    lines,
    lineHeight,
    x: layer.x * W,
    y: layer.y * H,
    w,
    h: Math.max(lines.length, 1) * lineHeight,
  };
}

function drawLayer(ctx, layer, W, H) {
  const box = layout(ctx, layer, W, H);
  ctx.save();
  applyTextStyle(ctx, layer);
  ctx.textBaseline = 'middle';
  ctx.textAlign = layer.align;

  const anchorX = layer.align === 'left' ? box.x : layer.align === 'right' ? box.x + box.w : box.x + box.w / 2;

  if (layer.box) {
    const padX = layer.size * 0.3;
    const radius = layer.size * 0.12;
    ctx.fillStyle = layer.boxColor;
    box.lines.forEach((line, i) => {
      if (!line.text) return;
      const left = layer.align === 'left' ? anchorX : layer.align === 'right' ? anchorX - line.width : anchorX - line.width / 2;
      ctx.beginPath();
      ctx.roundRect(left - padX, box.y + i * box.lineHeight, line.width + padX * 2, box.lineHeight, radius);
      ctx.fill();
    });
  }

  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = layer.size * 0.18;
    ctx.shadowOffsetY = layer.size * 0.04;
  }
  ctx.fillStyle = layer.color;
  box.lines.forEach((line, i) => {
    ctx.fillText(line.text, anchorX, box.y + (i + 0.5) * box.lineHeight);
  });
  ctx.restore();
}

export function render(ctx, state, image) {
  const { width: W, height: H } = ctx.canvas;
  const { bg } = state;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, W, H);

  if (image) {
    const r = imageRect(bg, image, W, H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, r.x, r.y, r.w, r.h);
  }

  if (bg.tintAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = bg.tintAlpha;
    ctx.fillStyle = bg.tint;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  for (const layer of state.layers) {
    if (layer.text.trim()) drawLayer(ctx, layer, W, H);
  }
}
