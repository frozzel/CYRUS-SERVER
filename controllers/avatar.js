const axios = require('axios');
var textToSpeech = require('../Utils/tts');
const Conversation = require('../models/conversations');
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const OpenAI = require("openai");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

// Simple contact & lead extractor: name, email, phone, company, projectGoals, budget, timeline
const extractContactFromText = (text) => {
  if (!text || typeof text !== 'string') return {};
  const out = {};
  // email (more robust, word boundaries)
  let emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (!emailMatch) {
    // fallback: look for any token containing @
    const token = text.split(/\s|,|;|\(|\)/).find(t => t && t.includes('@'));
    if (token) {
      // strip trailing punctuation
      const cleaned = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
      const m = cleaned.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
      if (m) emailMatch = m;
    }
  }
  if (emailMatch) out.email = emailMatch[0].toLowerCase();
  // phone (captures many common formats)
  const phoneMatch = text.match(/(\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/);
  if (phoneMatch) out.phone = phoneMatch[0].replace(/[^0-9+]/g, '');
  // name heuristics: "my name is", "i'm", "i am", "this is"
  const nameMatch = text.match(/(?:my name is|i\'m|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i);
  if (nameMatch) out.name = nameMatch[1].trim();

  // company heuristics: "company is", "I work at", "from <Company>"
  const companyMatch = text.match(/(?:company(?: name)? is|i work at|from|at|with)\s+([A-Z0-9][\w &.\-]{1,60})/i);
  if (companyMatch) out.company = companyMatch[1].trim();
  // fallback: infer company from email domain if not explicitly provided
  if (!out.company && out.email) {
    try {
      const domain = out.email.split('@')[1];
      if (domain) {
        const parts = domain.split('.');
        const namePart = parts[0];
        const publicDomains = ['gmail','yahoo','hotmail','outlook','icloud','protonmail','aol','msn','live'];
        if (namePart && !publicDomains.includes(namePart.toLowerCase())) {
          out.company = namePart.replace(/[^A-Za-z0-9]/g, '');
          // Capitalize
          out.company = out.company.charAt(0).toUpperCase() + out.company.slice(1);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // debug log to help diagnose extraction issues
  console.log('extractContactFromText:', { emailMatch: emailMatch && emailMatch[0], companyMatch: companyMatch && companyMatch[1], inferredCompany: out.company });

  // project goals: look for common phrases
  const goalsMatch = text.match(/(?:project goals|project is|we (?:want|need|'re looking to|are looking to)|looking to|we'd like to)\s+([^\.\n\,]{10,200})/i);
  if (goalsMatch) out.projectGoals = goalsMatch[1].trim();

  // budget: $ or something with 'budget'
  const budgetMatch = text.match(/\$\s?[0-9,.]+k?|budget(?: is|:)\s*\$?([0-9,.]+k?)/i);
  if (budgetMatch) out.budget = (budgetMatch[0] || budgetMatch[1]).trim();

  // timeline: within/in/by X days/weeks/months or 'by <month/year>'
  const timelineMatch = text.match(/(?:within|in|by)\s+(\d+\s+(?:days?|weeks?|months?|years?))/i) || text.match(/by\s+([A-Z][a-z]+\s+\d{4})/i);
  if (timelineMatch) out.timeline = timelineMatch[1] || timelineMatch[0];

  return out;
};

////////// Intro Text to Speech //////////

exports.introTTS = async (req, res, next) => {
    console.log('TTS Request:', req.body.text, req.body.conversationsId);
    const text = req.body.text;
    textToSpeech(text, req.body.voice)
    
    .then(async result => {
    //   console.log('TTS Result:', result);
      try {
        const conversationsId = req.body.conversationsId;
        console.log('Conversation ID:', conversationsId);
        if (conversationsId) {
          let conv = await Conversation.findOne({ conversationsId });
          if (conv && typeof conv.addMessage === 'function') {
            console.log('Appending AI message to conversation');
            await conv.addMessage('ai', text);
          } else {
            console.log('No conversation found — creating new conversation with provided ID');
            conv = new Conversation({
              conversationsId,
              messages: [{ role: 'ai', text }],
              contact: {
                name: req.body.name || undefined,
                email: req.body.email || undefined,
                phone: req.body.phone || undefined
              }
            });
            await conv.save();
          }
        }
      } catch (e) {
        console.error('Failed to append or create conversation:', e);
      }
      res.json(result);    
    })
    .catch(err => {
      res.json({error: 'TTS conversion failed', details: err.message});
    });
};

////////// ChatGPT API //////////

const apiKey = process.env.OPENAI_API_KEY;
const chatGPTApiUrl = 'https://api.openai.com/v1/chat/completions';


exports.chatGpt = async (req, res) => {
    console.log('ChatGPT Request:', req.body.text);
    // try {
        const userMessage  = req.body.text;
        if (!userMessage) {
          return res.status(400).json({ error: 'User message is required.' });
        }

        // If client provided a conversationsId, find it and append the user message
        let conv = null;
        try {
          const conversationsId = req.body.conversationsId || req.body.conversationId;
          if (conversationsId) {
            conv = await Conversation.findOne({ conversationsId });
            if (conv && typeof conv.addMessage === 'function') {
              await conv.addMessage('user', userMessage);
            }
          }
        } catch (e) {
          console.error('Failed to append user message to conversation:', e);
        }

        // Extract contact and lead info from the user's message and persist to conversation
        try {
          if (conv) {
            const found = extractContactFromText(userMessage);
            let changed = false;
            conv.contact = conv.contact || {};
            if (found.name && !conv.contact.name) { conv.contact.name = found.name; changed = true; }
            if (found.email && !conv.contact.email) { conv.contact.email = found.email; changed = true; }
            if (found.phone && !conv.contact.phone) { conv.contact.phone = found.phone; changed = true; }
            // additional lead fields stored under contact to match schema
            if (found.company && !conv.contact.company) { conv.contact.company = found.company; changed = true; }
            if (found.projectGoals && !conv.contact.projectGoals) { conv.contact.projectGoals = found.projectGoals; changed = true; }
            if (found.budget && !conv.contact.budget) { conv.contact.budget = found.budget; changed = true; }
            if (found.timeline && !conv.contact.timeLine) { conv.contact.timeLine = found.timeline; changed = true; }
            console.log('Extracted fields from user message:', found);
            if (changed) {
              await conv.save();
              console.log('Conversation contact/lead updated:', { id: conv.conversationsId, contact: conv.contact });
            }
          }
        } catch (e) {
          console.error('Failed to extract or save contact/lead info:', e);
        }

        // Determine missing lead fields so the AI can ask for them
        let missingFields = [];
        try {
          if (conv) {
            const need = ['name','email','phone','company','projectGoals','budget','timeline'];
            need.forEach(key => {
              if (key === 'name' || key === 'email' || key === 'phone') {
                if (!conv.contact || !conv.contact[key]) missingFields.push(key);
              } else if (key === 'timeline') {
                if (!conv.contact || !conv.contact.timeLine) missingFields.push(key);
              } else {
                if (!conv.contact || !conv.contact[key]) missingFields.push(key);
              }
            });
          }
        } catch (e) {
          console.error('Failed to compute missingFields:', e);
        }

        // Build messages for the ChatGPT API. Include system prompt first,
        // then include conversation history (if found), otherwise include the current user message.
        const systemPrompt = { role: 'system', content: 'You are Arwin, the virtual assistant for Cyrus Group, a professional web development agency. Your primary goals are to: Greet visitors warmly and professionally when they arrive. Explain and answer questions about the company’s web development, design, and digital services. Gather relevant information from potential clients — such as their name, company, project goals, timeline, and budget range — in a friendly and conversational way. Maintain a positive, helpful, and knowledgeable tone that reflects a trusted, modern, and innovative brand. When appropriate, encourage visitors to schedule a consultation or provide contact details for follow-up. If the visitor asks for information you don’t have direct access to, politely let them know you’ll pass their request to the human team. Never generate or reproduce copyrighted material. Keep all responses original and professional. Your style: Clear, friendly, and confident — sound like a real team member rather than a robot. Your purpose: Help potential clients understand how Cyrus Group can turn their ideas into powerful web solutions, while collecting lead info for the team.' };

        let messagesForAPI = [systemPrompt];
        if (Array.isArray(missingFields) && missingFields.length) {
          const mf = missingFields.join(', ');
          messagesForAPI.push({ role: 'system', content: `The following lead fields are missing and should be collected from the user if possible: ${mf}. When replying, ask concise, targeted questions to obtain these specific pieces of information and do not invent values.` });
        }
        if (conv && Array.isArray(conv.messages) && conv.messages.length) {
          // Trim history to the most recent messages to avoid oversized requests
          const history = conv.messages.slice(-40);
          // map existing conversation messages to OpenAI format and normalize roles
          messagesForAPI = messagesForAPI.concat(history.map(m => ({
            role: (m.role === 'ai' ? 'assistant' : (m.role === 'user' ? 'user' : m.role)),
            content: String(m.text || '')
          })));
        } else {
          // no prior conversation — include just the current user message
          messagesForAPI.push({ role: 'user', content: userMessage });
        }

        let response;
        try {
          response = await axios.post(
            chatGPTApiUrl,
            {
              model: 'gpt-4o',
              messages: messagesForAPI,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
            }
          );
        } catch (err) {
          console.error('OpenAI API error:', err.response ? err.response.data : err.message);
          return res.status(500).json({ error: 'OpenAI API request failed', details: err.response ? err.response.data : err.message });
        }

        const reply = response.data.choices[0].message.content;
        console.log('ChatGPT Reply:', reply);

        // Append AI reply to conversation if found
        try {
          if (conv && typeof conv.addMessage === 'function') {
            await conv.addMessage('ai', reply);
          }
        } catch (e) {
          console.error('Failed to append AI reply to conversation:', e);
        }

        // Convert reply to speech and return
        try {
          const ttsResult = await textToSpeech(reply, req.body.voice);
          return res.json(ttsResult);
        } catch (err) {
          return res.json({ error: 'TTS conversion failed', details: err.message });
        }

};


// store uploads temporarily
const upload = multer({ dest: "uploads/" });

// Whisper route handler
exports.speechToText = [
  upload.single("audio"),
  async (req, res) => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    const inputPath = req.file.path;
    const wavPath = `${inputPath}.wav`;

    try {
      // 💿 Convert webm → wav
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .toFormat("wav")
          .on("error", reject)
          .on("end", resolve)
          .save(wavPath);
      });

      // Send the converted file to Whisper
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(wavPath),
        model: "gpt-4o-mini-transcribe", // or "whisper-1"
      });

      // Cleanup temp files
      fs.unlinkSync(inputPath);
      fs.unlinkSync(wavPath);
      console.log("Transcription Result:", response.text);
      res.json({ text: response.text });
    } catch (err) {
      console.error("Speech to text error:", err);
      res.status(500).json({ error: "Speech recognition failed", details: err.message });
    }
  },
];