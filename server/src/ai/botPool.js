
const { Worker } = require('worker_threads')
const os = require('os')
const path = require('path')

const POOL_SIZE = Math.max(1, Math.min(4, os.cpus().length - 1))
const JOB_TIMEOUT_MS = 30000

const workers = []
const queue = []
let nextJobId = 1

const spawnWorker = _ => {
    const entry = { worker: new Worker(path.join(__dirname, 'botWorker.js')), job: null }

    entry.worker.on('message', ({ jobId, move, error }) => {
        const job = entry.job
        if(!job || job.jobId != jobId) return

        clearTimeout(job.timer)
        entry.job = null

        if(error) job.reject(new Error(error))
        else job.resolve(move)

        pump()
    })

    entry.worker.on('error', e => {
        console.error('[botPool] Worker crashed:', e)
        replaceWorker(entry, e)
    })

    return entry
}

const replaceWorker = (entry, err) => {
    if(entry.job){
        clearTimeout(entry.job.timer)
        entry.job.reject(err)
    }
    entry.worker.terminate().catch(_ => {})

    const i = workers.indexOf(entry)
    if(i >= 0) workers[i] = spawnWorker()
    pump()
}

const pump = _ => {
    for(const entry of workers){
        if(entry.job || !queue.length) continue

        const job = queue.shift()
        entry.job = job
        job.timer = setTimeout(_ => replaceWorker(entry, new Error('Bot timed out')), JOB_TIMEOUT_MS)
        entry.worker.postMessage({ jobId: job.jobId, botId: job.botId, state: job.state })
    }
}

const ensureWorkers = _ => {
    while(workers.length < POOL_SIZE) workers.push(spawnWorker())
}

const requestBotMove = (botId, state) => new Promise((resolve, reject) => {
    ensureWorkers()
    queue.push({ jobId: nextJobId++, botId, state, resolve, reject })
    pump()
})

module.exports = { requestBotMove }
