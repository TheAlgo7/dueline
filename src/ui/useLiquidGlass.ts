import { useEffect, type RefObject } from 'react';

/**
 * Real refraction for the dock (ported from WearWise, where it was tuned).
 *
 * A normal map of the pill's bevel (signed distance to the edge turned into
 * inward normals in R and G, 128 = no shift) drives an SVG feDisplacementMap
 * applied through `backdrop-filter: url(#id)`, so rows scrolling under the
 * dock bend at its edge like thick glass.
 *
 * - The map is inlined as a data URI; an external href on feImage silently
 *   does nothing inside backdrop-filter.
 * - Only Chromium applies SVG filters as a backdrop, so it is gated on a
 *   Chromium brand; Safari and Firefox keep the frosted fallback.
 * - A smooth bevel, never turbulence noise. No white glare.
 */

const BEVEL_PX = 15;
const DISPLACEMENT = 24;

function isChromium(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  return Boolean(brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge|Brave/i.test(b.brand)));
}

function pillMap(w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(w, h);
  const r = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const cx = Math.min(Math.max(px, r), w - r);
      const dx = px - cx;
      const dy = py - r;
      const len = Math.hypot(dx, dy) || 1;
      const depth = r - len;
      let m = 0;
      if (depth > 0 && depth < BEVEL_PX) {
        const t = 1 - depth / BEVEL_PX;
        m = t * t;
      }
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(128 - 127 * (dx / len) * m);
      img.data[i + 1] = Math.round(128 - 127 * (dy / len) * m);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function useLiquidGlass(ref: RefObject<HTMLElement | null>, id: string, finish = 'blur(5px) saturate(1.2) brightness(0.84)') {
  useEffect(() => {
    const el = ref.current;
    if (!el || !isChromium()) return;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';

    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const image = document.createElementNS(SVG_NS, 'feImage');
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('result', 'map');

    const displace = document.createElementNS(SVG_NS, 'feDisplacementMap');
    displace.setAttribute('in', 'SourceGraphic');
    displace.setAttribute('in2', 'map');
    displace.setAttribute('scale', String(DISPLACEMENT));
    displace.setAttribute('xChannelSelector', 'R');
    displace.setAttribute('yChannelSelector', 'G');

    filter.append(image, displace);
    svg.append(filter);
    document.body.append(svg);

    let frame = 0;
    let lastW = 0;
    let lastH = 0;
    const rebuild = () => {
      frame = 0;
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (w < 2 || h < 2 || (w === lastW && h === lastH)) return;
      lastW = w;
      lastH = h;
      const uri = pillMap(w, h);
      if (!uri) return;
      for (const node of [filter, image]) {
        node.setAttribute('width', String(w));
        node.setAttribute('height', String(h));
      }
      image.setAttribute('href', uri);
      const value = `url(#${id}) ${finish}`;
      el.style.backdropFilter = value;
      el.style.setProperty('-webkit-backdrop-filter', value);
      el.dataset.glass = 'liquid';
    };

    const ro = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(rebuild);
    });
    ro.observe(el);
    rebuild();

    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      svg.remove();
      el.style.backdropFilter = '';
      el.style.removeProperty('-webkit-backdrop-filter');
      delete el.dataset.glass;
    };
  }, [ref, id, finish]);
}
