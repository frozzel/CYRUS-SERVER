# Cyrus AI Avatar RAG Server

## 🧩 Step 1: Clarify Backend Goals
Before designing, let’s confirm the backend’s core responsibilities:

Conversational AI (RAG)

Accept user queries from the frontend.
Retrieve relevant business content (scraped + embedded).
Generate contextual responses using OpenAI.
Return both text and optional TTS audio URLs.
Speech Services

Convert text responses to speech (Azure Speech or OpenAI TTS).
Optionally handle speech‑to‑text input.
Web Scraping + Embedding

Crawl the business website (respecting robots.txt).
Extract text, chunk, embed, and store in vector DB.
Lead Capture + HubSpot Integration

Store leads in MongoDB.
Push qualified leads to HubSpot CRM.
Content Generation + Publishing

Publish to HubSpot or social APIs.
Admin / Monitoring

Provide endpoints for logs, metrics, and configuration.

## 🏗️ Step 2: Proposed Server Architecture
High‑Level Modules

```bash
/server
├── src
│   ├── app.js
│   ├── routes
│   ├── controllers
│   ├── services
│   │   ├── chatService.js
│   │   ├── ragService.js
│   │   ├── speechService.js
│   │   ├── scraperService.js
│   │   ├── leadService.js
│   │   ├── hubspotService.js
│   │   └── contentService.js
│   ├── models
│   ├── db
│   ├── utils
│   └── config
├── package.json
└── Dockerfile
```
 
## ⚙️ Step 3: Service Responsibilities & Data Flow
1. Chat + RAG Service
Flow:

Frontend → /api/chat → chatController → chatService
   ↳ ragService.retrieveContext(query)
   ↳ OpenAI.generateResponse(context + query)
   ↳ speechService.textToSpeech(response)
   ↳ MongoDB.saveConversation()
   → Return { text, audioUrl, metadata }
Dependencies:

OpenAI API (LLM + embeddings)
Vector DB (Pinecone / Weaviate / Mongo Atlas Vector)
Azure Speech or OpenAI TTS

2. Scraper + Embedding Service
Flow:

Admin triggers /api/scrape
 → scraperService.fetchPages()
 → textChunker.split()
 → ragService.embedAndStore(chunks)
 → MongoDB.saveScrapeMetadata()
Dependencies:

Cheerio / Playwright / Puppeteer for scraping
OpenAI Embeddings API
Vector DB for storage

3. Lead + HubSpot Service
Flow:

Frontend → /api/leads → leadController
   ↳ leadService.validateLead()
   ↳ leadService.qualifyLeadWithAI()
   ↳ hubspotService.pushLead()
   ↳ MongoDB.saveLead()
Dependencies:

HubSpot CRM API
OpenAI for lead qualification

4. Content Generation Service
Flow:

Admin → /api/content/generate
   ↳ contentService.generateText(OpenAI)
   ↳ contentService.generateImage(DALL‑E)
   ↳ hubspotService.publishBlog()
   ↳ MongoDB.saveContent()
Dependencies:

OpenAI (ChatGPT + DALL‑E)
HubSpot API
Social Media APIs (optional)

5. Database Layer
Store	Purpose
MongoDB	Users, leads, conversations, scrape metadata, content logs
Vector DB	Embedded text chunks for RAG retrieval

## 🔐 Step 4: Security & Configuration
Secrets: .env → API keys for OpenAI, Azure, HubSpot, etc.
Auth: JWT for admin endpoints; CORS for frontend.
Rate limiting: Express middleware (e.g., express-rate-limit).
HTTPS: Enforced via reverse proxy (NGINX / Cloudflare).
Data validation: Joi / Zod schemas for all inputs.

## 🧪 Step 5: Development Phases (Server‑Only)
Phase	Deliverable
1. Scaffolding	Express app, routes, error handlers, Mongo connection
2. Chat + RAG Core	/api/chat endpoint, OpenAI + Vector DB integration
3. Speech Service	TTS integration, audio streaming
4. Scraper Pipeline	Crawl → chunk → embed → store
5. Lead Service	/api/leads, HubSpot integration
6. Content Service	/api/content, DALL‑E + HubSpot publishing
7. Testing & Security	Unit tests, env validation, rate limits
8. Deployment	Docker + CI/CD pipeline

## ⚠️ Step 6: Risks & Mitigations
Risk	Mitigation
API costs (OpenAI/Azure)	Implement caching + rate limits
Scraping restrictions	Respect robots.txt + throttling
HubSpot API limits	Queue requests + retry logic
Vector DB scaling	Use managed service (Pinecone / Atlas Vector)
Audio latency	Pre‑generate TTS or stream chunks
Data privacy	Encrypt PII in MongoDB
