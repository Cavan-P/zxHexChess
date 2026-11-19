import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js'
import { Game } from './game.js'
import { drawBoard } from './board.js'
import { drawHexagon } from './hexagon.js'
import { SPRITES } from './piece.js'
import { describeResult } from './network.js'

// "Download GIF": replays the game from the start position into an animated GIF, entirely in the
// browser. Each position is drawn onto an offscreen canvas with the same board code, textures and
// piece set as the live board (no coordinates), the last move's cells highlighted.

const SPEEDS = {
    normal: { move: 1000, last: 4000 },
    fast:   { move: 450,  last: 3000 }
}
const SPEED_KEY = 'qrs.gifSpeed'

const TARGET_WIDTH = 480   // output width in pixels
const MARGIN = 10          // logical units around the board
const PIECE_SIZE = 60

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const yieldToBrowser = _ => new Promise(resolve => setTimeout(resolve, 0))

const getSpeed = _ => {
    try { return localStorage.getItem(SPEED_KEY) == 'fast' ? 'fast' : 'normal' } catch(e){ return 'normal' }
}
const setSpeed = speed => {
    try { localStorage.setItem(SPEED_KEY, speed) } catch(e){}
}

// Same parsing as populateBoardFromFen, without touching the live board: [{ piece, cell }].
const piecesFromFen = fen => {
    const pieces = []
    let cellIndex = 0
    for(const char of fen){
        if(/\d/.test(char)){ cellIndex += +char; continue }
        const cell = Game.cells[cellIndex++]
        if(cell) pieces.push({ piece: char, cell })
    }
    return pieces
}

const sideLabel = color => {
    const side = Game.matchInfo?.[color]
    if(side?.name) return side.name
    if(Game.playerColor == color) return 'You'
    return color == 'white' ? 'White' : 'Black'
}

const captionLines = _ => {
    const title = `${sideLabel('white')} vs ${sideLabel('black')}`
    const moves = Math.ceil((Game.positions.length - 1) / 2)
    const detail = Game.result
        ? describeResult(Game.result).detail
        : `In progress · ${moves} move${moves == 1 ? '' : 's'}`
    return [title, `${detail} · QRS Chess`]
}

// Fixed layout for every frame: board bounds (cells only, coordinates off), scale and caption.
const makeLayout = _ => {
    const xs = Game.cells.map(c => c.x), ys = Game.cells.map(c => c.y)
    const size = Game.cellSize
    const box = {
        x: Math.min(...xs) - size - MARGIN,
        y: Math.min(...ys) - size * Math.sqrt(3) / 2 - MARGIN,
    }
    box.w = Math.max(...xs) + size + MARGIN - box.x
    box.h = Math.max(...ys) + size * Math.sqrt(3) / 2 + MARGIN - box.y

    const scale = TARGET_WIDTH / box.w
    const captionH = 52
    return {
        box, scale, captionH,
        width: Math.round(box.w * scale),
        height: Math.round(box.h * scale) + captionH,
        black: Game.playerColor == 'black',
        bg: cssVar('--bg-main') || '#ffead7',
        strong: cssVar('--text-strong') || '#3b2718',
        muted: cssVar('--text-muted') || '#9a7a5e',
        caption: captionLines()
    }
}

// Shrinks the font until the text fits the frame width.
const fitText = (ctx, text, weight, px, maxWidth) => {
    do ctx.font = `${weight} ${px}px Inter, system-ui, sans-serif`
    while(ctx.measureText(text).width > maxWidth && --px > 8)
}

const renderFrame = (ctx, layout, ply) => {
    const { box, scale, captionH, width, height, black } = layout
    const { x: cx, y: cy } = Game.boardCenter

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = layout.bg
    ctx.fillRect(0, 0, width, height)

    // Caption under the board.
    const [title, detail] = layout.caption
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = layout.strong
    fitText(ctx, title, 600, 17, width - 16)
    ctx.fillText(title, width / 2, height - captionH + 17)
    ctx.fillStyle = layout.muted
    fitText(ctx, detail, 500, 13, width - 16)
    ctx.fillText(detail, width / 2, height - captionH + 37)

    ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale)

    // The board itself, drawn by the same code as the live board (it draws onto Game.ctx).
    const liveCtx = Game.ctx
    Game.ctx = ctx
    try {
        ctx.fillStyle = Game.palette.edge
        drawBoard(0, 1, 5)
        if(black){
            ctx.translate(cx, cy)
            ctx.rotate(Math.PI)
            ctx.translate(-cx, -cy)
        }
        drawBoard(Game.palette.cells, 0, 0)
    } finally {
        Game.ctx = liveCtx
    }

    const move = Game.plyMoves?.[ply - 1]
    const cellAt = num => Game.cells[num]
    if(move){
        const from = cellAt(move.from), to = cellAt(move.to)
        if(from) drawHexagon(from.x, from.y, Game.cellSize, Game.palette.highlight(0.45), false, 'black', 0, ctx)
        if(to) drawHexagon(to.x, to.y, Game.cellSize, Game.palette.highlight(0.75), false, 'black', 0, ctx)
    }

    const checked = move?.check != null ? cellAt(move.check) : null
    if(checked){
        const glow = ctx.createRadialGradient(checked.x, checked.y, Game.cellSize * 0.15, checked.x, checked.y, Game.cellSize)
        glow.addColorStop(0, 'rgba(214, 48, 30, 0.85)')
        glow.addColorStop(1, 'rgba(214, 48, 30, 0)')
        drawHexagon(checked.x, checked.y, Game.cellSize, glow, false, 'black', 0, ctx)
    }

    for(const { piece, cell } of piecesFromFen(Game.positions[ply])){
        const [sx, sy] = SPRITES[piece] || []
        if(sx == null) continue
        ctx.save()
        if(black){
            // Undo the board rotation so pieces stand upright.
            ctx.translate(cell.x, cell.y)
            ctx.rotate(Math.PI)
            ctx.translate(-cell.x, -cell.y)
        }
        ctx.drawImage(Game.pieceSprite, sx, sy, 200, 200, cell.x - PIECE_SIZE / 2, cell.y - PIECE_SIZE / 2, PIECE_SIZE, PIECE_SIZE)
        ctx.restore()
    }
}

