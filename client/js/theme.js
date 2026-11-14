import { Game } from './game.js'
import { play, soundPrefs, setSoundPrefs } from './sound.js'

// Colour schemes, each with a light and a dark mode. All colours live in css/style.css as
// variables under :root[data-scheme][data-mode]; this module picks which set is active and
// builds the board's palette (and wood-grain textures) from them.
export const SCHEMES = [
    { id: 'classic', name: 'Classic' },
    { id: 'forest', name: 'Forest' },
    { id: 'ocean', name: 'Ocean' },
    { id: 'plum', name: 'Plum' },
    { id: 'slate', name: 'Slate' },
    { id: 'ruby', name: 'Ruby' },
    { id: 'teal', name: 'Teal' },
    { id: 'midnight', name: 'Midnight' },
    { id: 'ember', name: 'Ember' }
]

// Board materials. Each is a texture painted in the scheme's own three cell colours, so any
// scheme works with any material (blue marble, green slate, ruby metal...).
export const FINISHES = ['wood', 'marble', 'stone', 'metal', 'flat']

const STORAGE_KEY = 'qrs.theme'
const DEFAULTS = { scheme: 'classic', mode: 'light', finish: 'wood', coords: 'on' }

const load = _ => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) } }
    catch(e){ return { ...DEFAULTS } }
}
const save = prefs => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch(e){}
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
const resolveMode = mode => mode == 'auto' ? (systemDark.matches ? 'dark' : 'light') : mode

let prefs = load()

// ------ Wood grain ------

// Small seeded random generator so each texture (and each cell's grain) is stable between frames.
const rng = seed => _ => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296

const hexToRgb = hex => {
    const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Paints a tileable wood texture in the given base colour: long wavy grain lines, a few lighter
// streaks and darker pores, plus fine noise. Repeats seamlessly in both directions.
const makeWoodTexture = (baseHex, seed) => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const rand = rng(seed)

    ctx.fillStyle = baseHex
    ctx.fillRect(0, 0, size, size)

    const grainLine = (y0, amp, waves, phase, width, style) => {
        ctx.strokeStyle = style
        ctx.lineWidth = width
        for(const offset of [-size, 0, size]){
            ctx.beginPath()
            for(let x = 0; x <= size; x += 4){
                const y = y0 + offset + amp * Math.sin((x / size) * Math.PI * 2 * waves + phase) + amp * 0.35 * Math.sin((x / size) * Math.PI * 2 * (waves + 2) + phase * 1.7)
                x ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
            }
            ctx.stroke()
        }
    }

    for(let i = 0; i < 70; i++){
        const dark = rand() < 0.72
        const alpha = dark ? 0.03 + rand() * 0.09 : 0.03 + rand() * 0.05
        grainLine(rand() * size, 1.5 + rand() * 5, 1 + Math.floor(rand() * 2), rand() * Math.PI * 2, 0.6 + rand() * 1.8,
            dark ? `rgba(40, 20, 5, ${alpha})` : `rgba(255, 245, 225, ${alpha})`)
    }

    // Pores: tiny dark dashes along the grain.
    ctx.fillStyle = 'rgba(30, 15, 0, 0.12)'
    for(let i = 0; i < 260; i++) ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 4, 0.8)

    // Fine noise.
    const img = ctx.getImageData(0, 0, size, size)
    for(let i = 0; i < img.data.length; i += 4){
        const n = (rand() - 0.5) * 10
        img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
    }
    ctx.putImageData(img, 0, 0)

    return canvas
}

// ------ Marble, stone and metal ------

const newCanvas = (size, baseHex) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = baseHex
    ctx.fillRect(0, 0, size, size)
    return { canvas, ctx }
}

// Smooth random "clouds" that tile: random values on a coarse grid, blended between grid points.
const valueNoise = (size, grid, rand) => {
    const g = Array.from({ length: grid * grid }, rand)
    const at = (x, y) => g[((y + grid) % grid) * grid + ((x + grid) % grid)]
    const smooth = t => t * t * (3 - 2 * t)
    return (px, py) => {
        const x = px / size * grid, y = py / size * grid
        const x0 = Math.floor(x), y0 = Math.floor(y)
        const fx = smooth(x - x0), fy = smooth(y - y0)
        const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx
        const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx
        return top * (1 - fy) + bottom * fy
    }
}

// Shifts every pixel's brightness by amount(x, y) (roughly -1..1) times `strength`.
const shade = (ctx, size, strength, amount) => {
    const img = ctx.getImageData(0, 0, size, size)
    for(let y = 0; y < size; y++) for(let x = 0; x < size; x++){
        const i = (y * size + x) * 4
        const n = amount(x, y) * strength
        img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
    }
    ctx.putImageData(img, 0, 0)
}

