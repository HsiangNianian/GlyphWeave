#!/usr/bin/env node

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const defaultPort = Number.parseInt(process.env.PERF_PORT || '3101', 10)
const baseUrl = process.env.PERF_BASE_URL || `http://localhost:${defaultPort}`
const shouldStartServer = !process.env.PERF_BASE_URL
const minFps = Number.parseFloat(process.env.PERF_MIN_FPS || '0')
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const headless = process.env.PERF_HEADLESS !== '0'
const scenarioMs = Number.parseInt(process.env.PERF_SCENARIO_MS || '1200', 10)
const maxFrameSamples = Number.parseInt(process.env.PERF_MAX_FRAME_SAMPLES || '10000', 10)
const exampleDir = path.join(rootDir, 'examples')
const explicitMaps = process.env.PERF_MAPS
  ? process.env.PERF_MAPS.split(',').map((entry) => entry.trim()).filter(Boolean)
  : []

function log(message) {
  console.error(`[perf:canvas] ${message}`)
}

function toAbsoluteMapPath(mapPath) {
  return path.isAbsolute(mapPath) ? mapPath : path.resolve(rootDir, mapPath)
}

function discoverMapPaths() {
  if (explicitMaps.length > 0) return explicitMaps.map(toAbsoluteMapPath)
  if (!fs.existsSync(exampleDir)) return []

  return fs
    .readdirSync(exampleDir)
    .filter((name) => name.endsWith('.gemap') || name.endsWith('.json'))
    .sort()
    .map((name) => path.join(exampleDir, name))
}

function countTiles(mapPath) {
  try {
    const data = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
    if (data.layerTiles && typeof data.layerTiles === 'object') {
      return Object.values(data.layerTiles)
        .filter((layerTiles) => layerTiles && typeof layerTiles === 'object')
        .reduce((sum, layerTiles) => sum + Object.keys(layerTiles).length, 0)
    }
    if (data.tiles && typeof data.tiles === 'object') {
      return Object.keys(data.tiles).length
    }
  } catch (error) {
    console.warn(`Failed to count tiles for ${mapPath}:`, error.message)
  }
  return null
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
  return sorted[index]
}

function summarizeProbe(label, probe, extra = {}) {
  const intervals = Array.isArray(probe.intervals) ? probe.intervals : []
  const avgFrameMs = probe.intervalCount > 0 ? probe.totalFrameMs / probe.intervalCount : 0
  const p95FrameMs = percentile(intervals, 0.95)

  return {
    label,
    frames: probe.intervalCount + 1,
    durationMs: Number(probe.durationMs.toFixed(2)),
    avgFrameMs: Number(avgFrameMs.toFixed(2)),
    avgFps: avgFrameMs > 0 ? Number((1000 / avgFrameMs).toFixed(1)) : 0,
    p95FrameMs: Number(p95FrameMs.toFixed(2)),
    p95Fps: p95FrameMs > 0 ? Number((1000 / p95FrameMs).toFixed(1)) : 0,
    maxFrameMs: Number(probe.maxFrameMs.toFixed(2)),
    framesOver16ms: probe.framesOver16ms,
    framesOver33ms: probe.framesOver33ms,
    storedFrameSamples: intervals.length,
    ...extra,
  }
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'no response'}`)
}

function startServer() {
  const distIndex = path.join(rootDir, 'dist', 'index.html')
  if (!fs.existsSync(distIndex)) {
    throw new Error('Missing dist/index.html. Run `pnpm build` before `pnpm perf:canvas`, or set PERF_BASE_URL.')
  }

  const child = spawn(process.execPath, ['server/index.mjs', String(defaultPort)], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })

  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`))

  return child
}

async function launchBrowser() {
  const launchOptions = {
    headless,
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  }

  if (fs.existsSync(chromePath)) {
    launchOptions.executablePath = chromePath
  }

  try {
    log(`launching Chromium (${fs.existsSync(chromePath) ? chromePath : 'playwright managed browser'})`)
    return await chromium.launch(launchOptions)
  } catch (error) {
    throw new Error(
      `Failed to launch Chromium: ${error.message}\n` +
      'Install a Playwright browser with `pnpm exec playwright install chromium`, ' +
      'or set PLAYWRIGHT_CHROME_PATH to a local Chrome executable.',
    )
  }
}

