// Voice in and out using what the browser already has.
//
// Speaking: one shared speaker. Every call to speak() starts a new "session";
// stopping or starting again invalidates the old one, so a cancelled answer can
// never keep reading in the background (the cause of answers playing twice).
//
// Listening: continuous recognition with our own timing. Omar gets up to
// MAX_LISTEN_MS to talk; it waits up to WAIT_FOR_SPEECH_MS for him to start and
// ends after PAUSE_MS of quiet once he has spoken. If the browser ends the
// session early (Android does after short pauses), it restarts quietly.

const PREF_KEY = 'gth_voice_name'
export const MAX_LISTEN_MS = 20000
const WAIT_FOR_SPEECH_MS = 10000
const PAUSE_MS = 2600

// ── voices ──
export function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  if (!s) return Promise.resolve([])
  const now = s.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise(res => {
    const done = () => res(s.getVoices())
    s.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}

/** Higher is more natural sounding. */
export function voiceScore(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase()
  const lang = (v.lang || '').toLowerCase().replace('_', '-')
  if (!lang.startsWith('en')) return -1
  let s = 0
  if (/natural|neural/.test(n)) s += 100             // Microsoft Edge online voices (Ava, Andrew, Emma, Brian)
  if (/premium/.test(n)) s += 95                     // Apple premium voices
  if (/enhanced/.test(n)) s += 80                    // Apple enhanced voices
  if (/siri/.test(n)) s += 70
  if (/google (us|uk) english/.test(n)) s += 55      // Chrome desktop network voices
  if (/network/.test(n)) s += 50                     // Android Google network voices
  if (/\b(ava|andrew|emma|brian|jenny|aria|guy|samantha|zoe|evan|nathan|serena|daniel|karen|moira|tessa|allison|susan)\b/.test(n)) s += 15
  if (/compact|espeak|novelty|bad news|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|organ|superstar|wobble|jester|albert|fred|junior|ralph|kathy|bahh/.test(n)) s -= 200
  if (lang === 'en-ca') s += 12; else if (lang === 'en-us') s += 8; else if (lang === 'en-gb' || lang === 'en-au') s += 4
  if (!v.localService) s += 6
  return s
}

export async function rankedVoices() {
  const vs = (await voicesReady()).filter(v => voiceScore(v) >= 0)
  const seen = new Set<string>()
  return vs.sort((a, b) => voiceScore(b) - voiceScore(a)).filter(v => (seen.has(v.name) ? false : (seen.add(v.name), true)))
}
export function savedVoiceName(): string | null { try { return localStorage.getItem(PREF_KEY) } catch { return null } }
export function saveVoice(name: string) { try { localStorage.setItem(PREF_KEY, name) } catch { /* private mode */ } }
export async function chosenVoice(): Promise<SpeechSynthesisVoice | null> {
  const ranked = await rankedVoices()
  const pref = savedVoiceName()
  return ranked.find(v => v.name === pref) || ranked[0] || null
}
export const shortVoiceName = (n: string) => n.replace(/^Microsoft |^Google /, '').replace(/\s*Online\s*/i, ' ').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+-\s+.*$/, '').trim()

// ── speaking ──
let session = 0
let keepAlive: number | undefined

/** Call inside a tap handler once: iOS only allows speech that starts from a user gesture. */
export function primeSpeech() {
  const s = window.speechSynthesis
  if (!s) return
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; s.speak(u) } catch { /* ignore */ }
}

export function stopSpeaking() {
  session++
  if (keepAlive) { clearInterval(keepAlive); keepAlive = undefined }
  try { window.speechSynthesis?.cancel() } catch { /* nothing playing */ }
}

