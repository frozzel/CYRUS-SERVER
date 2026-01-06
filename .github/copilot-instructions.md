# Cyrus AI Avatar Server - AI Agent Instructions

## Architecture Overview

This is a **3D avatar conversation server** that integrates OpenAI GPT-4, Azure Speech Services, and facial animation. The server provides REST endpoints for a React/Three.js frontend to create an animated virtual assistant for Cyrus Group web development agency.

### Core Data Flow
```
Frontend Avatar → /api/avatar/talk → ChatGPT + Azure TTS → Audio + Facial Animation
                → /api/avatar/speech-to-text → Whisper STT → Text Input
```

## Key Technical Patterns

### 1. Speech Integration Architecture
- **Azure TTS with SSML**: Uses `<mstts:viseme type="FacialExpression"/>` to generate synchronized facial animation data
- **Blendshape Animation**: Maps Azure visemes to 52 facial expression controls (see `Utils/blendshapeNames.js`)
- **File Management**: Audio files saved to `public/speech-{randomString}.mp3` for frontend consumption

### 2. AI Conversation Flow
```javascript
// Located in controllers/avatar.js - chatGpt function
userMessage → GPT-4o with Arwin system prompt → textToSpeech(reply) → {blendData, filename}
```

**System Identity**: Arwin is Cyrus Group's virtual assistant - maintain professional, knowledgeable tone focused on web development services and lead capture.

### 3. Multer + FFmpeg Audio Processing
```javascript
// speechToText endpoint pattern
upload.single("audio") → ffmpeg convert webm→wav → Whisper API → cleanup temp files
```

## Development Workflows

### Running the Server
```bash
npm run dev    # Development with nodemon auto-reload
npm start      # Production mode
```

### File Structure Conventions
- **Controllers**: Request handlers in `controllers/` - keep logic thin, delegate to services
- **Routes**: Simple route definitions in `routes/` - import controllers, no business logic
- **Utils**: Shared utilities like TTS, blendshape mapping
- **Public**: Static file serving for generated audio files

### Environment Variables Required
```bash
OPENAI_API_KEY=sk-...           # GPT-4 and Whisper
AZURE_KEY=...                   # Speech Services
AZURE_REGION=eastus             # Speech Services region
PORT=8080                       # Server port
```

## Service Integration Points

### OpenAI Integration
- **Models**: GPT-4o for chat, gpt-4o-mini-transcribe for STT  
- **Response Format**: Always call `textToSpeech(reply, voice)` after GPT response
- **Error Handling**: Return `{error: string, details: string}` format for client

### Azure Speech Services
- **Output Format**: MP3 (format ID: 5)
- **Voice**: Currently hardcoded to "en-US-JennyNeural" 
- **Viseme Data**: Timestamped blend shape arrays at 60fps for facial animation

### File Upload Processing
- **Temporary Storage**: `uploads/` directory for incoming audio
- **Conversion Pipeline**: webm → wav → Whisper → cleanup
- **Cleanup Pattern**: Always `fs.unlinkSync()` temp files in try/catch

## Planned Expansion (From Project Docs)
This server is designed to grow into a full RAG system with:
- Vector database for business content retrieval
- MongoDB for conversation logs and lead capture  
- HubSpot CRM integration for qualified leads
- Web scraping service for content embedding
- Content generation for blog/social publishing

When implementing these features:
1. Add new services to `services/` directory following the pattern in project docs
2. Keep the existing avatar endpoints intact - they're core to the 3D frontend
3. Use the established error response format: `{error: string, details: string}`

## Common Gotchas
- **CORS**: Already configured globally, don't add per-route
- **File Paths**: Use relative paths for public files (`/speech-filename.mp3`)
- **TTS Voice Parameter**: Currently ignored in implementation but passed from frontend
- **Random Filenames**: Use `Math.random().toString(36).slice(2, 7)` pattern for uniqueness