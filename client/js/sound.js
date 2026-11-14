// Game sounds, synthesized with the Web Audio API: no audio files to download or license.
//
// Browsers only allow audio after the user has interacted with the page, so the audio context is
// created (or resumed) on the first pointer or key press.

const STORAGE_KEY = 'qrs.sound'
const DEFAULTS = { enabled: true, volume: 0.7 }

let prefs = (_ => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) } }
    catch(e){ return { ...DEFAULTS } }
})()

let ctx = null
let master = null
let room = null
let noiseBuffer = null

const ensureContext = _ => {
    if(ctx) return ctx
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if(!AudioCtx) return null
    ctx = new AudioCtx()
    // A limiter at the end, so stacked sounds at full volume never clip.
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -4
    limiter.knee.value = 2
    limiter.ratio.value = 16
    limiter.attack.value = 0.001
    limiter.release.value = 0.08
    limiter.connect(ctx.destination)
    master = ctx.createGain()
    master.gain.value = prefs.volume
    master.connect(limiter)

    // One second of white noise, reused for every knock and click.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for(let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    // A small, dull room: a quarter second of decaying noise as a reverb. Mixed in quietly, it's
    // what makes a knock sound like it happened on a table instead of inside a tin can.
    const length = Math.floor(ctx.sampleRate * 0.25)
    const ir = ctx.createBuffer(2, length, ctx.sampleRate)
    for(let ch = 0; ch < 2; ch++){
        const d = ir.getChannelData(ch)
        for(let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3)
    }
    const convolver = ctx.createConvolver()
    convolver.buffer = ir
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2500
    room = ctx.createGain()
    room.gain.value = 0.22
    room.connect(convolver).connect(damp).connect(master)
    return ctx
}

const unlock = _ => {
    const c = ensureContext()
    if(c?.state == 'suspended') c.resume()
}
document.addEventListener('pointerdown', unlock, { capture: true })
document.addEventListener('keydown', unlock, { capture: true })

// ------ Building blocks ------

const out = node => { node.connect(master); node.connect(room) }
const vary = (value, amount = 0.06) => value * (1 + (Math.random() * 2 - 1) * amount)

// Filtered noise with a fast attack and an exponential decay.
const burst = (at, { type = 'bandpass', freq = 1000, q = 1, duration = 0.05, gain = 0.5 } = {}) => {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    src.connect(filter).connect(g)
    out(g)
    src.start(at, Math.random() * 0.5)
    src.stop(at + duration + 0.02)
}

// A low thump whose pitch falls quickly: the weight of a piece meeting the board.
const thump = (at, { from = 140, to = 70, duration = 0.09, gain = 0.5 } = {}) => {
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(from, at)
    osc.frequency.exponentialRampToValueAtTime(to, at + duration)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    osc.connect(g)
    out(g)
    osc.start(at)
    osc.stop(at + duration + 0.02)
}

// A wooden piece set down on a wooden board: a sharp contact click and the short ringing "tock"
// of the wood itself (a few narrow resonances), with only a touch of low body under it.
// `pitch` raises or lowers the wood, `force` is how hard it lands, `bright` adds snap.
const clack = (at, { pitch = 1, force = 1, bright = 1 } = {}) => {
    burst(at, { type: 'highpass', freq: 3500, q: 0.7, duration: 0.007, gain: 0.3 * force * bright })
    burst(at, { freq: vary(1150 * pitch, 0.05), q: 9, duration: 0.07, gain: 1.6 * force })
    burst(at, { freq: vary(2400 * pitch, 0.05), q: 12, duration: 0.04, gain: 1.1 * force * bright })
    burst(at, { freq: vary(640 * pitch, 0.05), q: 6, duration: 0.055, gain: 0.8 * force })
    burst(at, { freq: 260, q: 1.5, duration: 0.04, gain: 0.25 * force })
}

// A struck wooden bar (marimba-ish): a warm fundamental, its 4th-ish overtone, and a mallet tap.
const mallet = (at, freq, { gain = 0.22, decay = 0.6 } = {}) => {
    for(const [ratio, level, length] of [[1, 1, decay], [3.93, 0.22, decay * 0.25], [9.2, 0.05, decay * 0.08]]){
        const osc = ctx.createOscillator()
        osc.frequency.value = freq * ratio
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, at)
        g.gain.exponentialRampToValueAtTime(gain * level, at + 0.004)
        g.gain.exponentialRampToValueAtTime(0.0001, at + length)
        osc.connect(g)
        out(g)
        osc.start(at)
        osc.stop(at + length + 0.02)
    }
    burst(at, { freq: freq * 2, q: 2, duration: 0.02, gain: gain * 0.5 })
}

// A hollow wood block: noise rung through a narrow filter, so it has pitch without a beep.
const woodBlock = (at, freq, gain = 0.6) => {
    burst(at, { freq, q: 14, duration: 0.18, gain })
    burst(at, { type: 'highpass', freq: 2500, q: 0.7, duration: 0.012, gain: gain * 0.3 })
}

// ------ The sounds ------

const NOTE = { C4: 261.6, D4: 293.7, E4: 329.6, G4: 392, A4: 440, C5: 523.3, E5: 659.3, G5: 784 }

const SOUNDS = {
    move: t => clack(t),
    // One harder, brighter knock: the piece cracks into its victim.
    capture: t => clack(t, { pitch: 1.12, force: 1.2, bright: 1.7 }),
    check: t => { clack(t, { force: 1.1 }); woodBlock(t + 0.07, 520); woodBlock(t + 0.07, 780, 0.25) },
    promote: t => { clack(t); mallet(t + 0.06, NOTE.G4); mallet(t + 0.16, NOTE.C5); mallet(t + 0.16, NOTE.E5, { gain: 0.12 }) },
    start: t => { mallet(t, NOTE.C4, { gain: 0.18 }); mallet(t + 0.14, NOTE.G4, { gain: 0.18 }) },
    win: t => [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5].forEach((f, i) => mallet(t + i * 0.11, f, { gain: 0.2, decay: 0.9 })),
    loss: t => [NOTE.G4, NOTE.E4, NOTE.C4].forEach((f, i) => mallet(t + i * 0.16, f, { gain: 0.2, decay: 0.9 })),
    draw: t => { mallet(t, NOTE.E4, { gain: 0.18 }); mallet(t + 0.18, NOTE.E4, { gain: 0.18 }) },
    achievement: t => [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => mallet(t + i * 0.08, f, { gain: 0.14, decay: 0.8 })),
    notify: t => mallet(t, NOTE.E5, { gain: 0.1, decay: 0.4 }),
    warning: t => { woodBlock(t, 900, 0.9); woodBlock(t + 0.14, 900, 0.9) },
    tick: t => woodBlock(t, 1300, 0.25),
    illegal: t => { burst(t, { type: 'lowpass', freq: 400, q: 0.7, duration: 0.09, gain: 0.5 }); thump(t, { from: 90, to: 55, gain: 0.3 }) }
}

export const play = name => {
    if(!prefs.enabled || !SOUNDS[name]) return
    const c = ensureContext()
    if(!c || c.state != 'running') return
    SOUNDS[name](c.currentTime + 0.005)
}

// ------ Settings ------

export const soundPrefs = _ => ({ ...prefs })

export const setSoundPrefs = changes => {
    prefs = { ...prefs, ...changes }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch(e){}
    if(master) master.gain.value = prefs.volume
}
