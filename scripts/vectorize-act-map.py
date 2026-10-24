#!/usr/bin/env python3
"""
Vectorise the official ACT map "Carte des communes et sections cadastrales,
état du 01.01.2018" (1:100 000, 300 dpi TIFF) into src/livemap/lux-geometry.json.

Georeference: the LUREF grid printed on the map (crosses every 10 km).
Measured: E 50 000 at x=484 px, N 140 000 at y=455 px, 1181 px per 10 km
(8.467 m/px = 1:100 000 at 300 dpi). The map is north-up, no rotation.
Projection: LUREF / Luxembourg TM (EPSG:2169) -> WGS84 via inverse
Transverse Mercator (International 1924) + 7-parameter Helmert (PROJ towgs84).

Requires: numpy, scipy, scikit-image, opencv-python, Pillow.
Usage: python3 scripts/vectorize-act-map.py Carte_communes_V2018.tiff [--overlay out.png]
"""
import json, math, sys
from datetime import datetime, timezone
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi
from skimage.segmentation import expand_labels

Image.MAX_IMAGE_PIXELS = None
PX_E0, E0 = 484.0, 50000.0     # x pixel of easting 50 000
PX_N0, N0 = 455.0, 140000.0    # y pixel of northing 140 000
M_PER_PX = 10000.0 / 1181.0

# ---------- LUREF -> WGS84 ----------
A_I, F_I = 6378388.0, 1 / 297.0
E2_I = 2 * F_I - F_I ** 2
A_W, F_W = 6378137.0, 1 / 298.257223563
E2_W = 2 * F_W - F_W ** 2
LAT0, LON0, K0, FE, FN = math.radians(49 + 50 / 60), math.radians(6 + 10 / 60), 1.0, 80000.0, 100000.0
TOWGS84 = (-189.6806, 18.3463, -42.7695, -0.33746, -3.09264, 2.53861, 0.4598)  # position vector (PROJ)

def _m(phi, a=A_I, e2=E2_I):
    e4, e6 = e2 * e2, e2 ** 3
    return a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
                + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi) - (35 * e6 / 3072) * math.sin(6 * phi))

M0 = _m(LAT0)

