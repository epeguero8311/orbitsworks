"use client";

import QRCode from "qrcode";

// Client-side QR images for join codes. The QR encodes only the link; the
// code name and job site are printed as text under it, outside the QR.

const QR_SIZE = 640;
const PAD = 48;
const TEXT_AREA = 130;

export async function qrPreviewDataUrl(link: string, size = 160): Promise<string> {
  return QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 1, width: size });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "...").width > maxWidth) t = t.slice(0, -1);
  return t + "...";
}

export async function labeledQrPngBlob(link: string, name: string, siteName: string): Promise<Blob> {
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, link, { errorCorrectionLevel: "M", margin: 2, width: QR_SIZE });

  const canvas = document.createElement("canvas");
  canvas.width = QR_SIZE + PAD * 2;
  canvas.height = QR_SIZE + PAD * 2 + TEXT_AREA;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qr, PAD, PAD);

  const maxWidth = canvas.width - PAD * 2;
  ctx.fillStyle = "#030712";
  ctx.textAlign = "center";
  ctx.font = "600 40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(fitText(ctx, name, maxWidth), canvas.width / 2, QR_SIZE + PAD + 70);
  ctx.fillStyle = "#4b5563";
  ctx.font = "400 30px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(fitText(ctx, siteName, maxWidth), canvas.width / 2, QR_SIZE + PAD + 118);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the PNG."))), "image/png");
  });
}

function safeFileName(text: string): string {
  return text.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "qr-code";
}

export async function downloadLabeledQr(link: string, name: string, siteName: string): Promise<void> {
  const blob = await labeledQrPngBlob(link, name, siteName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(name)}-${safeFileName(siteName)}-qr.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
