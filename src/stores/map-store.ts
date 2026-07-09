import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ToolType, Preset, WorldConfig, Layer, Theme } from '@/types'
import { TILE_TYPES } from '@/constants/tiles'
import { flattenLayerTiles, formatTileKey } from '@/lib/map-core'
import {
  applyTileTransaction,
  compactTileTransaction,
  createTilePatch,
  invertTileTransaction,
  mergeStrokeTransaction,
  type TileTransaction,
} from '@/lib/tile-history'
import { customThemeForExport, normalizeTheme, type ThemeRegistry } from '@/lib/theme-registry'

const MAX_HISTORY = 50

let _layerCounter = 1
function nextLayerId(): string {
  _layerCounter++
  return `layer-${_layerCounter}`
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

export interface MapStore {
  tiles: Record<string, Record<string, string | null>>
  activeTileType: string
  currentTool: ToolType
  activePreset: Preset | null
  layers: Layer[]
  activeLayer: number
  worldName: string
  tileSize: number
  themeId: string
  customThemes: ThemeRegistry
  history: TileTransaction[]
  historyIndex: number

  setTile: (x: number, y: number, tileTypeId: string | null) => void
  setTiles: (entries: [number, number, string | null][]) => void
  setTilePreview: (layerId: string, x: number, y: number, tileTypeId: string | null) => void
  commitTilePreview: (transaction: TileTransaction) => void
  setActiveTileType: (id: string) => void
  setCurrentTool: (tool: ToolType) => void
  setActivePreset: (preset: Preset | null) => void
  placePreset: (preset: Preset, originX: number, originY: number) => void
  undo: () => void
  redo: () => void
  initWorld: (config: WorldConfig) => void
  importMap: (data: {
    tiles?: Record<string, string | null>
    layerTiles?: Record<string, Record<string, string | null>>
    layers?: Layer[]
    worldName?: string
    tileSize?: number
    themeId?: string
    theme?: Theme
  }) => void
  exportMap: () => {
    tiles: Record<string, string | null>
    layerTiles: Record<string, Record<string, string | null>>
    layers: Layer[]
    worldName: string
    tileSize: number
    themeId: string
    theme?: Theme
    version: number
  }
  getTile: (x: number, y: number) => string | null
  floodFill: (x: number, y: number, fillTileTypeId: string) => void

  addLayer: (name?: string) => void
  removeLayer: (index: number) => void
  setActiveLayer: (index: number) => void
  toggleLayerVisibility: (index: number) => void
  toggleLayerLock: (index: number) => void
  renameLayer: (index: number, name: string) => void
  activeLayerLocked: () => boolean
}

export const useMapStore = create<MapStore>()(
  immer((set, get) => ({
    tiles: {},
    activeTileType: 'wall',
    currentTool: 'brush',
    activePreset: null,
    layers: [{ id: 'layer-1', name: 'Ground', visible: true, locked: false }],
    activeLayer: 0,
    worldName: 'Untitled',
    tileSize: 24,
    themeId: 'ansi-16',
    customThemes: {},
    history: [],
    historyIndex: -1,

    activeLayerLocked: () => {
      const state = get()
      return state.layers[state.activeLayer]?.locked ?? false
    },

    setTile: (x, y, tileTypeId) => {
      const state = get()
      const layerId = state.layers[state.activeLayer]?.id
      if (!layerId) return
      const key = formatTileKey(x, y)
      const transaction = compactTileTransaction({
        patches: [
          createTilePatch({
            layerId,
            key,
            before: state.tiles[layerId]?.[key],
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
      const layerId = state.layers[state.activeLayer]?.id
      if (!layerId) return
      let transaction: TileTransaction = { patches: [] }
      for (const [x, y, tileTypeId] of entries) {
        const key = formatTileKey(x, y)
        transaction = mergeStrokeTransaction(
          transaction,
          createTilePatch({
            layerId,
            key,
            before: state.tiles[layerId]?.[key],
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

    setTilePreview: (layerId, x, y, tileTypeId) => {
      const key = formatTileKey(x, y)
      set((draft) => {
        if (!draft.tiles[layerId]) draft.tiles[layerId] = {}
        if (tileTypeId === null) {
          delete draft.tiles[layerId][key]
          return
        }
        draft.tiles[layerId][key] = tileTypeId
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

    setActiveTileType: (id) => set((draft) => { draft.activeTileType = id }),

    setCurrentTool: (tool) => set((draft) => { draft.currentTool = tool; draft.activePreset = null }),

    setActivePreset: (preset) => set((draft) => { draft.activePreset = preset; if (preset) draft.currentTool = 'brush' }),

    placePreset: (preset, originX, originY) => {
      const entries: [number, number, string | null][] = []
      for (let py = 0; py < preset.grid.length; py++) {
        for (let px = 0; px < preset.grid[py].length; px++) {
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
      draft.worldName = config.worldName
      draft.tileSize = config.tileSize
      draft.themeId = config.themeId
      draft.customThemes = {}
      if (config.initialTheme) {
        const theme = normalizeTheme(config.initialTheme)
        draft.customThemes[theme.id] = theme
        draft.themeId = theme.id
      }

      if (config.initialLayerTiles && config.initialLayers && config.initialLayers.length > 0) {
        draft.tiles = {}
        for (const [id, lt] of Object.entries(config.initialLayerTiles)) {
          draft.tiles[id] = { ...lt }
        }
        draft.layers = config.initialLayers.map((l) => ({ ...l }))
        draft.activeLayer = 0
      } else if (config.initialTiles) {
        const layerId = 'layer-1'
        draft.tiles = { [layerId]: { ...config.initialTiles } }
        draft.layers = [{ id: layerId, name: 'Ground', visible: true, locked: false }]
        draft.activeLayer = 0
      } else {
        const layerId = 'layer-1'
        draft.tiles = { [layerId]: {} }
        draft.layers = [{ id: layerId, name: 'Ground', visible: true, locked: false }]
        draft.activeLayer = 0
      }

      draft.history = []
      draft.historyIndex = -1
      draft.currentTool = 'brush'
      draft.activeTileType = 'wall'
      draft.activePreset = null
    }),

    importMap: (data) => {
      set((draft) => {
        if (data.layerTiles && data.layers && data.layers.length > 0) {
          draft.tiles = {}
          for (const [id, layerTiles] of Object.entries(data.layerTiles)) {
            draft.tiles[id] = { ...layerTiles }
          }
          draft.layers = data.layers.map((l) => ({ ...l }))
          draft.activeLayer = 0
        } else if (data.tiles) {
          const layerId = 'layer-1'
          draft.tiles = { [layerId]: { ...data.tiles } }
          draft.layers = [{ id: layerId, name: 'Ground', visible: true, locked: false }]
          draft.activeLayer = 0
        }
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
      })
    },

    exportMap: () => {
      const state = get()
      const flatTiles = flattenLayerTiles(state.tiles, state.layers)
      const customTheme = customThemeForExport(state.themeId, state.customThemes)
      return {
        tiles: flatTiles,
        layerTiles: { ...state.tiles },
        layers: state.layers.map((l) => ({ ...l })),
        worldName: state.worldName,
        tileSize: state.tileSize,
        themeId: state.themeId,
        ...(customTheme ? { theme: customTheme } : {}),
        version: 2,
      }
    },

    getTile: (x, y) => {
      const state = get()
      const key = `${x},${y}`
      for (let i = state.layers.length - 1; i >= 0; i--) {
        const l = state.layers[i]
        if (l.visible && state.tiles[l.id]?.[key]) {
          return state.tiles[l.id][key]
        }
      }
      return null
    },

    floodFill: (startX, startY, fillTileTypeId) => {
      const state = get()
      const layerId = state.layers[state.activeLayer]?.id
      if (!layerId) return
      const layerTiles = state.tiles[layerId] || {}
      const key = `${startX},${startY}`
      const targetTileType = layerTiles[key]
      if (!targetTileType || targetTileType === fillTileTypeId) return

      const visited = new Set<string>()
      const queue: [number, number][] = [[startX, startY]]
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      const entries: [number, number, string | null][] = []
      let cursor = 0

      while (cursor < queue.length) {
        const [cx, cy] = queue[cursor]!
        cursor++
        const ck = formatTileKey(cx, cy)
        if (visited.has(ck)) continue
        visited.add(ck)

        const currentType = get().tiles[layerId]?.[ck]
        if (currentType !== targetTileType) continue

        entries.push([cx, cy, fillTileTypeId])

        for (const [dx, dy] of dirs) {
          const nx = cx + dx
          const ny = cy + dy
          const nk = formatTileKey(nx, ny)
          if (!visited.has(nk)) {
            queue.push([nx, ny])
          }
        }
      }

      if (entries.length > 0) {
        get().setTiles(entries)
      }
    },

    addLayer: (name) => set((draft) => {
      const id = nextLayerId()
      draft.layers.push({ id, name: name || `Layer ${draft.layers.length}`, visible: true, locked: false })
      draft.tiles[id] = {}
    }),

    removeLayer: (index) => set((draft) => {
      if (draft.layers.length <= 1) return
      const layer = draft.layers[index]
      if (!layer) return
      draft.layers.splice(index, 1)
      delete draft.tiles[layer.id]
      if (draft.activeLayer >= draft.layers.length) {
        draft.activeLayer = draft.layers.length - 1
      }
    }),

    setActiveLayer: (index) => set((draft) => {
      if (index >= 0 && index < draft.layers.length) {
        draft.activeLayer = index
      }
    }),

    toggleLayerVisibility: (index) => set((draft) => {
      const layer = draft.layers[index]
      if (layer) layer.visible = !layer.visible
    }),

    toggleLayerLock: (index) => set((draft) => {
      const layer = draft.layers[index]
      if (layer) layer.locked = !layer.locked
    }),

    renameLayer: (index, name) => set((draft) => {
      const layer = draft.layers[index]
      if (layer) layer.name = name
    }),
  }))
)