async function recordScenario(page, label, action) {
  log(`sampling ${label}`)
  await page.evaluate((sampleLimit) => {
    const probe = {
      running: true,
      startedAt: performance.now(),
      lastFrameAt: null,
      intervalCount: 0,
      totalFrameMs: 0,
      maxFrameMs: 0,
      framesOver16ms: 0,
      framesOver33ms: 0,
      intervals: [],
    }
    window.__glyphFrameProbe = probe
    const tick = (time) => {
      if (!probe.running) return
      if (probe.lastFrameAt !== null) {
        const frameMs = time - probe.lastFrameAt
        probe.intervalCount += 1
        probe.totalFrameMs += frameMs
        probe.maxFrameMs = Math.max(probe.maxFrameMs, frameMs)
        if (frameMs > 16.67) probe.framesOver16ms += 1
        if (frameMs > 33.33) probe.framesOver33ms += 1
        if (probe.intervals.length < sampleLimit) probe.intervals.push(frameMs)
      }
      probe.lastFrameAt = time
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, maxFrameSamples)

  const actionStartedAt = performance.now()
  await action()
  const actionMs = performance.now() - actionStartedAt
  await page.waitForTimeout(250)

  const probe = await page.evaluate(() => {
    const probe = window.__glyphFrameProbe
    if (!probe) {
      return {
        durationMs: 0,
        intervalCount: 0,
        totalFrameMs: 0,
        maxFrameMs: 0,
        framesOver16ms: 0,
        framesOver33ms: 0,
        intervals: [],
      }
    }
    probe.running = false
    return {
      durationMs: performance.now() - probe.startedAt,
      intervalCount: probe.intervalCount,
      totalFrameMs: probe.totalFrameMs,
      maxFrameMs: probe.maxFrameMs,
      framesOver16ms: probe.framesOver16ms,
      framesOver33ms: probe.framesOver33ms,
      intervals: probe.intervals,
    }
  })

  return summarizeProbe(label, probe, { actionMs: Number(actionMs.toFixed(2)) })
}

async function stageBox(page) {
  await page.waitForSelector('.konvajs-content', { state: 'visible' })
  const box = await page.locator('.konvajs-content').first().boundingBox()
  if (!box) throw new Error('Unable to locate Konva stage bounds')
  return box
}

async function loadScenario(page, scenario) {
  log(`loading ${scenario.name}`)
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('domcontentloaded')
  if (scenario.mapPath) {
    await page.locator('input[accept=".gemap,.json"]').setInputFiles(scenario.mapPath)
  } else {
    await page.getByRole('button', { name: /Demo Map/i }).click()
  }
  await page.waitForSelector('.konvajs-content', { state: 'visible' })
  await page.waitForTimeout(500)
  log(`loaded ${scenario.name}`)
}

async function measureScenario(page, scenario) {
  await loadScenario(page, scenario)
  const box = await stageBox(page)
  const center = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }

  await page.mouse.move(center.x, center.y)

  const idle = await recordScenario(page, 'idle', async () => {
    await page.waitForTimeout(scenarioMs)
  })

  const pan = await recordScenario(page, 'pan', async () => {
    await page.evaluate(async ({ point, durationMs }) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const target = document.querySelector('.konvajs-content')
      if (!target) throw new Error('Unable to locate Konva stage for pan benchmark')

      const start = { x: point.x - 240, y: point.y - 160 }
      const end = { x: point.x + 240, y: point.y + 160 }
      const dispatchMouse = (type, x, y, buttons) => {
        target.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: type === 'mouseup' || type === 'mousedown' ? 1 : 0,
          buttons,
          clientX: x,
          clientY: y,
        }))
      }

      dispatchMouse('mousedown', start.x, start.y, 4)
      for (let i = 0; i <= 48; i++) {
        const progress = i / 48
        dispatchMouse(
          'mousemove',
          start.x + progress * (end.x - start.x),
          start.y + progress * (end.y - start.y),
          4,
        )
        await sleep(8)
      }
      dispatchMouse('mouseup', end.x, end.y, 0)
      await sleep(Math.max(0, durationMs - 650))
    }, { point: center, durationMs: scenarioMs })
  })

  const zoom = await recordScenario(page, 'zoom', async () => {
    await page.evaluate(async ({ point, durationMs }) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const target = document.querySelector('.konvajs-content')
      if (!target) throw new Error('Unable to locate Konva stage for wheel benchmark')

      const dispatchWheel = (deltaY) => {
        target.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          deltaY,
        }))
      }

      for (let i = 0; i < 24; i++) {
        dispatchWheel(-120)
        await sleep(10)
      }
      for (let i = 0; i < 24; i++) {
        dispatchWheel(120)
        await sleep(10)
      }
      await sleep(Math.max(0, durationMs - 800))
    }, { point: center, durationMs: scenarioMs })
  })

  return {
    name: scenario.name,
    tileCount: scenario.tileCount,
    idle,
    pan,
    zoom,
  }
}

function assertThreshold(results) {
  if (!Number.isFinite(minFps) || minFps <= 0) return

  const failures = []
  for (const result of results) {
    for (const sample of [result.idle, result.pan, result.zoom]) {
      if (sample.avgFps < minFps) {
        failures.push(`${result.name}/${sample.label}: ${sample.avgFps}fps < ${minFps}fps`)
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Canvas perf threshold failed:\n${failures.join('\n')}`)
  }
}

const server = shouldStartServer ? startServer() : null

try {
  if (server) {
    log(`waiting for ${baseUrl}`)
    await waitForHttp(baseUrl)
  }

  const maps = discoverMapPaths()
  const scenarios = maps.length > 0
    ? maps.map((mapPath) => ({
      name: path.relative(rootDir, mapPath),
      mapPath,
      tileCount: countTiles(mapPath),
    }))
    : [{ name: 'Demo Map', mapPath: null, tileCount: null }]

  log(`scenarios: ${scenarios.map((scenario) => scenario.name).join(', ')}`)

  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.setDefaultTimeout(60_000)

  const results = []
  for (const scenario of scenarios) {
    results.push(await measureScenario(page, scenario))
  }

  await browser.close()
  assertThreshold(results)

  console.log(JSON.stringify({
    baseUrl,
    headless,
    minFps: minFps > 0 ? minFps : null,
    scenarios: results,
  }, null, 2))
} finally {
  if (server) server.kill('SIGTERM')
}