// Draws a path 9 times (shifted by the tile size) so lines crossing an edge wrap around seamlessly.
const wrapped = (ctx, size, draw) => {
    for(const dx of [-size, 0, size]) for(const dy of [-size, 0, size]){
        ctx.save(); ctx.translate(dx, dy); draw(); ctx.restore()
    }
}

// Polished marble: soft cloudy colour, then thin wandering veins with a faint halo.
const makeMarbleTexture = (baseHex, seed) => {
    const size = 256
    const { canvas, ctx } = newCanvas(size, baseHex)
    const rand = rng(seed)
    const cloudA = valueNoise(size, 4, rand), cloudB = valueNoise(size, 9, rand)
    shade(ctx, size, 34, (x, y) => (cloudA(x, y) - 0.5) * 1.3 + (cloudB(x, y) - 0.5) * 0.6)

    // A vein wanders gently across the tile, sometimes splitting off a thinner branch. Each is
    // drawn as a soft blurred halo with a crisp core on top.
    const trace = (x, y, angle, steps) => {
        const points = [[x, y]]
        for(let i = 0; i < steps; i++){
            angle += (rand() - 0.5) * 0.45
            x += Math.cos(angle) * 5; y += Math.sin(angle) * 5
            points.push([x, y])
        }
        return points
    }
    const stroke = (points, width, style, blur = 0) => wrapped(ctx, size, _ => {
        ctx.filter = blur ? `blur(${blur}px)` : 'none'
        ctx.strokeStyle = style
        ctx.lineWidth = width
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        ctx.beginPath()
        points.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))
        ctx.stroke()
    })
    const vein = (dark, strength) => {
        const main = trace(rand() * size, rand() * size, rand() * Math.PI * 2, 70)
        const [hx, hy] = main[Math.floor(main.length * (0.3 + rand() * 0.4))]
        const branch = trace(hx, hy, rand() * Math.PI * 2, 25)
        const ink = dark ? '35, 28, 28' : '255, 255, 255'
        for(const [points, w] of [[main, 1], [branch, 0.6]]){
            stroke(points, 9 * w, `rgba(${ink}, ${0.07 * strength})`, 4)
            stroke(points, (0.8 + rand() * 1.2) * w, `rgba(${ink}, ${0.38 * strength})`, 0.4)
        }
    }
    for(let i = 0; i < 3; i++) vein(true, 0.6 + rand() * 0.5)
    for(let i = 0; i < 2; i++) vein(false, 0.7)
    ctx.filter = 'none'

    shade(ctx, size, 4, _ => rand() - 0.5)
    return canvas
}

// Stone (a granite / slate mix): mottled patches and a dense salt-and-pepper speckle.
const makeStoneTexture = (baseHex, seed) => {
    const size = 256
    const { canvas, ctx } = newCanvas(size, baseHex)
    const rand = rng(seed)
    const patches = valueNoise(size, 8, rand), fine = valueNoise(size, 32, rand)
    shade(ctx, size, 30, (x, y) => (patches(x, y) - 0.5) + (fine(x, y) - 0.5) * 0.7)

    for(let i = 0; i < 2600; i++){
        const r = rand()
        ctx.fillStyle = r < 0.55 ? `rgba(15, 12, 10, ${0.15 + rand() * 0.35})`
            : r < 0.9 ? `rgba(255, 255, 255, ${0.1 + rand() * 0.3})`
            : `rgba(120, 100, 80, ${0.2 + rand() * 0.3})`
        const d = rand() < 0.85 ? 1 + rand() * 1.2 : 2 + rand() * 2
        ctx.fillRect(rand() * size, rand() * size, d, d * (0.6 + rand() * 0.8))
    }

    shade(ctx, size, 10, _ => rand() - 0.5)
    return canvas
}

