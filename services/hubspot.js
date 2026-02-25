const axios = require('axios');

const HUBSPOT_API = "https://api.hubapi.com";
const TOKEN = () => process.env.HUBSPOT_TOKEN;
const OWNER_ID = () => process.env.HUBSPOT_OWNER_ID;

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const headers = () => ({
  Authorization: `Bearer ${TOKEN()}`,
  "Content-Type": "application/json"
});

// Search Contact by email
const searchContact = async (email) => {
  const response = await axios.post(
    `${HUBSPOT_API}/crm/v3/objects/contacts/search`,
    {
      filterGroups: [
        {
          filters: [
            { propertyName: "email", operator: "EQ", value: email }
          ]
        }
      ]
    },
    { headers: headers() }
  );
  return response.data;
};

// Create Lead (contact + lead status + optional note)
const createLead = async ({ email, phone, firstname, lastname, company, service_interest, budget, timeline, notes }) => {
  // Step 1: Create contact with NEW lead status
  const contactResponse = await axios.post(
    `${HUBSPOT_API}/crm/v3/objects/contacts`,
    {
      properties: {
        email,
        phone,
        firstname,
        lastname,
        company,
        lifecyclestage: "lead",
        hs_lead_status: "NEW",
        hubspot_owner_id: OWNER_ID(),
        service_interest,
        budget,
        time_line: timeline
      }
    },
    { headers: headers() }
  );

  const contactId = contactResponse.data.id;
  console.log('Contact created with ID:', contactId);

  // Step 2: Create and associate note if provided
  if (notes) {
    const noteResponse = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/notes`,
      {
        properties: {
          hs_note_body: notes,
          hs_timestamp: new Date().toISOString()
        }
      },
      { headers: headers() }
    );

    const noteId = noteResponse.data.id;
    console.log('Note created with ID:', noteId);

    await axios.put(
      `${HUBSPOT_API}/crm/v3/objects/notes/${noteId}/associations/contacts/${contactId}/202`,
      {},
      { headers: headers() }
    );

    console.log('Note associated with contact');
  }

  return {
    ...contactResponse.data,
    message: 'Lead created successfully with status NEW' + (notes ? ' and note added' : '')
  };
};

// Create Service Ticket
const createTicket = async ({ contactId, issue, priority }) => {
  const normalizedPriority = priority && VALID_PRIORITIES.includes(priority.toString().toUpperCase())
    ? priority.toString().toUpperCase()
    : "HIGH";

  console.log('Creating ticket for contact ID:', contactId, 'priority:', normalizedPriority);

  const response = await axios.post(
    `${HUBSPOT_API}/crm/v3/objects/tickets`,
    {
      properties: {
        subject: issue,
        hs_pipeline: "0",
        hs_pipeline_stage: "1",
        hubspot_owner_id: OWNER_ID(),
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
    { headers: headers() }
  );

  return response.data;
};

module.exports = { searchContact, createLead, createTicket, VALID_PRIORITIES };
