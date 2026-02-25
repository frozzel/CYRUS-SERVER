require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const hubspot = require('../services/hubspot');

const server = new Server(
  { name: 'hubspot-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ── List available tools ────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_contact',
      description: 'Search for a HubSpot contact by email address.',
      inputSchema: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'The email address to search for' }
        },
        required: ['email']
      }
    },
    {
      name: 'create_lead',
      description: 'Create a new lead (contact) in HubSpot with lead status NEW and an optional note.',
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
      description: 'Create a HubSpot service ticket and associate it with an existing contact.',
      inputSchema: {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: 'HubSpot contact ID to associate with the ticket' },
          issue:     { type: 'string', description: 'Subject / description of the issue' },
          priority:  { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], description: 'Ticket priority (defaults to HIGH)' }
        },
        required: ['contactId', 'issue']
      }
    }
  ]
}));

// ── Handle tool calls ────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'search_contact':
        result = await hubspot.searchContact(args.email);
        break;

      case 'create_lead':
        result = await hubspot.createLead(args);
        break;

      case 'create_ticket':
        result = await hubspot.createTicket(args);
        break;

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    return {
      content: [{ type: 'text', text: `Error: ${detail}` }],
      isError: true
    };
  }
});

// ── Start stdio transport ────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('HubSpot MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
