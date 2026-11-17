import { useEffect, useRef, useState } from 'react'
import { Mic, Play, Square, X, Volume2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/lib/store'
import { speak, stopSpeaking, listen, canListen, rankedVoices, chosenVoice, saveVoice } from '@/lib/voice'

type Ev = { date: string; time?: string; title: string }
type Turn = { role: 'user' | 'assistant'; content: string }
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

/** Rundown and talk-to-your-CRM controls for the Home hero. */
export default function VoiceAssistant({ events }: { events: Ev[] }) {
  const { refreshTasks, refreshProjects, refreshActivity, refreshClients } = useAppStore() as any
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [history, setHistory] = useState<Turn[]>([])
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voice, setVoice] = useState('')
  const [pickVoice, setPickVoice] = useState(false)
  const stopListen = useRef<() => void>(() => {})

  useEffect(() => { rankedVoices().then(v => setVoices(v.slice(0, 12))); chosenVoice().then(v => setVoice(v?.name || '')) }, [])
  useEffect(() => () => { stopSpeaking(); stopListen.current() }, [])

  const ask = async (payload: { mode?: 'rundown'; question?: string }) => {
    setOpen(true); setError(''); setPhase('thinking'); stopSpeaking()
    if (payload.question) setHeard(payload.question)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ ...payload, history, events, now: new Date().toLocaleString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Something went wrong')
      setAnswer(j.answer)
      setHistory(h => [...h, { role: 'user' as const, content: payload.mode === 'rundown' ? 'Give me my rundown.' : payload.question! }, { role: 'assistant' as const, content: j.answer }].slice(-8))
      if (j.changed?.length) { refreshTasks?.(); refreshProjects?.(); refreshActivity?.(); refreshClients?.() }
      speak(j.answer, { voiceName: voice, onStart: () => setPhase('speaking'), onEnd: () => setPhase('idle') })
    } catch (e: any) { setError(e.message); setPhase('idle') }
  }

  const startListening = () => {
    stopSpeaking(); setOpen(true); setError(''); setHeard(''); setPhase('listening')
    stopListen.current = listen({
      onText: t => setHeard(t),
      onDone: t => { if (t) ask({ question: t }); else setPhase(p => p === 'listening' ? 'idle' : p) },
      onError: m => { setError(m); setPhase('idle') },
    })
  }
  const stopAll = () => { stopListen.current(); stopSpeaking(); setPhase('idle') }
  const close = () => { stopAll(); setOpen(false); setPickVoice(false) }

  return (
    <>
      <div className="va-btns">
        <button className="va-rundown" onClick={() => ask({ mode: 'rundown' })} disabled={phase === 'thinking'}>
          <Play size={13} /> Rundown
        </button>
        {canListen() && <button className={`va-mic ${phase === 'listening' ? 'is-on' : ''}`} onClick={phase === 'listening' ? stopAll : startListening} aria-label="Ask out loud"><Mic size={16} /></button>}
      </div>

      {open && (
        <div className="va-sheet" role="dialog" aria-label="Voice assistant">
          <div className="va-top">
            <button className="va-voice" onClick={() => setPickVoice(p => !p)}><Volume2 size={13} /> {voice ? voice.replace(/\s*\(.*\)$/, '').replace(/^Microsoft |^Google /, '') : 'Voice'}</button>
            <button className="va-x" onClick={close} aria-label="Close"><X size={16} /></button>
          </div>
          {pickVoice ? (
            <ul className="va-voices">
              {voices.map(v => (
                <li key={v.name}>
                  <button onClick={() => { setVoice(v.name); saveVoice(v.name); speak("Hi Omar, here's how I sound.", { voiceName: v.name }) }}>
                    <span>{v.name}</span><em>{v.lang}</em>{voice === v.name && <Check size={13} />}
                  </button>
                </li>
              ))}
              {!voices.length && <li className="va-muted">No voices found on this device.</li>}
            </ul>
          ) : (
            <>
              <div className={`va-orb is-${phase}`} aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</div>
              <p className="va-state">{phase === 'listening' ? 'Listening…' : phase === 'thinking' ? 'Checking your CRM…' : phase === 'speaking' ? 'Speaking' : error ? '' : 'Ask me anything about your day'}</p>
              {heard && <p className="va-heard">“{heard}”</p>}
              {answer && phase !== 'thinking' && <p className="va-answer">{answer}</p>}
              {error && <p className="va-err">{error}</p>}
              <div className="va-actions">
                {phase === 'speaking' || phase === 'listening'
                  ? <button className="va-stop" onClick={stopAll}><Square size={13} /> Stop</button>
                  : canListen() && <button className="va-talk" onClick={startListening} disabled={phase === 'thinking'}><Mic size={15} /> {answer ? 'Ask a follow-up' : 'Tap to talk'}</button>}
              </div>
              <p className="va-hint">Try: “What meetings do I have tomorrow?” · “What's outstanding?” · “Add a task to call Tarin Friday”</p>
            </>
          )}
        </div>
      )}
    </>
  )
}
