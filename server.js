/////////////////////////// import modules ///////////////////////////
const express = require('express');
require('dotenv').config()// import dotenv
require('./config/connections')//   import database connection
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");


/////////////////////////// use middleware ///////////////////////////
const app = express();
// app.use(express.static('public'));
app.use(express.json())// parse json request body
// app.use(cors())// enable cors
app.use(
  cors({
    origin: [
      process.env.CORS_ALLOWED_ORIGINS,  // your front‑end host
      "http://localhost:3000",   // any alternates
      process.env.CORS_ALLOWED_ORIGINS2,
      process.env.CORS_ALLOWED_ORIGINS3
    ],
    methods: ["GET", "POST", "OPTIONS"],
  })
);
app.use(express.static(path.join(__dirname, "public"))); // <-- must exist

/////////////////////////// import routes ///////////////////////////
const avatarRouter = require('./routes/avatar.js');

/////////////////////////// use routes ///////////////////////////
app.use('/api/avatar', avatarRouter);


/////////////////////////// start server ///////////////////////////
const server = require('http').Server(app); // import http
const PORT = process.env.PORT || 8080;

/////////////////////// test server running ///////////////////////
app.get('/', (req, res) => {
    const date = new Date();
    res.send(`<body style="background: #333; display: flex">
        <div style="width: 30%; height: auto"></div>
        <div style="display: flex-column; position: relative; top: 25%; width: 100%; height: 15%; box-shadow: 0 0 3px 2px #cec7c759; padding: 1em; border-radius: 8px;">
        <h1 style="text-align: center; color: white;">🚀  Server Running  🚀</h1> \n 
        <h3 style="text-align: center; color: white">${date.toString().slice(0, 24)}</h3>
        </div><div style="width: 30%; height: auto"></div>
        </body>`
     );
});

server.listen(PORT,  () => {// start express server on port 8080
    console.log(`................................................`)
    console.log(`🚀  Server running on http://localhost:${PORT}, 🚀`)
    console.log(`...............................................`)
    console.log(`...............Starting Database...............`)

    // Schedule nightly cleanup of generated speech audio files at 2am Eastern
    cron.schedule(
      '0 2 * * *',
      async () => {
        try {
          const publicDir = path.join(__dirname, 'public');
          const files = await fs.promises.readdir(publicDir);

          // Filter to speech-*.mp3 files
          const speechFiles = files.filter(f => /^speech-.*\.mp3$/i.test(f));
          if (speechFiles.length <= 1) return; // nothing to clean up

          // Sort by creation time (oldest first)
          const withStats = await Promise.all(
            speechFiles.map(async name => {
              const fullPath = path.join(publicDir, name);
              const stat = await fs.promises.stat(fullPath);
              return { name, fullPath, birthtimeMs: stat.birthtimeMs };
            })
          );

          withStats.sort((a, b) => a.birthtimeMs - b.birthtimeMs);

          // Keep the first (oldest) file, delete the rest
          const toDelete = withStats.slice(1);
          for (const f of toDelete) {
            try {
              await fs.promises.unlink(f.fullPath);
              console.log('Nightly cleanup: deleted', f.name);
            } catch (err) {
              console.error('Nightly cleanup: failed to delete', f.name, err.message);
            }
          }
        } catch (err) {
          console.error('Nightly cleanup job failed:', err.message);
        }
      },
      { timezone: 'America/New_York' }
    );
})
