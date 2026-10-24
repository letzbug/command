import data from './lux-geometry.json';

/**
 * Basemap geometry, generated from the official administrative limits
 * (ACT, data.public.lu) by `npm run map:geodata`. When the file holds no
 * geometry yet, the map draws only true-position places, grid, compass and
 * scale — never an invented outline.
 */
export interface LuxGeometry {
  source: string | null;
  license: string | null;
  generatedAt: string | null;
  /** Communes as rings of [lon, lat]. */
  communes: { name: string; rings: [number, number][][] }[];
}

export const GEOMETRY = data as LuxGeometry;
export const hasGeometry = () => GEOMETRY.communes.length > 0;
