const express = require('express');
const axios = require('axios');
const { searchContact, createLead, createTicket } = require('../controllers/hubspot');
const router = express.Router();

const HUBSPOT_API = "https://api.hubapi.com";
const TOKEN = process.env.HUBSPOT_TOKEN;

// Search Contact
router.post("/search-contact", searchContact);

// Create Lead
router.post("/create-lead", createLead);

// Create Service Ticket
router.post("/create-ticket", createTicket);

module.exports = router;