const hubspotService = require('../services/hubspot');

// Search Contact
const searchContact = async (req, res) => {
  const { email } = req.body;
  try {
    const data = await hubspotService.searchContact(email);
    res.json(data);
  } catch (error) {
    console.log('Error searching contact:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.message });
  }
};

// Create Lead
const createLead = async (req, res) => {
  const { email, phone, firstname, lastname, company, service_interest, budget, timeline, notes } = req.body;
  console.log('Creating lead with data:', { email, phone, firstname, lastname, company, service_interest, budget, timeline, notes });
  try {
    const data = await hubspotService.createLead({ email, phone, firstname, lastname, company, service_interest, budget, timeline, notes });
    res.json(data);
  } catch (error) {
    console.log('Error creating lead:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.message });
  }
};

// Create Service Ticket
const createTicket = async (req, res) => {
  const { contactId, issue, priority } = req.body;
  try {
    const data = await hubspotService.createTicket({ contactId, issue, priority });
    res.json(data);
  } catch (error) {
    console.log('Error creating ticket:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { searchContact, createLead, createTicket };