import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { TILE_TYPES } from '@/constants/tiles'
import type { GemapVoxel } from '@/lib/gemap'
import { formatTileKey } from '@/lib/map-core'
import {
  applyTileTransaction,
  compactTileTransaction,
  createTilePatch,
  invertTileTransaction,
  mergeStrokeTransaction,
  type TileTransaction,
} from '@/lib/tile-history'
import { customThemeForExport, normalizeTheme, type ThemeRegistry } from '@/lib/theme-registry'
import {
  formatVoxelSliceId,
  gemapVoxelsToSlices,
  slicesToGemapVoxels,
  type VoxelSlices,
} from '@/lib/voxel-map'
import type { Preset, Theme, ToolType, WorldConfig } from '@/types'

const MAX_HISTORY = 50
const INT32_MIN = -2_147_483_648
const INT32_MAX = 2_147_483_647

function validZ(value: number): boolean {
  return Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX
}

function pushTileTransaction(
  history: TileTransaction[],
  historyIndex: number,
  transaction: TileTransaction,
): { history: TileTransaction[]; historyIndex: number } {
  const compacted = compactTileTransaction(transaction)
  if (compacted.patches.length === 0) return { history, historyIndex }

  const nextHistory = history.slice(0, historyIndex + 1)
  nextHistory.push(compacted)
  while (nextHistory.length > MAX_HISTORY) nextHistory.shift()
  return {
    history: nextHistory,
    historyIndex: nextHistory.length - 1,
  }
}

function withActiveSlice(slices: VoxelSlices, activeZ: number): VoxelSlices {
  const sliceId = formatVoxelSliceId(activeZ)
  return sliceId in slices ? slices : { ...slices, [sliceId]: {} }
}

export type MapImportData = {
  activeZ?: number
  slices?: VoxelSlices
  tiles?: Record<string, string | null>
  worldName?: string
  tileSize?: number
  themeId?: string
  theme?: Theme
}

export type VoxelImportData = {
  activeZ?: number
  voxels: readonly GemapVoxel[]
  worldName?: string
}

export type LegacySliceExport = {
  activeZ: number
  theme?: Theme
  themeId: string
  tileSize: number
  tiles: Record<string, string | null>
  version: 2
  worldName: string
}

export type MapStore = {
  tiles: VoxelSlices
  activeZ: number
  activeTileType: string
  currentTool: ToolType
  activePreset: Preset | null
  worldName: string
  tileSize: number
  themeId: string
  customThemes: ThemeRegistry
  history: TileTransaction[]
  historyIndex: number

  setTile: (x: number, y: number, tileTypeId: string | null) => void
  setTiles: (entries: [number, number, string | null][]) => void
  setTilePreview: (sliceId: string, x: number, y: number, tileTypeId: string | null) => void
  commitTilePreview: (transaction: TileTransaction) => void
  setActiveZ: (z: number) => void
  setActiveTileType: (id: string) => void
  setCurrentTool: (tool: ToolType) => void
  setActivePreset: (preset: Preset | null) => void
  placePreset: (preset: Preset, originX: number, originY: number) => void
  undo: () => void
  redo: () => void
  initWorld: (config: WorldConfig) => void
  importMap: (data: MapImportData) => void
  importVoxels: (data: VoxelImportData) => void
  exportVoxels: () => GemapVoxel[]
  exportMap: () => LegacySliceExport
  getTile: (x: number, y: number) => string | null
  floodFill: (x: number, y: number, fillTileTypeId: string) => void
}

