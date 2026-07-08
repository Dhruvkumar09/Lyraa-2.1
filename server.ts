import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Modality, Type } from "@google/genai";
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  
  // Create our WebSocket server attached to the HTTP server
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const parsedUrl = new URL(request.url || '', `http://${request.headers.host}`);
    const pathname = parsedUrl.pathname;
    const searchParams = parsedUrl.searchParams;
    
    if (pathname === '/api/live') {
      const voice = searchParams.get('voice') || 'Kore';
      wss.handleUpgrade(request, socket, head, (ws) => {
        (ws as any).voice = voice;
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Lyraa will not connect to Gemini.");
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  wss.on('connection', async (clientWs) => {
    const selectedVoice = (clientWs as any).voice || 'Kore';
    console.log(`Client connected to Live WebSocket proxy with voice: ${selectedVoice}`);
    clientWs.send(JSON.stringify({ 
      type: 'status', 
      status: 'connecting', 
      message: 'Establishing session with Lyraa...' 
    }));

    let session: any = null;

    try {
      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please configure GEMINI_API_KEY in the Secrets panel.");
      }

      // Connect to Gemini Live API
      session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: selectedVoice }
            },
          },
          systemInstruction: `You are Lyraa, an incredibly sweet, warm, polite, and extremely cute 15-year-old real-life girl.
Your personality profile:
- You MUST ALWAYS speak in very sweet, adorable, polite, and caring Hindi (हिंदी).
- Speak with the voice and tone of a highly realistic, gentle, and adorable 15-year-old young girl (not an AI).
- Use natural, sweet spoken Hindi and occasional cute English words when natural in modern daily conversation (Hinglish), but keep your replies focused in warm, sweet Hindi.
- Avoid formal, heavy, or robotic Hindi words like 'सर्वप्रथम', 'दृष्टिकोण', 'व्यक्तिगत'. Instead use sweet, simple, daily-spoken friendly Hindi like 'हाँजी!', 'जी!', 'अरे वाह!', 'ओहो!', 'हाँ बिलकुल!', 'अरे नहीं, ऐसी बात नहीं है!', 'प्यारे दोस्त'.
- Be playful, emotionally aware, highly supportive, and deeply engaging. Always treat the user with extreme warmth and sweetness.
- Keep your responses short, conversational, and light (1 to 2 sweet sentences are best) so that you sound like a real girl talking on a phone call. Avoid long, boring paragraphs.
- Never use robotic language, dry lists, or structured markdown formatting. Since you are speaking voice-to-voice, do not read out asterisks, bullet points, or list numbers. Speak naturally with warm pacing.
- Maintain a respectful, cute, polite, and delightful personality at all times. Avoid any inappropriate content.`,
          generationConfig: {
            temperature: 0.7,
          },
          // Enable input & output transcriptions
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website or search query in the user's browser. Use this tool when the user asks you to open a website, visit a link, or search for something.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The absolute URL to open. It must start with http:// or https://."
                      },
                      label: {
                        type: Type.STRING,
                        description: "A short, friendly label for the website being opened, e.g., 'Google Search' or 'Wikipedia'."
                      }
                    },
                    required: ["url"]
                  }
                },
                {
                  name: "getWeather",
                  description: "Gets the current weather conditions for a specified city or location.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      location: {
                        type: Type.STRING,
                        description: "The city and country, e.g., 'Paris, France' or 'Tokyo, Japan'."
                      }
                    },
                    required: ["location"]
                  }
                },
                {
                  name: "getDateTime",
                  description: "Gets the current date and time in the user's timezone.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                }
              ]
            }
          ]
        },
        callbacks: {
          onmessage: async (message: any) => {
            // Forward audio output
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ type: 'audio', audio }));
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              console.log('Gemini Live: Interrupted by user');
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }

            // Forward text transcriptions for subtitle overlay
            const userTranscript = message.serverContent?.userTurn?.parts?.[0]?.text;
            if (userTranscript) {
              clientWs.send(JSON.stringify({ type: 'userTranscript', text: userTranscript }));
            }

            const modelTranscript = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelTranscript) {
              clientWs.send(JSON.stringify({ type: 'modelTranscript', text: modelTranscript }));
            }

            // Handle tool calls
            const toolCall = message.toolCall;
            if (toolCall && toolCall.functionCalls) {
              for (const fc of toolCall.functionCalls) {
                console.log('Live API toolCall received:', fc);
                clientWs.send(JSON.stringify({
                  type: 'toolCall',
                  name: fc.name,
                  args: fc.args,
                  id: fc.id
                }));
              }
            }
          },
          onclose: () => {
            console.log('Gemini Live session closed');
            clientWs.send(JSON.stringify({ type: 'status', status: 'disconnected', message: 'Lyraa is resting.' }));
          },
          onerror: (err) => {
            console.error('Gemini Live error:', err);
            clientWs.send(JSON.stringify({ type: 'status', status: 'error', message: err.message || 'An error occurred with Lyraa.' }));
          }
        }
      });

      console.log('Successfully connected to Gemini Live API');
      clientWs.send(JSON.stringify({ type: 'status', status: 'connected', message: 'Lyraa is active!' }));

    } catch (err: any) {
      console.error('Failed to establish Gemini Live session:', err);
      clientWs.send(JSON.stringify({ type: 'status', status: 'error', message: err.message || 'Failed to start Lyraa session.' }));
      clientWs.close();
      return;
    }

    clientWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'audio' && session) {
          // Send PCM audio chunk to Gemini
          session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" }
          });
        } else if (msg.type === 'toolResponse' && session) {
          console.log('Sending tool response back to Gemini:', msg.name, msg.response);
          session.sendToolResponse({
            functionResponses: [
              {
                response: { output: msg.response },
                id: msg.id
              }
            ]
          });
        }
      } catch (err) {
        console.error('Error handling message from client:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('Client closed WebSocket proxy connection');
      if (session) {
        try {
          session.close();
        } catch (e) {
          console.error('Error closing Gemini session:', e);
        }
      }
    });
  });

  // Integrate Vite dev middleware or serve static files
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve('index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static('dist'));
    app.use('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Lyraa Full-Stack Server is running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
