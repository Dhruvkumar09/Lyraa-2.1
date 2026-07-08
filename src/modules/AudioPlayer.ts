/**
 * AudioPlayer handles queuing and gapless, low-latency playback of 
 * 24kHz PCM16 audio chunks returned by Gemini Live.
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nextStartTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private onVolumeChange: (volume: number) => void;
  private volumeInterval: any = null;

  constructor(onVolumeChange: (volume: number) => void) {
    this.onVolumeChange = onVolumeChange;
  }

  /**
   * Initializes or gets the Web Audio API AudioContext at 24kHz.
   */
  private initContext(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.audioContext.destination);

      // Start periodic voice level updates for Lyraa's speaker visualizer
      this.startAnalyserLoop();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Periodic loop to read the output volume and trigger visual updates.
   */
  private startAnalyserLoop(): void {
    if (this.volumeInterval) clearInterval(this.volumeInterval);
    
    const bufferLength = this.analyser?.frequencyBinCount || 0;
    const dataArray = new Uint8Array(bufferLength);

    this.volumeInterval = setInterval(() => {
      if (!this.analyser || !this.audioContext || this.audioContext.state === 'suspended') {
        this.onVolumeChange(0);
        return;
      }

      this.analyser.getByteTimeDomainData(dataArray);
      
      // Calculate Root Mean Square (RMS) volume of current audio output block
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const value = (dataArray[i] - 128) / 128; // Normalize to [-1, 1]
        sum += value * value;
      }
      const rms = Math.sqrt(sum / bufferLength);
      // Map to 0-100 range
      const volume = Math.min(100, Math.floor(rms * 400));
      
      // If there are no active audio sources, force volume to 0 to prevent background noise reading
      if (this.activeSources.length === 0) {
        this.onVolumeChange(0);
      } else {
        this.onVolumeChange(volume);
      }
    }, 50);
  }

  /**
   * Decodes base64 PCM16 data and schedules it on the playback timeline.
   */
  playChunk(base64Chunk: string): void {
    this.initContext();
    if (!this.audioContext || !this.analyser) return;

    // 1. Convert base64 to Float32Array PCM
    const pcm16Data = this.base64ToArrayBuffer(base64Chunk);
    const float32Data = this.pcm16ToFloat32(pcm16Data);

    // 2. Create audio buffer (1 channel, 24kHz)
    const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    // 3. Create a source node
    const sourceNode = this.audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;

    // Connect source to analyser (which connects to destination)
    sourceNode.connect(this.analyser);

    // 4. Schedule playback using high-precision timeline for gapless streaming
    const now = this.audioContext.currentTime;
    if (this.nextStartTime < now || this.activeSources.length === 0) {
      this.nextStartTime = now + 0.05; // 50ms buffer to smooth network jitter
    }

    sourceNode.start(this.nextStartTime);
    
    // Store active source node for interruption handling
    this.activeSources.push(sourceNode);
    
    // Clean up finished source node references
    sourceNode.onended = () => {
      this.activeSources = this.activeSources.filter(src => src !== sourceNode);
    };

    // Advance the timeline start time by the exact duration of the buffer
    this.nextStartTime += audioBuffer.duration;
  }

  /**
   * Immediately stops all active audio playbacks and empties the playback queue.
   */
  stop(): void {
    console.log('Stopping AudioPlayer queue and active sources...');
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Source might have already ended or not started yet
      }
    });
    this.activeSources = [];
    this.nextStartTime = 0;
    this.onVolumeChange(0);
  }

  /**
   * Clean up all audio nodes and context.
   */
  close(): void {
    this.stop();
    if (this.volumeInterval) {
      clearInterval(this.volumeInterval);
      this.volumeInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
  }

  /**
   * Helper: Converts base64 string to Int16Array (PCM16).
   */
  private base64ToArrayBuffer(base64: string): Int16Array {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  /**
   * Helper: Converts standard 16-bit signed PCM data into Float32Array [-1.0, 1.0].
   */
  private pcm16ToFloat32(pcm16: Int16Array): Float32Array {
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768.0;
    }
    return float32;
  }
}
