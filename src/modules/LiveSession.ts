import { AudioStreamer } from './AudioStreamer';
import { AudioPlayer } from './AudioPlayer';
import { ToolManager } from './ToolManager';

export type LiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type LiveState = 'disconnected' | 'connecting' | 'listening' | 'speaking';

export interface SessionState {
  status: LiveStatus;
  state: LiveState;
  userVolume: number;
  modelVolume: number;
  userTranscript: string;
  modelTranscript: string;
  error: string | null;
  activeTool: { name: string; args: any; status: 'running' | 'completed'; result?: any } | null;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private streamer: AudioStreamer | null = null;
  private player: AudioPlayer | null = null;
  private onStateChange: (state: SessionState) => void;
  
  private currentState: SessionState = {
    status: 'disconnected',
    state: 'disconnected',
    userVolume: 0,
    modelVolume: 0,
    userTranscript: '',
    modelTranscript: '',
    error: null,
    activeTool: null,
  };

  constructor(onStateChange: (state: SessionState) => void) {
    this.onStateChange = onStateChange;
  }

  private updateState(diff: Partial<SessionState>) {
    this.currentState = { ...this.currentState, ...diff };
    this.onStateChange(this.currentState);
  }

  getState(): SessionState {
    return this.currentState;
  }

  /**
   * Start the session with Lyraa
   */
  async start(voiceName: string = 'Aoede') {
    if (this.currentState.status !== 'disconnected') return;

    this.updateState({
      status: 'connecting',
      state: 'connecting',
      error: null,
      userTranscript: 'Waking up Lyraa...',
      modelTranscript: '',
      activeTool: null,
    });

    try {
      // 1. Initialize Player first so it's ready
      this.player = new AudioPlayer((vol) => {
        this.updateState({ modelVolume: vol });
        
        // If Lyraa is playing audio and speaking volume is active, state is speaking
        if (vol > 1) {
          this.updateState({ state: 'speaking' });
        } else if (this.currentState.state === 'speaking') {
          // If volume goes to zero, revert back to listening
          this.updateState({ state: 'listening' });
        }
      });

      // 2. Initialize and start Audio Streamer (requests mic permission)
      this.streamer = new AudioStreamer(
        (chunk) => {
          // Send audio chunk to backend via WebSocket if we are connected
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'audio', audio: chunk }));
          }
        },
        (vol) => {
          this.updateState({ userVolume: vol });
          
          // User interruption handling: If user speaks loudly while Lyraa is speaking,
          // instantly stop Lyraa's audio queue and put state to listening.
          if (vol > 12) {
            if (this.currentState.state === 'speaking') {
              console.log('[LiveSession] User speech detected - interrupting Lyraa playback');
              this.player?.stop();
              this.updateState({ 
                state: 'listening', 
                modelTranscript: 'Listening to you...' 
              });
            }
          }
        }
      );

      // Start microphone streaming
      await this.streamer.start();

      // 3. Connect WebSocket to Express proxy with the selected voice
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live?voice=${encodeURIComponent(voiceName)}`;
      console.log('[LiveSession] Connecting Live WebSocket to:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[LiveSession] WebSocket connection established');
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          switch (msg.type) {
            case 'status':
              console.log('[LiveSession] Server status update:', msg.status, msg.message);
              this.updateState({
                status: msg.status,
                state: msg.status === 'connected' ? 'listening' : 'connecting',
                userTranscript: msg.status === 'connected' ? 'Connected' : msg.message,
                error: msg.status === 'error' ? msg.message : null
              });
              break;

            case 'audio':
              // Play incoming 24kHz audio block
              if (this.player) {
                this.player.playChunk(msg.audio);
              }
              break;

            case 'interrupted':
              console.log('[LiveSession] Interrupted event received from Gemini');
              if (this.player) {
                this.player.stop();
              }
              this.updateState({ state: 'listening', modelTranscript: '' });
              break;

            case 'userTranscript':
              this.updateState({ userTranscript: msg.text });
              break;

            case 'modelTranscript':
              this.updateState({ modelTranscript: msg.text });
              break;

            case 'toolCall':
              console.log('[LiveSession] Tool call request received:', msg.name, msg.args);
              this.updateState({
                activeTool: { name: msg.name, args: msg.args, status: 'running' }
              });

              // Execute tool and return result
              const toolResult = await ToolManager.execute(msg.name, msg.args, (evt) => {
                // Optional: handle visual indicators for tool actions
              });
              
              this.updateState({
                activeTool: { name: msg.name, args: msg.args, status: 'completed', result: toolResult }
              });

              // Send result back to Gemini Live
              if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                  type: 'toolResponse',
                  id: msg.id,
                  name: msg.name,
                  response: toolResult
                }));
              }
              break;
              
            case 'error':
              console.error('[LiveSession] Server error reported:', msg.message);
              this.updateState({ status: 'error', error: msg.message });
              break;
          }
        } catch (e) {
          console.error('[LiveSession] Error parsing WebSocket message:', e);
        }
      };

      this.ws.onerror = (e) => {
        console.error('[LiveSession] WebSocket connection error:', e);
        this.updateState({ status: 'error', error: 'Connection error. Please try again.' });
      };

      this.ws.onclose = () => {
        console.log('[LiveSession] WebSocket proxy closed');
        this.stop();
      };

    } catch (err: any) {
      console.error('[LiveSession] Failed to start Lyraa Live session:', err);
      this.updateState({
        status: 'error',
        state: 'disconnected',
        error: err.message || 'Microphone access denied or connection failed.'
      });
      this.stop();
    }
  }

  /**
   * Stop the session
   */
  stop() {
    console.log('[LiveSession] Stopping Lyraa Live session...');
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    if (this.streamer) {
      this.streamer.stop();
      this.streamer = null;
    }

    if (this.player) {
      this.player.close();
      this.player = null;
    }

    this.updateState({
      status: 'disconnected',
      state: 'disconnected',
      userVolume: 0,
      modelVolume: 0,
      activeTool: null,
    });
  }
}