export const useMapStore = create<MapStore>()(
  immer((set, get) => ({
    tiles: { 'z:0': {} },
    activeZ: 0,
    activeTileType: 'wall',
    currentTool: 'brush',
    activePreset: null,
    worldName: 'Untitled',
    tileSize: 24,
    themeId: 'ansi-16',
    customThemes: {},
    history: [],
    historyIndex: -1,

    setTile: (x, y, tileTypeId) => {
      const state = get()
      const sliceId = formatVoxelSliceId(state.activeZ)
      const key = formatTileKey(x, y)
      const transaction = compactTileTransaction({
        patches: [
          createTilePatch({
            sliceId,
            key,
            before: state.tiles[sliceId]?.[key],
            after: tileTypeId,
          }),
        ],
      })
      if (transaction.patches.length === 0) return
      set((draft) => {
        const nextHistory = pushTileTransaction(draft.history, draft.historyIndex, transaction)
        draft.history = nextHistory.history
        draft.historyIndex = nextHistory.historyIndex
        draft.tiles = applyTileTransaction(draft.tiles, transaction)
      })
    },

    setTiles: (entries) => {
      const state = get()
      const sliceId = formatVoxelSliceId(state.activeZ)
      let transaction: TileTransaction = { patches: [] }
      for (const [x, y, tileTypeId] of entries) {
        const key = formatTileKey(x, y)
        transaction = mergeStrokeTransaction(
          transaction,
          createTilePatch({
            sliceId,
            key,
            before: state.tiles[sliceId]?.[key],
            after: tileTypeId,
          }),
        )
      }
      if (transaction.patches.length === 0) return
      set((draft) => {
        const nextHistory = pushTileTransaction(draft.history, draft.historyIndex, transaction)
        draft.history = nextHistory.history
        draft.historyIndex = nextHistory.historyIndex
        draft.tiles = applyTileTransaction(draft.tiles, transaction)
      })
    },

    setTilePreview: (sliceId, x, y, tileTypeId) => {
      const key = formatTileKey(x, y)
      set((draft) => {
        if (!draft.tiles[sliceId]) draft.tiles[sliceId] = {}
        if (tileTypeId === null || tileTypeId === 'void') {
          delete draft.tiles[sliceId][key]
          return
        }
        draft.tiles[sliceId][key] = tileTypeId
      })
    },

    commitTilePreview: (transaction) => {
      const compacted = compactTileTransaction(transaction)
      if (compacted.patches.length === 0) return
      set((draft) => {
        const nextHistory = pushTileTransaction(draft.history, draft.historyIndex, compacted)
        draft.history = nextHistory.history
        draft.historyIndex = nextHistory.historyIndex
      })
    },

    setActiveZ: (z) => {
      if (!validZ(z)) return
      set((draft) => { draft.activeZ = z })
    },

    setActiveTileType: (id) => set((draft) => { draft.activeTileType = id }),

    setCurrentTool: (tool) => set((draft) => {
      draft.currentTool = tool
      draft.activePreset = null
    }),

    setActivePreset: (preset) => set((draft) => {
      draft.activePreset = preset
      if (preset) draft.currentTool = 'brush'
    }),

    placePreset: (preset, originX, originY) => {
      const entries: [number, number, string | null][] = []
      for (let py = 0; py < preset.grid.length; py += 1) {
        for (let px = 0; px < preset.grid[py].length; px += 1) {
          const cellType = preset.grid[py][px]
          if (cellType !== 'void' && TILE_TYPES[cellType]) {
            entries.push([originX + px, originY + py, cellType])
          }
        }
      }
      get().setTiles(entries)
    },

    undo: () => {
      const { historyIndex, history } = get()
      if (historyIndex < 0) return
      const transaction = history[historyIndex]
      set((draft) => {
        draft.tiles = applyTileTransaction(draft.tiles, invertTileTransaction(transaction))
        draft.historyIndex = historyIndex - 1
      })
    },

    redo: () => {
      const { historyIndex, history } = get()
      if (historyIndex >= history.length - 1) return
      const transaction = history[historyIndex + 1]
      set((draft) => {
        draft.tiles = applyTileTransaction(draft.tiles, transaction)
        draft.historyIndex = historyIndex + 1
      })
    },

    initWorld: (config) => set((draft) => {
      const activeZ = validZ(config.activeZ ?? 0) ? (config.activeZ ?? 0) : 0
      draft.worldName = config.worldName
      draft.tileSize = config.tileSize
      draft.themeId = config.themeId
      draft.activeZ = activeZ
      draft.customThemes = {}
      if (config.initialTheme) {
        const theme = normalizeTheme(config.initialTheme)
        draft.customThemes[theme.id] = theme
        draft.themeId = theme.id
      }

      const initial = config.initialVoxels
        ? gemapVoxelsToSlices(config.initialVoxels)
        : config.initialSlices
          ? Object.fromEntries(
              Object.entries(config.initialSlices).map(([id, tiles]) => [id, { ...tiles }]),
            )
          : { [formatVoxelSliceId(activeZ)]: { ...(config.initialTiles ?? {}) } }
      draft.tiles = withActiveSlice(initial, activeZ)
      draft.history = []
      draft.historyIndex = -1
      draft.currentTool = 'brush'
      draft.activeTileType = 'wall'
      draft.activePreset = null
    }),

    importMap: (data) => set((draft) => {
      const activeZ = validZ(data.activeZ ?? 0) ? (data.activeZ ?? 0) : 0
      const slices = data.slices
        ? Object.fromEntries(
            Object.entries(data.slices).map(([id, tiles]) => [id, { ...tiles }]),
          )
        : { [formatVoxelSliceId(activeZ)]: { ...(data.tiles ?? {}) } }
      draft.tiles = withActiveSlice(slices, activeZ)
      draft.activeZ = activeZ
      if (data.worldName) draft.worldName = data.worldName
      if (data.tileSize) draft.tileSize = data.tileSize
      if (data.theme) {
        const theme = normalizeTheme(data.theme)
        draft.customThemes[theme.id] = theme
        draft.themeId = theme.id
      }
      if (data.themeId) draft.themeId = data.themeId
      draft.history = []
      draft.historyIndex = -1
    }),

    importVoxels: (data) => set((draft) => {
      const activeZ = validZ(data.activeZ ?? 0) ? (data.activeZ ?? 0) : 0
      draft.tiles = withActiveSlice(gemapVoxelsToSlices(data.voxels), activeZ)
      draft.activeZ = activeZ
      if (data.worldName) draft.worldName = data.worldName
      draft.history = []
      draft.historyIndex = -1
      draft.activePreset = null
    }),

    exportVoxels: () => slicesToGemapVoxels(get().tiles),

    exportMap: () => {
      const state = get()
      const customTheme = customThemeForExport(state.themeId, state.customThemes)
      return {
        activeZ: state.activeZ,
        tiles: { ...(state.tiles[formatVoxelSliceId(state.activeZ)] ?? {}) },
        worldName: state.worldName,
        tileSize: state.tileSize,
        themeId: state.themeId,
        ...(customTheme ? { theme: customTheme } : {}),
        version: 2,
      }
    },

    getTile: (x, y) => {
      const state = get()
      return state.tiles[formatVoxelSliceId(state.activeZ)]?.[formatTileKey(x, y)] ?? null
    },

    floodFill: (startX, startY, fillTileTypeId) => {
      const state = get()
      const sliceId = formatVoxelSliceId(state.activeZ)
      const sliceTiles = state.tiles[sliceId] ?? {}
      const targetTileType = sliceTiles[formatTileKey(startX, startY)]
      if (!targetTileType || targetTileType === fillTileTypeId) return

      const visited = new Set<string>()
      const queue: [number, number][] = [[startX, startY]]
      const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const
      const entries: [number, number, string | null][] = []
      let cursor = 0

      while (cursor < queue.length) {
        const [cx, cy] = queue[cursor]
        cursor += 1
        const key = formatTileKey(cx, cy)
        if (visited.has(key)) continue
        visited.add(key)
        if (get().tiles[sliceId]?.[key] !== targetTileType) continue
        entries.push([cx, cy, fillTileTypeId])

        for (const [dx, dy] of directions) {
          const nx = cx + dx
          const ny = cy + dy
          const neighborKey = formatTileKey(nx, ny)
          if (!visited.has(neighborKey)) queue.push([nx, ny])
        }
      }
      if (entries.length > 0) get().setTiles(entries)
    },
  })),
)
