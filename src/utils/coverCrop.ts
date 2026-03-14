/**
 * 封面图按比例裁剪：居中裁剪或指定区域裁剪，输出 Data URL
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** 按比例居中裁剪，返回新图 Data URL */
export async function centerCropToAspect(dataUrl: string, aspectW: number, aspectH: number): Promise<string> {
  const img = await loadImage(dataUrl);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const targetRatio = aspectW / aspectH;
  const imgRatio = iw / ih;
  let sw: number, sh: number, sx: number, sy: number;
  if (imgRatio > targetRatio) {
    sh = ih;
    sw = ih * targetRatio;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = iw / targetRatio;
    sx = 0;
    sy = (ih - sh) / 2;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/** 按指定区域裁剪（原图坐标），返回新图 Data URL */
export async function cropImage(dataUrl: string, x: number, y: number, w: number, h: number): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/** 根据比例与图片尺寸计算可裁剪区域大小（保持比例、尽量大） */
export function getCropSize(imgWidth: number, imgHeight: number, aspectW: number, aspectH: number): { w: number; h: number } {
  const targetRatio = aspectW / aspectH;
  const imgRatio = imgWidth / imgHeight;
  if (imgRatio > targetRatio) {
    return { w: imgHeight * targetRatio, h: imgHeight };
  }
  return { w: imgWidth, h: imgWidth / targetRatio };
}
