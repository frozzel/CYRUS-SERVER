# OpenAI Agent Builder Workflow for Cyrus AI Avatar Server

## Overview

This workflow transforms the Cyrus AI Avatar Server from using OpenAI's Chat Completions API to the more advanced Assistants API, creating a persistent AI agent with conversation memory and structured interactions.

## Key Components

### 1. Assistant Configuration
- **Name**: Arwin - Cyrus Group Assistant
- **Model**: GPT-4o
- **Instructions**: Professional virtual assistant for web development agency with lead capture capabilities
- **Tools**: Currently none (can be extended with custom tools for lead processing)

### 2. Conversation Management
- **Thread-based Conversations**: Each user conversation is mapped to an OpenAI Thread
- **Persistent Memory**: Conversations maintain context across interactions
- **Lead Extraction**: Automatic extraction of contact information from user messages

### 3. Workflow Steps

#### Initialization
1. **Assistant Creation**: On server startup, create or retrieve the Arwin assistant
2. **Thread Management**: For each conversation, create/retrieve an OpenAI Thread

#### Message Processing
1. **User Input**: Receive text message from frontend
2. **Lead Extraction**: Parse contact information (name, email, phone, project details)
3. **Thread Update**: Add user message to the conversation thread
4. **Dynamic Instructions**: Add context about missing lead fields

#### AI Response Generation
1. **Assistant Run**: Execute the assistant on the thread
2. **Wait for Completion**: Poll until response is ready
3. **Response Retrieval**: Get the assistant's reply

#### Post-Processing
1. **Lead Update**: Extract any additional contact info from AI response
2. **Conversion Check**: Trigger lead conversion if all required fields are captured
3. **TTS Conversion**: Generate speech audio using Azure TTS
4. **Response**: Return audio data with blendshapes to frontend

## Agent Capabilities

### Core Personality
- Professional, knowledgeable web development consultant
- Focus on Cyrus Group services and lead generation
- Polite and helpful communication style

### Lead Capture Features
- Automatic extraction of contact information
- Targeted questioning for missing details
- Confirmation of captured information
- Integration with HubSpot CRM

### Conversation Memory
- Maintains context across entire conversation
- References previous interactions
- Builds rapport with users

## Technical Implementation

### Assistant Setup
```javascript
const assistant = await openai.beta.assistants.create({
  name: "Arwin - Cyrus Group Assistant",
  instructions: ASSISTANT_INSTRUCTIONS,
  model: "gpt-4o",
  tools: []
});
```

### Thread Management
```javascript
// Create thread for new conversations
const thread = await openai.beta.threads.create();

// Add messages to thread
await openai.beta.threads.messages.create(thread_id, {
  role: 'user',
  content: userMessage
});
```

### Assistant Execution
```javascript
// Run assistant with additional context
const run = await openai.beta.threads.runs.create(thread_id, {
  assistant_id,
  additional_instructions: contextAboutMissingFields
});
```

## Benefits of Assistants API

1. **Persistent Context**: No need to send conversation history with each request
2. **Structured Interactions**: Better separation of system instructions and conversation
3. **Tool Integration**: Easy to add custom tools for specific tasks
4. **Scalability**: Threads can be managed independently
5. **Cost Efficiency**: Only pay for tokens in actual conversation

## Future Enhancements

### Custom Tools
- Lead validation tool
- CRM integration tool
- Project estimation tool
- Service recommendation tool

### Advanced Features
- File upload and analysis
- Code generation and review
- Multi-modal interactions
- Custom knowledge base integration

## Deployment Considerations

- Assistant creation should be done once and cached
- Thread IDs stored in database for conversation continuity
- Error handling for API rate limits and failures
- Monitoring of assistant performance and conversation quality