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
const nodemailer = require("nodemailer");

// Simple contact & lead extractor: name, email, phone, projectGoals, budget, timeline
const extractContactFromText = (text) => {
  if (!text || typeof text !== 'string') return {};
  const out = {};
  // email (robust, supports normal and "name at domain dot com" patterns)
  let emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);

  // handle common spoken formats like "name at domain dot com"
  if (!emailMatch) {
    const spokenEmail = text.match(/([A-Za-z0-9._%+-]+)\s+(?:at|@)\s+([A-Za-z0-9.-]+)\s+(?:dot|\.)\s+([A-Za-z]{2,})/i);
    if (spokenEmail) {
      const local = spokenEmail[1];
      const domain = `${spokenEmail[2]}.${spokenEmail[3]}`;
      emailMatch = [`${local}@${domain}`];
    }
  }

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

  if (emailMatch) {
    out.email = (Array.isArray(emailMatch) ? emailMatch[0] : emailMatch[0]).toLowerCase();
  }
  // phone (captures many common formats)
  const phoneMatch = text.match(/(\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/);
  if (phoneMatch) out.phone = phoneMatch[0].replace(/[^0-9+]/g, '');
  // name heuristics: "my name is", "i'm", "i am", "this is"
  const nameMatch = text.match(/(?:my name is|i\'m|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i);
  if (nameMatch) out.name = nameMatch[1].trim();

  // debug log to help diagnose extraction issues
  console.log('extractContactFromText:', { emailMatch: emailMatch && emailMatch[0] });

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
                phone: req.body.phone || undefined,
                
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
            const need = ['name','email','phone','projectGoals','budget','timeline'];
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
          const systemPrompt = { role: 'system', content: 'You are Arwin, the virtual assistant for Cyrus Group, a web development agency. Your job is to answer questions about our services, help users with web projects, and capture leads. Always be professional, knowledgeable, and helpful. If a user seems interested in our services, politely ask for both their name, email, and phone number to connect them with our team. Make sure you repeat there name email and phone number back to them for confirmation.' };

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

        // Also scan the AI reply for any additional contact/lead details
        try {
          if (conv) {
            const foundFromAI = extractContactFromText(reply);
            let changedFromAI = false;
            conv.contact = conv.contact || {};
            if (foundFromAI.name && !conv.contact.name) { conv.contact.name = foundFromAI.name; changedFromAI = true; }
            if (foundFromAI.email && !conv.contact.email) { conv.contact.email = foundFromAI.email; changedFromAI = true; }
            if (foundFromAI.phone && !conv.contact.phone) { conv.contact.phone = foundFromAI.phone; changedFromAI = true; }
            if (foundFromAI.projectGoals && !conv.contact.projectGoals) { conv.contact.projectGoals = foundFromAI.projectGoals; changedFromAI = true; }
            if (foundFromAI.budget && !conv.contact.budget) { conv.contact.budget = foundFromAI.budget; changedFromAI = true; }
            if (foundFromAI.timeline && !conv.contact.timeLine) { conv.contact.timeLine = foundFromAI.timeline; changedFromAI = true; }
            if (changedFromAI) {
              await conv.save();
              console.log('Conversation contact/lead updated from AI reply:', { id: conv.conversationsId, contact: conv.contact });
            }
          }
        } catch (e) {
          console.error('Failed to extract or save contact/lead info from AI reply:', e);
        }

        // If we have enough lead info, trigger conversion flow (email + mark converted)
        try {
          if (conv && conv.contact) {
            const c = conv.contact;
            const hasCoreContact = c.name && c.email && c.phone;
            if (hasCoreContact && !conv.converted) {
              await handleConversationUpdate(conv);
            }
          }
        } catch (e) {
          console.error('Failed to handle conversion/update:', e);
        }

        // Convert reply to speech and return
        try {
          const ttsResult = await textToSpeech(reply, req.body.voice);
          return res.json(ttsResult);
        } catch (err) {
          return res.json({ error: 'TTS conversion failed', details: err.message });
        }

};

// Shared email transporter
const emailTransporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Function to summarize the conversation and send an email
async function summarizeAndSendEmail(messages, contact, conversationsId) {
  const { name, email, phone, projectGoals } = contact || {};

  // Ensure required fields are present: name + email + phone
  if (!name || !email || !phone) {
    console.log("Insufficient data to send email.");
    return;
  }

  // Build a readable conversation transcript from message objects
  const rawTranscript = Array.isArray(messages)
    ? messages
        .map(m => `${m.role === 'ai' ? 'AI' : 'User'}: ${m.text}`)
        .join('\n')
    : String(messages || '');

  // Ask OpenAI to summarize the full conversation for the email body
  let aiSummary = rawTranscript;
  try {
    const summaryMessages = [
      {
        role: 'system',
        content:
          'You are Arwin, the Cyrus Group assistant. Given a transcript of a conversation with a prospective client, write a concise summary (4-8 sentences) focusing on: who they are, their project goals, key requirements, budget/timeline if mentioned, and suggested next steps for the Cyrus team. Use clear, professional language and do not invent details.',
      },
      {
        role: 'user',
        content: `Here is the full conversation transcript. Summarize it for the internal team email:\n\n${rawTranscript}`,
      },
    ];

    const summaryResponse = await axios.post(
      chatGPTApiUrl,
      { model: 'gpt-4o-mini', messages: summaryMessages },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    aiSummary = summaryResponse.data.choices[0].message.content || aiSummary;
  } catch (err) {
    console.error('Failed to summarize conversation for email:', err.response ? err.response.data : err.message);
  }

  const summary = {
    name,
    email,
    phone,
    projectGoals,
    aiSummary,
    conversationsId: conversationsId || 'N/A',
  };

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.NOTIFICATION_EMAIL, // Ensure NOTIFICATION_EMAIL is set in env
      subject: "New Conversation Summary",
      text: `Name: ${summary.name}\nEmail: ${summary.email}\nPhone: ${summary.phone}\nProject Goals: ${summary.projectGoals}\nConversation ID: ${summary.conversationsId}\n\nAI Conversation Summary:\n${summary.aiSummary}`
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log("Email sent: ", info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// Trigger email notification and update conversation when converted
async function handleConversationUpdate(conv) {
  try {
    if (!conv) return;

    // Avoid double-sending if already converted
    if (conv.converted) return;

    // Send email notification with full message history, contact, and conversationsId
    await summarizeAndSendEmail(conv.messages || [], conv.contact || {}, conv.conversationsId);

    // Mark as converted and push expiry out 2 years
    conv.converted = true;
    conv.expiresAt = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
    await conv.save();
  } catch (error) {
    console.error("Error handling conversation update:", error);
  }
}

// Simple endpoint to test email configuration
exports.testEmail = async (req, res) => {
  try {
    const to = process.env.NOTIFICATION_EMAIL || process.env.EMAIL_USER;
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !to) {
      return res.status(400).json({
        error: "Missing email environment variables",
        details: "EMAIL_USER, EMAIL_PASS, and NOTIFICATION_EMAIL (or EMAIL_USER as fallback) must be set",
      });
    }

    const info = await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: "Cyrus Server Test Email",
      text: "This is a test email from the Cyrus avatar server to verify SMTP configuration.",
    });

    console.log("Test email sent:", info.response || info.messageId);
    return res.json({ success: true, messageId: info.messageId, response: info.response });
  } catch (err) {
    console.error("Test email failed:", err);
    return res.status(500).json({ error: "Test email failed", details: err.message });
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
