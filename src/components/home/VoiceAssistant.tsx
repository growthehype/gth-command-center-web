import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Mic, Play, Square, X, Volume2, Check, RotateCcw, ChevronLeft, ArrowUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/lib/store'
import { speak, stopSpeaking, primeSpeech, listen, canListen, rankedVoices, chosenVoice, saveVoice, shortVoiceName, MAX_LISTEN_MS, type ListenHandle } from '@/lib/voice'

type Ev = { date: string; time?: string; title: string }
type Turn = { role: 'user' | 'assistant'; content: string }
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

/**
 * Talk to the Command Center. One phase at a time: listening, thinking,
 * speaking or idle. Starting anything new cancels whatever was running, so
 * nothing overlaps or plays twice.
 */
export default function VoiceAssistant({ events }: { events: Ev[] }) {
  const store = useAppStore() as any
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [msLeft, setMsLeft] = useState(MAX_LISTEN_MS)
  const [answer, setAnswer] = useState('')
  const [sentence, setSentence] = useState(-1)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<Turn[]>([])
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voice, setVoice] = useState('')
  const [picking, setPicking] = useState(false)
  const [typed, setTyped] = useState('')
  const listenRef = useRef<ListenHandle | null>(null)
  const reqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const micOk = canListen()

  useEffect(() => { rankedVoices().then(v => setVoices(v.slice(0, 14))); chosenVoice().then(v => setVoice(v?.name || '')) }, [])

  /** Stop everything that is running. */
  const halt = useCallback(() => {
    reqRef.current++
    abortRef.current?.abort(); abortRef.current = null
    listenRef.current?.stop(false); listenRef.current = null
    stopSpeaking()
    setSentence(-1)
    setPhase('idle')
  }, [])

  const close = useCallback(() => { halt(); setOpen(false); setPicking(false) }, [halt])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
  useEffect(() => () => { reqRef.current++; abortRef.current?.abort(); listenRef.current?.stop(false); stopSpeaking() }, [])

  const say = (text: string) => {
    setSentence(-1)
    speak(text, { voiceName: voice, onStart: () => setPhase('speaking'), onSentence: i => setSentence(i) })
      .then(r => { if (r === 'done') { setPhase('idle'); setSentence(-1) } })
  }

  const ask = async (payload: { mode?: 'rundown'; question?: string }) => {
    halt()
    const my = ++reqRef.current
    setOpen(true); setPicking(false); setError(''); setAnswer(''); setPhase('thinking')
    setHeard(payload.mode === 'rundown' ? '' : payload.question || '')
    const ctrl = new AbortController(); abortRef.current = ctrl
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/voice', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ ...payload, history, events, now: new Date().toLocaleString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }),
      })
      const j = await res.json().catch(() => ({}))
      if (my !== reqRef.current) return // a newer request replaced this one
      if (!res.ok || !j.answer) throw new Error(j.error || "Couldn't reach your Command Center. Check your connection and try again.")
      setAnswer(j.answer)
      setHistory(h => [...h, { role: 'user' as const, content: payload.mode === 'rundown' ? 'Give me my rundown.' : payload.question! }, { role: 'assistant' as const, content: j.answer }].slice(-8))
      if (j.changed?.length) { store.refreshTasks?.(); store.refreshProjects?.(); store.refreshActivity?.(); store.refreshClients?.() }
      say(j.answer)
    } catch (e: any) {
      if (e?.name === 'AbortError' || my !== reqRef.current) return
      setError(e.message); setPhase('idle')
    }
  }

  const startListening = () => {
    halt()
    primeSpeech()
    setOpen(true); setPicking(false); setError(''); setHeard(''); setMsLeft(MAX_LISTEN_MS); setPhase('listening')
    listenRef.current = listen({
      onUpdate: (t, left) => { setHeard(t); setMsLeft(left) },
      onDone: t => { listenRef.current = null; if (t) ask({ question: t }); else setPhase(p => (p === 'listening' ? 'idle' : p)) },
      onError: m => { listenRef.current = null; setError(m); setPhase('idle') },
    })
  }
  const finishListening = () => listenRef.current?.stop(true)
  const rundown = () => { primeSpeech(); ask({ mode: 'rundown' }) }
  const sendTyped = () => { const q = typed.trim(); if (!q) return; setTyped(''); primeSpeech(); ask({ question: q }) }

  const sentences = answer ? (answer.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [answer]).map(s => s.trim()).filter(Boolean) : []
  const secs = Math.ceil(msLeft / 1000)
  const R = 34, C = 2 * Math.PI * R

  const sheet = open && (
    <div className="va-layer" role="presentation">
      <button className="va-backdrop" aria-label="Close voice" onClick={close} />
      <section className="va-sheet" role="dialog" aria-modal="true" aria-label="Talk to your Command Center">
        <span className="va-grip" aria-hidden="true" />
        <header className="va-top">
          {picking
            ? <button className="va-pill" onClick={() => setPicking(false)}><ChevronLeft size={14} /> Back</button>
            : <button className="va-pill" onClick={() => { halt(); setPicking(true) }} aria-label="Choose voice"><Volume2 size={13} /> {voice ? shortVoiceName(voice) : 'Voice'}</button>}
          <button className="va-x" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>

        {picking ? (
          <ul className="va-voices">
            {voices.map(v => (
              <li key={v.name}>
                <button className={voice === v.name ? 'is-on' : ''} onClick={() => { setVoice(v.name); saveVoice(v.name); speak("Hi Omar. Here's your rundown for today.", { voiceName: v.name }) }}>
                  <span>{shortVoiceName(v.name)}</span><em>{v.lang}</em>{voice === v.name && <Check size={14} />}
                </button>
              </li>
            ))}
            {!voices.length && <li className="va-muted">No voices found on this device.</li>}
          </ul>
        ) : (
          <>
            <div className="va-stage">
              {phase === 'listening' ? (
                <button className="va-listen" onClick={finishListening} aria-label="Done talking">
                  <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r={R} className="va-ring-bg" /><circle cx="40" cy="40" r={R} className="va-ring" strokeDasharray={C} strokeDashoffset={C * (1 - msLeft / MAX_LISTEN_MS)} /></svg>
                  <Mic size={22} />
                  <span className="va-secs">{secs}s</span>
                </button>
              ) : (
                <div className={`va-orb is-${phase}`} aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />)}</div>
              )}
              <p className="va-state" aria-live="polite">
                {phase === 'listening' ? (heard ? 'Listening · pause or tap the mic when you\'re done' : 'Go ahead, I\'m listening') : phase === 'thinking' ? 'Checking your CRM' : phase === 'speaking' ? 'Speaking' : answer ? '' : 'Ask about your day, clients or money'}
              </p>
            </div>

            {heard && <p className="va-heard">{heard}</p>}
            {phase === 'thinking' && <div className="va-skel"><i /><i /><i /></div>}
            {sentences.length > 0 && phase !== 'thinking' && (
              <p className="va-answer">{sentences.map((s, i) => <span key={i} className={phase === 'speaking' && i === sentence ? 'is-now' : phase === 'speaking' && i > sentence ? 'is-next' : ''}>{s} </span>)}</p>
            )}
            {error && <p className="va-err">{error}</p>}

            <div className="va-actions">
              {phase === 'speaking' && <><button className="va-btn" onClick={halt}><Square size={13} /> Stop</button>{micOk && <button className="va-btn is-primary" onClick={startListening}><Mic size={15} /> Interrupt</button>}</>}
              {phase === 'listening' && <><button className="va-btn" onClick={halt}>Cancel</button><button className="va-btn is-primary" onClick={finishListening}><Check size={15} /> Done</button></>}
              {phase === 'thinking' && <button className="va-btn" onClick={halt}>Cancel</button>}
              {phase === 'idle' && <>
                {answer && <button className="va-btn" onClick={() => say(answer)}><RotateCcw size={13} /> Replay</button>}
                {micOk && <button className="va-btn is-primary" onClick={startListening}><Mic size={15} /> {answer ? 'Ask a follow-up' : 'Tap to talk'}</button>}
              </>}
            </div>

            <form className="va-type" onSubmit={e => { e.preventDefault(); sendTyped() }}>
              <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={micOk ? 'Or type a question' : 'Type a question'} aria-label="Type a question" />
              <button type="submit" disabled={!typed.trim()} aria-label="Ask"><ArrowUp size={15} /></button>
            </form>
          </>
        )}
      </section>
    </div>
  )

  return (
    <>
      <div className="va-btns">
        <button className="va-rundown" onClick={rundown} disabled={phase === 'thinking'}><Play size={13} /> Rundown</button>
        <button className={`va-mic ${phase === 'listening' ? 'is-on' : ''}`} onClick={phase === 'listening' ? finishListening : micOk ? startListening : () => { setOpen(true); setError('Voice input needs Chrome, Edge or Safari. You can type below.') }} aria-label="Ask out loud"><Mic size={16} /></button>
      </div>
      {sheet && createPortal(sheet, document.body)}
    </>
  )
}
