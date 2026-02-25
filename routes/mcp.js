const express = require('express');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const hubspot = require('../services/hubspot');

const router = express.Router();

// Build a fresh MCP Server with all tools registered
function buildMcpServer() {
  const server = new Server(
    { name: 'hubspot-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_contact',
        description: 'Search for a HubSpot contact by email address.',
        inputSchema: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Email address to search for' }
          },
          required: ['email']
        }
      },
      {
        name: 'create_lead',
        description: 'Create a new lead in HubSpot with lead status NEW and an optional note.',
        inputSchema: {
          type: 'object',
          properties: {
            email:            { type: 'string',  description: 'Contact email address' },
            phone:            { type: 'string',  description: 'Contact phone number' },
            firstname:        { type: 'string',  description: 'First name' },
            lastname:         { type: 'string',  description: 'Last name' },
            company:          { type: 'string',  description: 'Company name' },
            service_interest: { type: 'string',  description: 'Service the lead is interested in' },
            budget:           { type: 'string',  description: 'Lead budget' },
            timeline:         { type: 'string',  description: 'Project timeline' },
            notes:            { type: 'string',  description: 'Additional notes to attach to the contact' }
          },
          required: ['email', 'firstname', 'lastname']
        }
      },
      {
        name: 'create_ticket',
        description: 'Create a HubSpot service ticket associated with an existing contact.',
        inputSchema: {
          type: 'object',
          properties: {
            contactId: { type: 'string', description: 'HubSpot contact ID' },
            issue:     { type: 'string', description: 'Subject / description of the issue' },
            priority:  { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], description: 'Ticket priority (defaults to HIGH)' }
          },
          required: ['contactId', 'issue']
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      switch (name) {
        case 'search_contact': result = await hubspot.searchContact(args.email); break;
        case 'create_lead':    result = await hubspot.createLead(args); break;
        case 'create_ticket':  result = await hubspot.createTicket(args); break;
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      const detail = error.response ? JSON.stringify(error.response.data) : error.message;
      return { content: [{ type: 'text', text: `Error: ${detail}` }], isError: true };
    }
  });

  return server;
}

// POST /mcp  — stateless: new transport per request (no session required)
router.post('/', async (req, res) => {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET /mcp  — SSE stream (used by some clients for server-sent notifications)
router.get('/', async (req, res) => {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error('MCP SSE error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
