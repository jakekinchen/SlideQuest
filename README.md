# Living Presentation

A real-time audio transcription app powered by Deepgram + Gemini 3 Pro Image. Turn your speech into live text with actual AI-generated images!

## ✨ Features

- 📝 **Dual Input Modes**: Type/paste text OR record audio
- 🎙️ **Real-time Streaming**: See words appear as you speak (recording mode)
- ⚡ **Sub-second Latency**: ~300-500ms transcription delay
- 🖼️ **AI-Generated Images**: Gemini 3 Pro Image (Nano Banana Pro) creates actual images from your content
- 🎯 **High Accuracy**: Powered by Deepgram Nova-2 model
- 🌙 **Dark Mode**: Beautiful UI with dark mode support
- 📱 **Responsive**: Works on desktop and mobile
- 🎨 **1K Resolution**: Professional 1024x1024 images
- 👆 **Manual Control**: Generate images when you want with a button click
- ⚡ **Quick Testing**: Paste text and generate images instantly without recording

## 🚀 Quick Start

### 1. Get API Keys

**Deepgram API Key** (for transcription):
1. Go to [https://console.deepgram.com/](https://console.deepgram.com/)
2. Sign up for a free account (includes $200 in free credits!)
3. Create an API key from the dashboard

**Google AI Studio API Key** (for image generation):
1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy the key
4. Note: Gemini 3 Pro Image is in preview but production-ready

### 2. Set up Environment Variables

Create a `.env.local` file in the root directory:

```bash
DEEPGRAM_API_KEY=your-deepgram-api-key-here
GOOGLE_API_KEY=your-google-ai-api-key-here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start speaking!

## 💰 Pricing

**Deepgram** (Nova-2 model):
- **Pay-as-you-go**: ~$0.0125/minute ($0.75/hour)
- **Free tier**: $200 in credits (enough for ~16,000 minutes of transcription)

**Gemini 3 Pro Image (Nano Banana Pro)**:
- **Token-based pricing**: $30 per 1 million tokens
- **Cost per image**: ~$0.036 per image (1210 tokens for 1K resolution)
- **Free tier**: Generous free tier available

## 🛠️ Tech Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Deepgram SDK** - Real-time audio transcription
- **Google Generative AI** - Actual image generation with Gemini 3 Pro Image (Nano Banana Pro)
- **MediaRecorder API** - Browser audio capture

## 📖 How It Works

### Text Input Mode (Default):
1. Paste or type your content in the text area
2. Click "Generate Visual" button
3. Gemini 3 Pro Image generates a professional 1024x1024 image
4. Image appears on the right
5. Generate multiple images from different content

### Recording Mode:
1. Switch to "Record Audio" tab
2. Click "Start Streaming" → Browser requests microphone permission
3. Audio is captured in 250ms chunks via MediaRecorder API
4. Audio chunks stream directly to Deepgram via WebSocket
5. Transcripts appear in real-time as you speak (left panel)
6. Click "Generate Visual" button to create an AI image from your transcript
7. Gemini 3 Pro Image generates a professional 1024x1024 image (right panel)
8. Generate multiple images during or after your presentation
9. Click "Stop Streaming" when done

## 🎯 Use Cases

- **Live presentations** with auto-generated slide visuals
- **Meeting documentation** with visual summaries
- **Educational content** creation with illustrations
- **Brainstorming sessions** with visual idea boards
- **Content creation** for social media and marketing
- **Pitch decks** with AI-generated imagery

## 📝 License

MIT
