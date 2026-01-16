const express = require('express');
const router = express.Router();

// import controller
const {chatGpt, introTTS, speechToText, testEmail} = require('../controllers/avatar');

////////// routes    //////////

router.post('/talk', chatGpt)
router.post('/talk2', introTTS)
router.post('/speech-to-text', speechToText);
router.get('/test-email', testEmail);



module.exports = router;