/** Read text aloud. Resolves when finished or stopped. */
export async function speak(text: string, opts: { voiceName?: string; onStart?: () => void; onSentence?: (i: number, total: number) => void } = {}): Promise<'done' | 'stopped'> {
  const s = window.speechSynthesis
  if (!s) return 'done'
  stopSpeaking()
  const my = session
  const ranked = await rankedVoices()
  if (my !== session) return 'stopped'
  const v = (opts.voiceName && ranked.find(x => x.name === opts.voiceName)) || ranked.find(x => x.name === savedVoiceName()) || ranked[0] || null
  const clean = text.replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim()
  const parts = (clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [clean]).map(p => p.trim()).filter(Boolean)
  // Chrome on desktop pauses long speech after ~15s; a gentle resume keeps it going
  keepAlive = window.setInterval(() => { if (s.speaking && !s.paused) { s.pause(); s.resume() } }, 10000)
  opts.onStart?.()
  for (let i = 0; i < parts.length; i++) {
    if (my !== session) return 'stopped'
    opts.onSentence?.(i, parts.length)
    await new Promise<void>(resolve => {
      const u = new SpeechSynthesisUtterance(parts[i])
      if (v) { u.voice = v; u.lang = v.lang }
      u.rate = /natural|premium|enhanced|neural/i.test(v?.name || '') ? 1.03 : 1.0
      u.onend = () => resolve()
      u.onerror = () => resolve()
      s.speak(u)
    })
  }
  if (my !== session) return 'stopped'
  if (keepAlive) { clearInterval(keepAlive); keepAlive = undefined }
  return 'done'
}

// ── listening ──
export function canListen() { return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) }

export type ListenHandle = { stop: (send?: boolean) => void }

/**
 * Listen until Omar pauses, presses Done, or the time runs out.
 * onUpdate gets the live transcript and the seconds left.
 */
export function listen(opts: { onUpdate: (text: string, msLeft: number) => void; onDone: (text: string) => void; onError: (msg: string) => void }): ListenHandle {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) { opts.onError('Voice input needs Chrome, Edge or Safari.'); return { stop: () => {} } }
  const started = Date.now()
  let committed = ''          // text from finished recognition sessions (after auto-restarts)
  let current = ''            // text from the running session
  let lastSpeech = 0
  let finished = false
  let rec: any = null
  let tick: number | undefined

  const text = () => `${committed} ${current}`.replace(/\s+/g, ' ').trim()
  const finish = (send: boolean) => {
    if (finished) return
    finished = true
    if (tick) clearInterval(tick)
    try { rec?.abort?.() } catch { /* already stopped */ }
    opts.onDone(send ? text() : '')
  }

  const start = () => {
    rec = new SR()
    rec.lang = 'en-CA'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (e: any) => {
      // Rebuild this session's text from all its results. Android repeats earlier
      // phrases inside later results, so keep only results that add new words.
      let out = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = String(e.results[i][0].transcript || '').trim()
        if (!t) continue
        if (out && t.toLowerCase().startsWith(out.toLowerCase())) out = t
        else if (!out.toLowerCase().endsWith(t.toLowerCase())) out = `${out} ${t}`.trim()
      }
      current = out
      lastSpeech = Date.now()
      opts.onUpdate(text(), Math.max(0, MAX_LISTEN_MS - (Date.now() - started)))
    }
    rec.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') { finished = true; if (tick) clearInterval(tick); opts.onError('Allow microphone access for this site, then tap the mic again.'); return }
      // 'no-speech' and 'aborted' are handled by our own timers
    }
    rec.onend = () => {
      if (finished) return
      committed = text(); current = ''
      // Browser stopped early: keep listening if there is time left
      if (Date.now() - started < MAX_LISTEN_MS - 800) { try { start() } catch { finish(true) } }
      else finish(true)
    }
    try { rec.start() } catch { finish(true) }
  }

  tick = window.setInterval(() => {
    const now = Date.now()
    const left = MAX_LISTEN_MS - (now - started)
    opts.onUpdate(text(), Math.max(0, left))
    if (left <= 0) return finish(true)
    if (!text() && now - started > WAIT_FOR_SPEECH_MS) return finish(true)
    if (text() && lastSpeech && now - lastSpeech > PAUSE_MS) return finish(true)
  }, 200)

  start()
  return { stop: (send = true) => finish(send) }
}