// Brushed metal: fine parallel streaks of slightly different brightness.
const makeMetalTexture = (baseHex, seed) => {
    const size = 256
    const { canvas, ctx } = newCanvas(size, baseHex)
    const rand = rng(seed)
    const bands = valueNoise(size, 6, rand)

    // Each row gets its own brightness that drifts slowly along it: the brush strokes.
    const rows = Array.from({ length: size }, _ => ({ base: rand() - 0.5, drift: rand() * 0.6 }))
    shade(ctx, size, 1, (x, y) => {
        const row = rows[y]
        return row.base * 22 + Math.sin((x / size) * Math.PI * 2 + row.drift * 10) * row.drift * 8 + (bands(x, y) - 0.5) * 18 + (rand() - 0.5) * 6
    })

    // A few longer, brighter scratches.
    for(let i = 0; i < 40; i++){
        const y = rand() * size, x = rand() * size, len = 30 + rand() * 120
        ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + rand() * 0.12})`
        for(const dx of [-size, 0]) ctx.fillRect(x + dx, y, len, 0.7)
    }
    return canvas
}

const TEXTURES = { wood: makeWoodTexture, marble: makeMarbleTexture, stone: makeStoneTexture, metal: makeMetalTexture }

// ------ Palette for the canvas ------

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const buildPalette = _ => {
    const edge = cssVar('--board-edge')
    const [er, eg, eb] = hexToRgb(edge)
    const shades = [cssVar('--board-dark'), cssVar('--board-mid'), cssVar('--board-light')]

    const finish = FINISHES.includes(prefs.finish) ? prefs.finish : 'wood'
    const texture = TEXTURES[finish]
    const cells = texture
        ? shades.map((hex, i) => Game.ctx.createPattern(texture(hex, 7919 * (i + 1)), 'repeat'))
        : shades

    Game.palette = {
        cells,
        finish,
        // Polished materials catch the light: a soft sheen across each cell.
        sheen: finish == 'metal' ? 0.22 : finish == 'marble' ? 0.12 : 0,
        sheenCache: new Map(),
        edge,
        ink: alpha => `rgba(${er}, ${eg}, ${eb}, ${alpha})`,
        hint: cssVar('--hint'),
        label: cssVar('--text-muted'),
        coords: prefs.coords != 'off',
        highlight: alpha => `rgba(${cssVar('--highlight-rgb')}, ${alpha})`
    }
}

// ------ Applying ------

export const applyTheme = (changes = {}) => {
    prefs = { ...prefs, ...changes }
    save(prefs)

    const root = document.documentElement
    root.dataset.scheme = prefs.scheme
    root.dataset.mode = resolveMode(prefs.mode)

    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cssVar('--bg-main'))
    if(Game.ctx) buildPalette()
    renderPicker()
}

systemDark.addEventListener('change', _ => { if(prefs.mode == 'auto') applyTheme() })

// ------ Picker ------

const $ = id => document.getElementById(id)

const renderPicker = _ => {
    const grid = $('theme-schemes')
    if(!grid) return

    grid.querySelectorAll('[data-scheme]').forEach(btn => {
        btn.classList.toggle('is-selected', btn.dataset.scheme == prefs.scheme)
        btn.setAttribute('aria-pressed', btn.dataset.scheme == prefs.scheme)
    })
    document.querySelectorAll('[data-theme-mode]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.themeMode == prefs.mode))
    document.querySelectorAll('[data-theme-finish]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.themeFinish == prefs.finish))
    document.querySelectorAll('[data-theme-coords]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.themeCoords == prefs.coords))

    const sound = soundPrefs()
    document.querySelectorAll('[data-sound]').forEach(btn => btn.classList.toggle('is-active', (btn.dataset.sound == 'on') == sound.enabled))
    const volume = $('sound-volume')
    if(volume){ volume.value = sound.volume; volume.disabled = !sound.enabled }
}

export const setupThemePicker = _ => {
    const modal = $('theme-modal')
    const grid = $('theme-schemes')

    // One card per scheme, previewing its board in both modes.
    for(const scheme of SCHEMES){
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'theme-card'
        btn.dataset.scheme = scheme.id
        btn.innerHTML = `
            <span class="theme-preview">
                <span class="theme-half" data-scheme="${scheme.id}" data-mode="light"><i></i><i></i><i></i></span>
                <span class="theme-half" data-scheme="${scheme.id}" data-mode="dark"><i></i><i></i><i></i></span>
            </span>
            <span class="theme-name">${scheme.name}</span>`
        btn.onclick = _ => applyTheme({ scheme: scheme.id })
        grid.append(btn)
    }

    document.querySelectorAll('[data-theme-mode]').forEach(btn => btn.onclick = _ => applyTheme({ mode: btn.dataset.themeMode }))
    document.querySelectorAll('[data-theme-finish]').forEach(btn => btn.onclick = _ => applyTheme({ finish: btn.dataset.themeFinish }))
    document.querySelectorAll('[data-theme-coords]').forEach(btn => btn.onclick = _ => applyTheme({ coords: btn.dataset.themeCoords }))

    document.querySelectorAll('[data-sound]').forEach(btn => btn.onclick = _ => {
        setSoundPrefs({ enabled: btn.dataset.sound == 'on' })
        renderPicker()
        play('move')
    })
    // Dragging the volume previews it.
    $('sound-volume').oninput = e => setSoundPrefs({ volume: +e.target.value })
    $('sound-volume').onchange = _ => play('capture')

    const open = _ => { renderPicker(); modal.classList.remove('hidden') }
    const close = _ => modal.classList.add('hidden')
    document.querySelectorAll('.theme-open').forEach(btn => btn.onclick = open)
    $('theme-close').onclick = close
    modal.addEventListener('click', e => { if(e.target == modal) close() })
    document.addEventListener('keydown', e => { if(e.key == 'Escape') close() })

    applyTheme()
}
