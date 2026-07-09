/**
 * Surface registry — import this to register all surface renderers.
 */
export { getSurface, getAllSurfaces, type SurfaceRenderer, type RenderTileOptions, type RenderBatchOptions } from './register'
import './ascii'
import './voronoi'
import './voxel'
import './pixel'
