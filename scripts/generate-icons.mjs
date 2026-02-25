import { createCanvas } from "canvas";
import { writeFileSync } from "fs";

function renderLogo(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const r = Math.max(1, Math.round(size * 0.046));

  // Rounded rect clip
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.arcTo(size, 0, size, r, r);
  ctx.lineTo(size, size - r);
  ctx.arcTo(size, size, size - r, size, r);
  ctx.lineTo(r, size);
  ctx.arcTo(0, size, 0, size - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.clip();

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "#012167");
  grad.addColorStop(1, "#6692f9");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // B letter
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(size * 0.645)}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("B", size / 2, size / 2 + size * 0.02);

  return canvas.toBuffer("image/png");
}

writeFileSync("public/icons/icon-32.png",  renderLogo(32));
writeFileSync("public/icons/icon-180.png", renderLogo(180));
console.log("Icons generated.");