def tm_inverse(E, N):
    e2 = E2_I; ep2 = e2 / (1 - e2)
    M = M0 + (N - FN) / K0
    mu = M / (A_I * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    s, c, t = math.sin(phi1), math.cos(phi1), math.tan(phi1)
    C1, T1 = ep2 * c * c, t * t
    N1 = A_I / math.sqrt(1 - e2 * s * s)
    R1 = A_I * (1 - e2) / (1 - e2 * s * s) ** 1.5
    D = (E - FE) / (N1 * K0)
    lat = phi1 - (N1 * t / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
                                  + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720)
    lon = LON0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / c
    return lat, lon

def to_wgs84(lat, lon):
    s = math.sin(lat); n = A_I / math.sqrt(1 - E2_I * s * s)
    X, Y, Z = n * math.cos(lat) * math.cos(lon), n * math.cos(lat) * math.sin(lon), n * (1 - E2_I) * s
    tx, ty, tz, rx, ry, rz, ds = TOWGS84
    k = math.pi / 648000.0
    rx, ry, rz, sc = rx * k, ry * k, rz * k, 1 + ds * 1e-6
    X2 = tx + sc * (X - rz * Y + ry * Z); Y2 = ty + sc * (rz * X + Y - rx * Z); Z2 = tz + sc * (-ry * X + rx * Y + Z)
    p = math.hypot(X2, Y2); lon2 = math.atan2(Y2, X2); lat2 = math.atan2(Z2, p * (1 - E2_W))
    for _ in range(6):
        nn = A_W / math.sqrt(1 - E2_W * math.sin(lat2) ** 2)
        h = p / math.cos(lat2) - nn
        lat2 = math.atan2(Z2, p * (1 - E2_W * nn / (nn + h)))
    return math.degrees(lon2), math.degrees(lat2)

def px_to_lonlat(x, y):
    E = E0 + (x - PX_E0) * M_PER_PX
    N = N0 - (y - PX_N0) * M_PER_PX
    return to_wgs84(*tm_inverse(E, N))

def lonlat_to_px(lon, lat):
    """Numerical inverse (Newton) for verification overlays."""
    x, y = 3700.0, 5200.0
    for _ in range(8):
        f = np.array(px_to_lonlat(x, y)) - (lon, lat)
        jx = (np.array(px_to_lonlat(x + 1, y)) - px_to_lonlat(x, y))
        jy = (np.array(px_to_lonlat(x, y + 1)) - px_to_lonlat(x, y))
        J = np.column_stack([jx, jy])
        dx, dy = np.linalg.solve(J, -f)
        x, y = x + dx, y + dy
    return x, y

# ---------- raster -> polygons ----------
def main(path, overlay=None):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = (b > r + 60) & (b > g + 20) & (b > 100)
    green_dark = (g > r + 15) & (g > b - 25) & (g < 175) & (r < 130)
    halo = (np.abs(r - g) < 14) & (np.abs(g - b) < 14) & (r > 140) & (r < 222)
    # Region analysis at half resolution (17 m/px): memory-safe, far finer than the display needs.
    def half(mask):
        h, w = mask.shape[0] // 2 * 2, mask.shape[1] // 2 * 2
        return mask[:h, :w].reshape(h // 2, 2, w // 2, 2).any(axis=(1, 3))
    blue, green_dark, halo = half(blue), half(green_dark), half(halo)
    del a, r, g, b
    S = 2.0
    border = ndi.binary_dilation(green_dark | halo, iterations=1)
    lab, _ = ndi.label(~border)
    outside_ids = {lab[0, 0], lab[-1, -1], lab[0, -1], lab[-1, 0]} - {0}
    outside = np.isin(lab, list(outside_ids))
    country = ndi.binary_fill_holes(~outside)
    # Keep only the national territory: legend, title and inset boxes are separate components.
    cc, ncc = ndi.label(country)
    big = np.argmax(ndi.sum(country, cc, index=range(1, ncc + 1))) + 1
    country = cc == big
    # The grey halo is drawn outside the border line: take half of the band back.
    country = ndi.binary_erosion(country, iterations=3)
    area_km2 = country.sum() * (M_PER_PX * S) ** 2 / 1e6
    print(f'country area {area_km2:.0f} km2 (official 2586 km2)')
    if not 2450 < area_km2 < 2720:
        sys.exit('country extraction failed (border not closed?)')

    barrier = ndi.binary_dilation(blue, iterations=1) | border
    inner = country & ~barrier & ndi.binary_erosion(country, iterations=3)
    cl, n = ndi.label(inner)
    sizes = ndi.sum(np.ones_like(cl), cl, index=range(1, n + 1))
    keep = np.zeros(n + 1, bool); keep[1:] = sizes > 10000  # > ~2.9 km2: communes, not letter holes
    cl = np.where(keep[cl], cl, 0)
    cl = expand_labels(cl, distance=30) * country
    ids = [i for i in np.unique(cl) if i]
    print('communes detected:', len(ids))

    # 2023 mergers (Bous + Waldbredimus, Grosbous + Wahl): merge if both points fall in different neighbours.
    merges = [((6.3300, 49.5550), (6.2861, 49.5583), 'Bous-Waldbredimus'), ((5.9681, 49.8281), (5.9067, 49.8364), 'Groussbus-Wal')]
    for p1, p2, name in merges:
        x1, y1 = lonlat_to_px(*p1); x2, y2 = lonlat_to_px(*p2)
        l1, l2 = cl[int(y1 / S), int(x1 / S)], cl[int(y2 / S), int(x2 / S)]
        if l1 and l2 and l1 != l2 and (ndi.binary_dilation(cl == l1, iterations=6) & (cl == l2)).any():
            cl[cl == l2] = l1
            print('merged', name)
        else:
            print('merge skipped', name, l1, l2)
    ids = [i for i in np.unique(cl) if i]

    communes = []
    for i in ids:
        m = (cl == i).astype(np.uint8)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        rings = []
        for c in cs:
            if cv2.contourArea(c) < 1000: continue
            ap = cv2.approxPolyDP(c, 3.0, True).reshape(-1, 2)
            ring = [px_to_lonlat(float(x) * S + 1, float(y) * S + 1) for x, y in ap]
            ring = [[round(lo, 5), round(la, 5)] for lo, la in ring]
            ring.append(ring[0])
            rings.append(ring)
        if rings: communes.append({'name': '', 'rings': rings})
    pts = sum(len(r) for c in communes for r in c['rings'])
    print(f'{len(communes)} communes, {pts} points')

    out = {
        'source': "ACT, limites communales (état 2018, fusions 2023 appliquées)",
        'license': "Origine Cadastre : droits réservés à l'État du Grand-Duché de Luxembourg (2018). Limites également publiées sur data.public.lu.",
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'communes': communes,
    }
    with open('src/livemap/lux-geometry.json', 'w') as f: json.dump(out, f, separators=(',', ':'))

    if overlay:
        small = 0.2
        im = Image.open(path).convert('RGB'); im = im.resize((int(im.size[0] * small), int(im.size[1] * small)))
        cv = np.array(im)[:, :, ::-1].copy()
        for c in communes:
            for ring in c['rings']:
                pp = np.array([lonlat_to_px(lo, la) for lo, la in ring[:: max(1, len(ring) // 60)]]) * small
                cv2.polylines(cv, [pp.astype(np.int32)], True, (0, 160, 255), 2)
        sys.path.insert(0, '.')
        for name, lat, lon in json.load(open('/tmp/places.json')):
            x, y = lonlat_to_px(lon, lat)
            cv2.circle(cv, (int(x * small), int(y * small)), 7, (200, 0, 200), -1)
        cv2.imwrite(overlay, cv)

if __name__ == '__main__':
    args = sys.argv[1:]
    ov = args[args.index('--overlay') + 1] if '--overlay' in args else None
    main(args[0], ov)