// Builds the GIF. onProgress(fraction) is called as frames are encoded.
export const buildGameGif = async (speed = 'normal', onProgress = _ => {}) => {
    const positions = Game.positions
    if(!positions?.length) throw new Error('No game to export')

    const timing = SPEEDS[speed] || SPEEDS.normal
    const layout = makeLayout()
    const { width, height } = layout

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const pixels = ply => {
        renderFrame(ctx, layout, ply)
        return ctx.getImageData(0, 0, width, height).data
    }

    // One shared palette for the whole GIF, taken from the start, the first move (for the
    // highlight colours) and the final position. Index 255 is kept free for "unchanged" pixels.
    const last = positions.length - 1
    const samplePlies = [...new Set([0, Math.min(1, last), last])]
    const sample = new Uint8ClampedArray(width * height * 4 * samplePlies.length)
    samplePlies.forEach((ply, i) => sample.set(pixels(ply), i * width * height * 4))
    const palette = quantize(sample, 255)
    const TRANSPARENT = palette.length
    const fullPalette = [...palette, [255, 0, 255]]
    while(fullPalette.length < 256) fullPalette.push([0, 0, 0])
    await yieldToBrowser()

    const gif = GIFEncoder()
    let previous = null

    for(let ply = 0; ply <= last; ply++){
        const index = applyPalette(pixels(ply), palette)
        const delay = ply == last ? timing.last : timing.move

        if(!previous){
            gif.writeFrame(index, width, height, { palette: fullPalette, delay, repeat: 0, dispose: 1 })
        }
        else {
            // Only the cells that changed are stored; the rest shows through from the frame before.
            const delta = new Uint8Array(index)
            for(let i = 0; i < delta.length; i++) if(index[i] == previous[i]) delta[i] = TRANSPARENT
            gif.writeFrame(delta, width, height, { delay, transparent: true, transparentIndex: TRANSPARENT, dispose: 1 })
        }
        previous = index

        onProgress((ply + 1) / (last + 1))
        await yieldToBrowser()
    }

    gif.finish()
    return new Blob([gif.bytes()], { type: 'image/gif' })
}

const download = (blob, name) => {
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(_ => URL.revokeObjectURL(url), 30000)
}

const fileName = _ => {
    const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player'
    const date = new Date().toISOString().slice(0, 10)
    return `qrs-chess-${slug(sideLabel('white'))}-vs-${slug(sideLabel('black'))}-${date}.gif`
}

export const setupGifExport = _ => {
    const button = document.getElementById('gif-btn')
    const label = document.getElementById('gif-btn-label')
    const speedBtn = document.getElementById('gif-speed-btn')
    if(!button || !speedBtn) return

    const renderSpeed = _ => {
        const fast = getSpeed() == 'fast'
        speedBtn.textContent = fast ? '2×' : '1×'
        speedBtn.title = `GIF speed: ${fast ? 'sped up' : 'normal'} (tap to change)`
        speedBtn.setAttribute('aria-label', speedBtn.title)
    }
    speedBtn.onclick = _ => { setSpeed(getSpeed() == 'fast' ? 'normal' : 'fast'); renderSpeed() }
    renderSpeed()

    let busy = false
    button.onclick = async _ => {
        if(busy || !Game.positions?.length) return
        busy = true
        let failed = false
        button.disabled = speedBtn.disabled = true
        label.textContent = '0%'
        try {
            const blob = await buildGameGif(getSpeed(), f => label.textContent = `${Math.round(f * 100)}%`)
            download(blob, fileName())
        }
        catch(e){
            console.error('GIF export failed', e)
            failed = true
        }
        finally {
            busy = false
            button.disabled = speedBtn.disabled = false
            label.textContent = failed ? 'Failed' : 'GIF'
            if(failed) setTimeout(_ => label.textContent = 'GIF', 2500)
        }
    }
}
