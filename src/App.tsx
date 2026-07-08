import React, { useState, useEffect, useRef } from 'react';
import { 
  Power, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Globe, 
  Cloud, 
  Clock, 
  Sparkles, 
  AlertCircle, 
  Compass, 
  HelpCircle, 
  RefreshCw, 
  ExternalLink,
  ChevronRight,
  PhoneOff,
  Radio
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LiveSession, SessionState, LiveState, LiveStatus } from './modules/LiveSession';

const SUGGESTED_PROMPTS = [
  "तुम कैसी हो?",
  "कोई मज़ेदार कहानी सुनाओ!",
  "आज मौसम कैसा है?",
  "गूगल खोल दो।"
];

export default function App() {
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [sessionState, setSessionState] = useState<SessionState>({
    status: 'disconnected',
    state: 'disconnected',
    userVolume: 0,
    modelVolume: 0,
    userTranscript: '',
    modelTranscript: '',
    error: null,
    activeTool: null,
  });

  const sessionRef = useRef<LiveSession | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize the LiveSession on mount and bind state updates
  useEffect(() => {
    sessionRef.current = new LiveSession((newState) => {
      setSessionState({ ...newState });
    });

    return () => {
      if (sessionRef.current) {
        sessionRef.current.stop();
      }
    };
  }, []);

  // Sync Canvas rendering with state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    const render = () => {
      const width = canvas.width = canvas.parentElement?.clientWidth || 400;
      const height = canvas.height = canvas.parentElement?.clientHeight || 200;
      
      ctx.clearRect(0, 0, width, height);

      // Check current active state
      const isSpeaking = sessionState.state === 'speaking';
      const isListening = sessionState.state === 'listening';
      const isConnecting = sessionState.state === 'connecting';
      
      let activeVolume = 0;
      let waveCount = 3;
      let colors: string[] = [];

      if (isSpeaking) {
        activeVolume = sessionState.modelVolume;
        colors = [
          'rgba(168, 85, 247, 0.6)',  // Neon Purple
          'rgba(236, 72, 153, 0.4)',  // Neon Pink
          'rgba(99, 102, 241, 0.3)',  // Electric Indigo
        ];
      } else if (isListening) {
        activeVolume = sessionState.userVolume;
        colors = [
          'rgba(34, 197, 94, 0.5)',   // Neon Green
          'rgba(20, 184, 166, 0.3)',  // Neon Teal
          'rgba(59, 130, 246, 0.2)',  // Neon Blue
        ];
      } else if (isConnecting) {
        activeVolume = 10; // slow simulated breathing
        colors = [
          'rgba(234, 179, 8, 0.3)',   // Amber
          'rgba(249, 115, 22, 0.2)',  // Orange
          'rgba(234, 179, 8, 0.1)',   // Soft Yellow
        ];
      } else {
        // Disconnected - simple thin flatline
        activeVolume = 0;
        colors = ['rgba(148, 163, 184, 0.15)'];
        waveCount = 1;
      }

      phase += 0.04 + (activeVolume * 0.003);

      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        const waveOffset = w * (Math.PI / 3);
        // Base amplitude plus scaling from volume
        const baseAmp = isConnecting ? 10 : (isListening || isSpeaking ? 15 : 2);
        const amplitude = baseAmp + (activeVolume * 1.2) * (1 - w * 0.25);
        const frequency = 0.008 + w * 0.004;

        ctx.strokeStyle = colors[w] || 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = w === 0 ? 3 : 1.5;

        for (let x = 0; x <= width; x++) {
          // Sine wave shaped by a parabolic envelope so it tethers perfectly to both ends
          const envelope = Math.sin((x / width) * Math.PI);
          const y = (height / 2) + Math.sin(x * frequency + phase + waveOffset) * amplitude * envelope;
          
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [sessionState.state, sessionState.userVolume, sessionState.modelVolume]);

  const handleToggleSession = async () => {
    if (sessionState.status === 'disconnected') {
      if (sessionRef.current) {
        await sessionRef.current.start(selectedVoice);
      }
    } else {
      if (sessionRef.current) {
        sessionRef.current.stop();
      }
    }
  };

  return (
    <div id="root-container" className="relative min-h-screen w-full bg-slate-950 text-slate-100 overflow-x-hidden flex flex-col font-sans selection:bg-purple-500/30 selection:text-white">
      
      {/* 1. FUTURISTIC BACKGROUND GRID & LIGHT BLOBS */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Glowing Ambient Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/10 blur-[120px] animate-pulse duration-[8000ms]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-900/10 blur-[150px] animate-pulse duration-[10000ms]" />
        <div className="absolute top-[30%] right-[15%] w-[30%] h-[30%] rounded-full bg-pink-900/5 blur-[100px]" />
        
        {/* Grid lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30" />
      </div>

      {/* 2. TOP HEADER (STATUS & SPEC PANEL) */}
      <header className="relative w-full max-w-7xl mx-auto px-6 py-4 flex items-center justify-between z-10 border-b border-white/5 backdrop-blur-sm bg-slate-950/20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Sparkles size={18} className="text-white animate-pulse" />
            </div>
            <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 blur opacity-30 animate-pulse pointer-events-none" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Lyraa
            </h1>
            <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Voice Intelligence</p>
          </div>
        </div>

        {/* Real-time Indicator Badge */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${
              sessionState.status === 'connected' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' :
              sessionState.status === 'connecting' ? 'bg-amber-500 animate-ping' :
              sessionState.status === 'error' ? 'bg-red-500' : 'bg-slate-500'
            }`} />
            <span className="uppercase tracking-wider text-[10px] text-slate-300">
              {sessionState.status === 'connected' ? 'Connected' :
               sessionState.status === 'connecting' ? 'Connecting' :
               sessionState.status === 'error' ? 'Error' : 'Dormant'}
            </span>
          </div>

          <div className="text-xs font-mono text-pink-400 bg-pink-500/10 px-3 py-1.5 rounded-lg border border-pink-500/20 shadow-[0_0_10px_rgba(236,72,153,0.1)]">
            Lyraa-Kore (सबसे प्यारी और मीठी आवाज़)
          </div>
        </div>
      </header>

      {/* 3. MAIN INTERACTION STAGE */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 flex flex-col items-center justify-center gap-8 z-10">
        
        {/* ORB AREA / VISUAL CORE */}
        <div className="relative flex-1 w-full max-w-lg flex items-center justify-center py-6 min-h-[280px]">
          
          {/* Waveform Background Visualizer */}
          <div className="absolute inset-0 w-full h-full flex items-center justify-center opacity-85 z-0">
            <canvas ref={canvasRef} className="w-full h-full max-h-[180px]" />
          </div>

          {/* Central Pulsing Intelligent Orb */}
          <button 
            id="central-orb-button"
            onClick={handleToggleSession}
            className="relative w-48 h-48 rounded-full flex items-center justify-center z-10 outline-none select-none"
          >
            {/* Multi-layered dynamic breathing ring */}
            <AnimatePresence>
              {sessionState.state === 'speaking' && (
                <>
                  {/* Concentric ripples for speaking */}
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1.5 + (sessionState.modelVolume * 0.005), opacity: [0.1, 0.3, 0.1] }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-full border border-purple-500/40 bg-purple-500/5 blur-[4px]"
                  />
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1.25 + (sessionState.modelVolume * 0.003), opacity: [0.2, 0.4, 0.2] }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-full border border-pink-500/30 bg-pink-500/5"
                  />
                </>
              )}

              {sessionState.state === 'listening' && (
                <>
                  {/* Concentric ripples for listening */}
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1.4 + (sessionState.userVolume * 0.004), opacity: [0.15, 0.35, 0.15] }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-full border border-green-500/40 bg-green-500/5 blur-[2px]"
                  />
                </>
              )}

              {sessionState.state === 'connecting' && (
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="absolute inset-0.5 rounded-full border-2 border-dashed border-amber-500/50"
                />
              )}
            </AnimatePresence>

            {/* Glowing Backdrop Circle */}
            <div className={`absolute inset-3 rounded-full transition-all duration-700 blur-[15px] opacity-40 ${
              sessionState.state === 'speaking' ? 'bg-gradient-to-r from-purple-500 to-pink-500 scale-110' :
              sessionState.state === 'listening' ? 'bg-gradient-to-r from-green-500 to-teal-500 scale-105 shadow-[0_0_30px_rgba(34,197,94,0.3)]' :
              sessionState.state === 'connecting' ? 'bg-gradient-to-r from-amber-500 to-orange-500 scale-100 animate-pulse' :
              'bg-slate-800 scale-95'
            }`} />

            {/* Solid Glass Orb Sphere */}
            <div className={`absolute inset-4 rounded-full border transition-all duration-500 flex flex-col items-center justify-center shadow-2xl ${
              sessionState.state === 'speaking' ? 'bg-purple-950/80 border-purple-500/40' :
              sessionState.state === 'listening' ? 'bg-teal-950/80 border-green-500/40' :
              sessionState.state === 'connecting' ? 'bg-slate-900/80 border-amber-500/40' :
              'bg-slate-900/90 border-white/10 hover:border-purple-500/30'
            }`}>
              
              {/* Voice core graphic/icon */}
              <div className="mb-2">
                {sessionState.state === 'speaking' ? (
                  <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Radio size={36} className="text-purple-400" />
                  </motion.div>
                ) : sessionState.state === 'listening' ? (
                  <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                    <Mic size={36} className="text-green-400" />
                  </motion.div>
                ) : sessionState.state === 'connecting' ? (
                  <RefreshCw size={36} className="text-amber-400 animate-spin" />
                ) : (
                  <Power size={36} className="text-slate-400 group-hover:text-purple-400 transition-colors" />
                )}
              </div>

              {/* Text indicator inside the button */}
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase opacity-80">
                {sessionState.state === 'speaking' ? 'Speaking' :
                 sessionState.state === 'listening' ? 'Listening' :
                 sessionState.state === 'connecting' ? 'Waking Up' :
                 'Start Call'}
              </span>

              {/* Simulated active line */}
              <div className={`h-0.5 w-8 rounded-full mt-2 transition-all duration-500 ${
                sessionState.state === 'speaking' ? 'bg-purple-400' :
                sessionState.state === 'listening' ? 'bg-green-400' :
                sessionState.state === 'connecting' ? 'bg-amber-400' :
                'bg-slate-600'
              }`} />
            </div>

          </button>
        </div>

        {/* 4. CHRONIC OR CURRENTLY EXECUTING BROWSER ACTIONS / TOOLS */}
        <AnimatePresence>
          {sessionState.activeTool && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full max-w-md bg-indigo-950/40 border border-indigo-500/30 backdrop-blur-lg rounded-2xl p-4 flex items-center justify-between shadow-2xl z-20"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  sessionState.activeTool.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-indigo-500/20 text-indigo-400 animate-pulse'
                }`}>
                  {sessionState.activeTool.name === 'openWebsite' ? <Globe size={18} /> : 
                   sessionState.activeTool.name === 'getWeather' ? <Cloud size={18} /> : 
                   <Clock size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400">Tool Executing</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${sessionState.activeTool.status === 'completed' ? 'bg-green-400' : 'bg-indigo-400 animate-ping'}`} />
                  </div>
                  <h3 className="text-sm font-semibold mt-0.5">
                    {sessionState.activeTool.name === 'openWebsite' ? 'Opening Website' :
                     sessionState.activeTool.name === 'getWeather' ? 'Consulting Weather' :
                     'Fetching System Time'}
                  </h3>
                  <p className="text-xs text-slate-300 font-mono mt-0.5 truncate max-w-[240px]">
                    {sessionState.activeTool.args.url || sessionState.activeTool.args.location || 'Current Time'}
                  </p>
                </div>
              </div>
              
              {sessionState.activeTool.name === 'openWebsite' && sessionState.activeTool.status === 'completed' && (
                <a 
                  href={sessionState.activeTool.args.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  <span>Go to site</span>
                  <ExternalLink size={12} />
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 5. TEXT CAPTION / TRANSCRIPTION OVERLAY */}
        <div className="w-full max-w-xl bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-4 shadow-xl relative min-h-[140px]">
          
          <div className="absolute top-3 right-4 flex items-center gap-1.5 opacity-60">
            <Radio size={12} className="text-purple-400 animate-pulse" />
            <span className="text-[9px] font-mono uppercase tracking-wider">Subtitles (Voice-only)</span>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-3">
            {/* User transcript (what the user said) */}
            <div className="text-xs font-medium text-slate-400 flex items-start gap-1.5">
              <span className="font-mono text-[10px] tracking-widest text-slate-500 uppercase mt-0.5">YOU:</span>
              <p className="italic">
                {sessionState.userTranscript || (sessionState.status === 'connected' ? 'आपकी आवाज़ सुन रही हूँ...' : 'बात करने के लिए कनेक्ट करें')}
              </p>
            </div>

            {/* Separator */}
            <div className="border-t border-white/5" />

            {/* Lyraa's transcript (what she said) */}
            <div className="text-sm font-medium text-slate-200 flex items-start gap-1.5">
              <span className="font-mono text-[10px] tracking-widest text-purple-400 uppercase mt-0.5">LYRAA:</span>
              <p className="leading-relaxed">
                {sessionState.modelTranscript || (
                  sessionState.status === 'connected' ? "नमस्ते! मैं यहीं हूँ, बोलिए मुझसे कुछ भी पूछिए!" :
                  sessionState.status === 'connecting' ? 'लायरा से कनेक्ट हो रहा है...' :
                  "बात शुरू करने के लिए \"Start Call\" पर क्लिक करें। कृपया पॉपअप्स को अनुमति दें ताकि मैं आपके कहने पर वेबसाइट्स खोल सकूँ!"
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 6. SUGGESTED THINGS TO SAY / TIPS */}
        {sessionState.status === 'connected' && (
          <div className="w-full max-w-lg flex flex-col gap-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 text-center">Try saying:</div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <span 
                  key={i} 
                  className="text-xs bg-slate-900/60 border border-white/5 rounded-full px-3 py-1.5 text-slate-300 hover:text-white hover:border-purple-500/20 transition-all cursor-default"
                >
                  "{prompt}"
                </span>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* 7. FOOTER BAR WITH GUIDANCE */}
      <footer className="relative w-full max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-slate-500 border-t border-white/5 z-10 bg-slate-950/10">
        <div className="flex items-center gap-1.5">
          <Compass size={12} className="text-purple-400" />
          <span>Tap the central Core Sphere to establish a safe Web Audio stream.</span>
        </div>
        <div className="flex items-center gap-4 mt-2 sm:mt-0">
          <span>Mono PCM @ 16kHz</span>
          <span>•</span>
          <span>Stereo PCM @ 24kHz</span>
        </div>
      </footer>

      {/* 8. GLOBAL FIXED ALERTS (E.G. ERROR DISPLAYS) */}
      <AnimatePresence>
        {sessionState.error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            className="fixed bottom-6 left-6 right-6 sm:left-auto sm:right-6 sm:max-w-md bg-red-950/85 border border-red-500/40 backdrop-blur-md rounded-2xl p-4 shadow-2xl flex items-start gap-3 z-50"
          >
            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-200">Voice Assistant Error</h4>
              <p className="text-xs text-red-300 mt-1 leading-relaxed">
                {sessionState.error}
              </p>
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => setSessionState(prev => ({ ...prev, error: null }))}
                  className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 border border-red-500/30 text-red-200 text-2xl rounded-lg font-mono text-xs transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
