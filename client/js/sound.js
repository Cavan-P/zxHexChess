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
let noiseBuffer = null

const ensureContext = _ => {
    if(ctx) return ctx
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if(!AudioCtx) return null
    ctx = new AudioCtx()
    master = ctx.createGain()
    master.gain.value = prefs.volume
    master.connect(ctx.destination)

    // One second of white noise, reused for every knock and click.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for(let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return ctx
}

const unlock = _ => {
    const c = ensureContext()
    if(c?.state == 'suspended') c.resume()
}
document.addEventListener('pointerdown', unlock, { capture: true })
document.addEventListener('keydown', unlock, { capture: true })

// ------ Building blocks ------

// A filtered burst of noise: the "tok" of a wooden piece landing on wood.
const knock = (at, { freq = 2000, q = 1.2, duration = 0.06, gain = 0.6 } = {}) => {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + duration)
    src.connect(filter).connect(g).connect(master)
    src.start(at, Math.random() * 0.5)
    src.stop(at + duration + 0.02)
}

// A pitched note with a quick attack and a smooth decay.
const tone = (at, freq, { duration = 0.18, type = 'sine', gain = 0.25, attack = 0.005 } = {}) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    osc.connect(g).connect(master)
    osc.start(at)
    osc.stop(at + duration + 0.02)
}

// ------ The sounds ------

const SOUNDS = {
    move: t => { knock(t, { freq: 2300, gain: 0.55 }); tone(t, 190, { duration: 0.07, gain: 0.3 }) },
    capture: t => {
        knock(t, { freq: 1500, gain: 0.7, duration: 0.07 }); tone(t, 150, { duration: 0.09, gain: 0.35 })
        knock(t + 0.05, { freq: 1100, gain: 0.5, duration: 0.08 })
    },
    check: t => { tone(t, 880, { type: 'triangle', gain: 0.22 }); tone(t + 0.09, 1175, { type: 'triangle', gain: 0.22, duration: 0.25 }) },
    promote: t => [660, 880, 1100, 1320].forEach((f, i) => tone(t + i * 0.06, f, { type: 'triangle', gain: 0.18, duration: 0.22 })),
    start: t => { tone(t, 523, { gain: 0.18, duration: 0.25 }); tone(t + 0.12, 784, { gain: 0.18, duration: 0.35 }) },
    win: t => [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.09, f, { type: 'triangle', gain: 0.2, duration: 0.45 })),
    loss: t => [392, 330, 262].forEach((f, i) => tone(t + i * 0.14, f, { gain: 0.22, duration: 0.5 })),
    draw: t => { tone(t, 440, { gain: 0.2, duration: 0.3 }); tone(t + 0.16, 440, { gain: 0.2, duration: 0.4 }) },
    notify: t => tone(t, 1320, { gain: 0.12, duration: 0.15 }),
    warning: t => { tone(t, 990, { type: 'square', gain: 0.07, duration: 0.09 }); tone(t + 0.13, 990, { type: 'square', gain: 0.07, duration: 0.09 }) },
    tick: t => knock(t, { freq: 3200, q: 3, gain: 0.25, duration: 0.025 }),
    illegal: t => tone(t, 140, { type: 'sine', gain: 0.25, duration: 0.12 })
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
