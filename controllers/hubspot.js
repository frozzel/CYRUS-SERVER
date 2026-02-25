const axios = require('axios');
const { last } = require('lodash');

const HUBSPOT_API = "https://api.hubapi.com";
const TOKEN = process.env.HUBSPOT_TOKEN;
const OWNER_ID = process.env.HUBSPOT_OWNER_ID;

// Search Contact
const searchContact = async (req, res) => {
  const { email } = req.body;

  try {
    const response = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: email
              }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create Lead
const createLead = async (req, res) => {
  const { email, phone, firstname, lastname, company, service_interest, budget, timeline, notes } = req.body;
  console.log('Creating lead with data:', { email, phone, firstname, lastname, company, service_interest, budget, timeline,  notes });

  try {
    // Step 1: Create the contact with lead status set to "NEW"
    const contactResponse = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/contacts`,
      {
        properties: {
          email,
          phone,
          firstname: firstname,
          lastname: lastname,
          company: company,
          lifecyclestage: "lead",
          hs_lead_status: "NEW",
          service_interest: service_interest,
          budget: budget,
          time_line: timeline
        }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    const contactId = contactResponse.data.id;
    console.log('Contact created with ID:', contactId);

    // Step 2: Add note if provided
    if (notes) {
      // Create the note first
      const noteResponse = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/notes`,
        {
          properties: {
            hs_note_body: notes,
            hs_timestamp: new Date().toISOString()
          }
        },
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      const noteId = noteResponse.data.id;
      console.log('Note created with ID:', noteId);

      // Then associate the note with the contact
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/notes/${noteId}/associations/contacts/${contactId}/202`,
        {},
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      console.log('Note associated with contact');
    }

    res.json({
      ...contactResponse.data,
      message: 'Lead created successfully with status NEW' + (notes ? ' and note added' : '')
    });
  } catch (error) {
    console.log('Error creating lead:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.message });
  }
};

// Create Service Ticket
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const createTicket = async (req, res) => {
  const { contactId, issue, priority } = req.body;

  const normalizedPriority = priority && VALID_PRIORITIES.includes(priority.toString().toUpperCase())
    ? priority.toString().toUpperCase()
    : "HIGH";

  console.log('Creating ticket for contact ID:', contactId, 'with issue:', issue, 'and priority:', normalizedPriority);

  try {
    const response = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/tickets`,
      {
        properties: {
          subject: issue,
          hs_pipeline: "0",
          hs_pipeline_stage: "1", 
          hubspot_owner_id: OWNER_ID, // Optionally assign to an owner
          hs_ticket_priority: normalizedPriority,
          source_type: "CHAT"
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 16
              }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.log('Error creating ticket:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  searchContact,
  createLead,
  createTicket
};