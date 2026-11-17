// Voice in and out using what the browser already has. Picks the most natural
// voice on the device (Microsoft "Natural" voices in Edge, Apple Premium and
// Enhanced voices on iPhone and Mac, Google voices on Android and Chrome).

const PREF_KEY = 'gth_voice_name'

export function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const s = window.speechSynthesis
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
  const lang = (v.lang || '').toLowerCase()
  if (!lang.startsWith('en')) return -1
  let s = 0
  if (/natural|neural/.test(n)) s += 100            // Microsoft Edge online voices (Ava, Andrew, Emma, Brian...)
  if (/premium/.test(n)) s += 95                    // Apple premium voices
  if (/enhanced/.test(n)) s += 80                   // Apple enhanced voices
  if (/siri/.test(n)) s += 70
  if (/google (us|uk) english/.test(n)) s += 55     // Chrome desktop network voices
  if (/-x-[a-z]{3}-network|network/.test(n)) s += 50 // Android Google network voices
  if (/\b(ava|andrew|emma|brian|jenny|aria|guy|samantha|zoe|evan|nathan|serena|daniel|karen|moira|tessa|allison|susan)\b/.test(n)) s += 15
  if (/compact|espeak|novelty|bad news|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|organ|superstar|wobble|jester|albert|fred|junior|ralph|kathy|bahh/.test(n)) s -= 200
  if (lang === 'en-ca') s += 12; else if (lang === 'en-us') s += 8; else if (lang === 'en-gb' || lang === 'en-au') s += 4
  if (!v.localService) s += 6
  return s
}

export async function rankedVoices() {
  const vs = (await voicesReady()).filter(v => voiceScore(v) >= 0)
  return vs.sort((a, b) => voiceScore(b) - voiceScore(a))
}

export async function chosenVoice(): Promise<SpeechSynthesisVoice | null> {
  const ranked = await rankedVoices()
  let pref: string | null = null
  try { pref = localStorage.getItem(PREF_KEY) } catch { /* private mode */ }
  return ranked.find(v => v.name === pref) || ranked[0] || null
}
export function saveVoice(name: string) { try { localStorage.setItem(PREF_KEY, name) } catch { /* private mode */ } }

/** Read text aloud. Long text is split into sentences (Chrome stops long utterances part way). */
export async function speak(text: string, opts: { onStart?: () => void; onEnd?: () => void; voiceName?: string } = {}) {
  const s = window.speechSynthesis
  if (!s) { opts.onEnd?.(); return }
  s.cancel()
  const ranked = await rankedVoices()
  const v = (opts.voiceName && ranked.find(x => x.name === opts.voiceName)) || await chosenVoice()
  const clean = text.replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim()
  const parts = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [clean]
  let i = 0
  const next = () => {
    if (i >= parts.length) { opts.onEnd?.(); return }
    const u = new SpeechSynthesisUtterance(parts[i++].trim())
    if (v) { u.voice = v; u.lang = v.lang }
    u.rate = /natural|premium|enhanced|neural/i.test(v?.name || '') ? 1.02 : 1.0
    u.pitch = 1
    u.onend = next
    u.onerror = next
    s.speak(u)
  }
  opts.onStart?.()
  next()
}
export function stopSpeaking() { try { window.speechSynthesis?.cancel() } catch { /* nothing to stop */ } }

// ── listening ──
export function canListen() { return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) }

export function listen(opts: { onText: (interim: string) => void; onDone: (finalText: string) => void; onError: (msg: string) => void }) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) { opts.onError('Voice input is not supported in this browser. Try Chrome or Safari.'); return () => {} }
  const r = new SR()
  r.lang = 'en-CA'
  r.interimResults = true
  r.continuous = false
  r.maxAlternatives = 1
  let finalText = ''
  r.onresult = (e: any) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) finalText += t; else interim += t
    }
    opts.onText((finalText + ' ' + interim).trim())
  }
  r.onerror = (e: any) => opts.onError(e?.error === 'not-allowed' ? 'Allow microphone access to talk to the Command Center.' : e?.error === 'no-speech' ? "I didn't hear anything." : 'Voice input stopped.')
  r.onend = () => opts.onDone(finalText.trim())
  try { r.start() } catch { opts.onError('Could not start the microphone.') }
  return () => { try { r.stop() } catch { /* already stopped */ } }
}
