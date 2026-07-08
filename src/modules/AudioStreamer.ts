/**
 * AudioStreamer handles microphone capture, downsampling, 
 * PCM16 conversion, and real-time audio level analysis.
 */
export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private onAudioChunk: (base64Chunk: string) => void;
  private onVolumeChange: (volume: number) => void;

  constructor(
    onAudioChunk: (base64Chunk: string) => void,
    onVolumeChange: (volume: number) => void
  ) {
    this.onAudioChunk = onAudioChunk;
    this.onVolumeChange = onVolumeChange;
  }

  /**
   * Request microphone permission and start streaming at 16kHz PCM16.
   */
  async start(): Promise<void> {
    try {
      // 1. Request microphone stream with high-quality settings
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Initialize AudioContext at 16000Hz to automatically downsample
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      // Resume context if suspended (common on mobile and Safari)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // 3. Create nodes
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;

      // 4. Create a ScriptProcessorNode to process audio in chunks of 4096 samples (256ms)
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume for visual feedback
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        // Normalize volume to range [0, 100]
        const volume = Math.min(100, Math.floor(rms * 400));
        this.onVolumeChange(volume);

        // Convert float32 [-1.0, 1.0] to 16-bit PCM array buffer
        const pcmBuffer = this.float32ToPCM16(inputData);
        
        // Convert to Base64 string
        const base64 = this.arrayBufferToBase64(pcmBuffer);
        
        // Send chunk through callback
        this.onAudioChunk(base64);
      };

      // 5. Connect the audio graph
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

    } catch (err) {
      console.error('Error starting AudioStreamer:', err);
      this.stop();
      throw err;
    }
  }

  /**
   * Stop microphone capture and clean up audio nodes.
   */
  stop(): void {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.onVolumeChange(0);
  }

  /**
   * Helper: Converts Float32Array into standard Little-Endian 16-bit signed PCM ArrayBuffer.
   */
  private float32ToPCM16(input: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      let s = Math.max(-1, Math.min(1, input[i]));
      // Convert to 16-bit signed integer
      const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(i * 2, val, true); // true for little-endian
    }
    return buffer;
  }

  /**
   * Helper: Converts an ArrayBuffer to a Base64 string.
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
