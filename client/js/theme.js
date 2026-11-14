import { Game } from './game.js'
import { play, soundPrefs, setSoundPrefs } from './sound.js'

// Colour schemes, each with a light and a dark mode. All colours live in css/style.css as
// variables under :root[data-scheme][data-mode]; this module picks which set is active and
// builds the board's palette (and wood-grain textures) from them.
export const SCHEMES = [
    { id: 'classic', name: 'Classic' },
    { id: 'forest', name: 'Forest' },
    { id: 'ocean', name: 'Ocean' },
    { id: 'plum', name: 'Plum' }
]

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

// ------ Palette for the canvas ------

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const buildPalette = _ => {
    const edge = cssVar('--board-edge')
    const [er, eg, eb] = hexToRgb(edge)
    const shades = [cssVar('--board-dark'), cssVar('--board-mid'), cssVar('--board-light')]

    let cells = shades
    if(prefs.finish == 'wood'){
        cells = shades.map((hex, i) => Game.ctx.createPattern(makeWoodTexture(hex, 7919 * (i + 1)), 'repeat'))
    }

    Game.palette = {
        cells,
        wood: prefs.finish == 'wood',
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
