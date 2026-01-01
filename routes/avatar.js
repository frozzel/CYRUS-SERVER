const express = require('express');
const router = express.Router();

// import controller
const {chatGpt} = require('../controllers/avatar');
const { introTTS } = require('../controllers/avatar');

////////// routes    //////////

router.post('/talk', chatGpt)
router.post('/talk2', introTTS)



module.exports = router;