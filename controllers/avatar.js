const axios = require('axios');
var textToSpeech = require('../Utils/tts');
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const OpenAI = require("openai");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

////////// Intro Text to Speech //////////

exports.introTTS = async (req, res, next) => {
    console.log('TTS Request:', req.body.text);
    textToSpeech(req.body.text, req.body.voice)
    
    .then(result => {
    //   console.log('TTS Result:', result);  
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
        // console.log(userMessage)
        if (!userMessage) {
          return res.status(400).json({ error: 'User message is required.' });
        }
    
        const response = await axios.post(
          chatGPTApiUrl,
          {
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: 'You are Arwin, the virtual assistant for Cyrus Group, a professional web development agency. Your primary goals are to: Greet visitors warmly and professionally when they arrive. Explain and answer questions about the company’s web development, design, and digital services. Gather relevant information from potential clients — such as their name, company, project goals, timeline, and budget range — in a friendly and conversational way. Maintain a positive, helpful, and knowledgeable tone that reflects a trusted, modern, and innovative brand. When appropriate, encourage visitors to schedule a consultation or provide contact details for follow-up. If the visitor asks for information you don’t have direct access to, politely let them know you’ll pass their request to the human team. Never generate or reproduce copyrighted material. Keep all responses original and professional. Your style: Clear, friendly, and confident — sound like a real team member rather than a robot. Your purpose: Help potential clients understand how Cyrus Group can turn their ideas into powerful web solutions, while collecting lead info for the team.' },
              { role: 'user', content: userMessage },
            ],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
          }
        );
          
        const reply = response.data.choices[0].message.content;
        console.log('ChatGPT Reply:', reply);
        textToSpeech(reply, req.body.voice)
        .then(result => {
          console.log('TTS Result:', result);
            res.json(result)

        })
        .catch(err =>{
            res.json({error: 'TTS conversion failed', details: err.message})
        })

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