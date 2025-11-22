<div align="center">

![Concieragent Logo](./logo.png)

# 🌍 Concieragent

**An AI-Powered Travel Planning Assistant for Hologram**

*Orchestrating complex travel planning through Model Context Protocol (MCP) and OpenAI GPT-4o*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?logo=python)](https://www.python.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)
[![Hologram](https://img.shields.io/badge/Hologram-VS%20Agent-teal.svg)](https://hologram.zone/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai)](https://openai.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Features](#-features) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Usage Examples](#-real-world-usage-examples) • [Developer Guide](#-developer-guide)

</div>

---

## 🎯 What is Concieragent?

**Concieragent** is a sophisticated AI travel planning assistant that runs on the Hologram platform. It combines the power of **OpenAI's GPT-4o** with **six specialized MCP (Model Context Protocol) servers** to provide comprehensive travel planning capabilities. Users can interact with Concieragent through the Hologram mobile app to plan complete vacations with real-time data on flights, hotels, events, weather, and financial information.

### Why It's Powerful

Unlike simple chatbots, Concieragent:
- **Orchestrates multiple specialized services** simultaneously
- **Makes intelligent decisions** about which tools to use and when
- **Synthesizes complex data** from 6 different domains into coherent travel plans
- **Handles real-time data** including flight prices, weather forecasts, and currency exchange rates
- **Operates on a decentralized platform** (Hologram) with end-to-end encryption

---

## ✨ Features

### 🛫 Multi-Domain Travel Planning
- **Flight Search** - Find and compare flights with real-time pricing
- **Hotel Discovery** - Search accommodations with filters for budget and amenities
- **Event Discovery** - Find local events, festivals, and activities
- **Weather Intelligence** - Get forecasts and plan activities around weather
- **Geocoding Services** - Convert locations, calculate distances, plan routes
- **Financial Analysis** - Currency conversion, budget tracking, cost analysis

### 🤖 AI Orchestration
- **GPT-4o Powered** - Advanced reasoning and natural language understanding
- **Tool Selection** - Intelligently chooses which MCP tools to use
- **Multi-Step Planning** - Handles complex, multi-part travel requests
- **Context Awareness** - Maintains conversation context across tool calls
- **Error Recovery** - Gracefully handles API failures and retries

### 🔒 Hologram Integration
- **Verifiable Service** - Runs on Hologram's decentralized platform
- **End-to-End Encryption** - Secure DIDComm connections
- **Mobile-First** - Native iOS/Android app experience
- **Privacy-Focused** - User data stays private

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Hologram Mobile App                       │
│                    (iPhone/Android)                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ DIDComm (Encrypted)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              VS Agent (Docker Container)                      │
│         - DIDComm Protocol Handler                           │
│         - Connection Management                              │
│         - Webhook Events                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP Webhooks
                       │
┌──────────────────────▼──────────────────────────────────────┐
│            Concieragent Bot Server (Node.js)                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         TravelAgent (OpenAI GPT-4o Orchestrator)        │ │
│  │  - Message Processing                                   │ │
│  │  - Tool Selection & Execution                           │ │
│  │  - Response Generation                                  │ │
│  └──────────────┬─────────────────────────────────────────┘ │
│                 │ MCP Protocol (Stdio)                       │
│                 │                                            │
│  ┌──────────────▼─────────────────────────────────────────┐ │
│  │              McpClient (MCP SDK)                        │ │
│  │  - Spawns Python subprocesses                           │ │
│  │  - Manages MCP connections                             │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼──────┐ ┌────▼──────┐
│ Flight MCP   │ │ Hotel MCP │ │ Event MCP │
│ Server       │ │ Server    │ │ Server    │
└──────────────┘ └───────────┘ └───────────┘
        │              │              │
┌───────▼──────┐ ┌────▼──────┐ ┌────▼──────┐
│ Geocoder MCP │ │ Weather   │ │ Finance   │
│ Server       │ │ MCP Server│ │ MCP Server│
└──────────────┘ └───────────┘ └───────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Hologram Mobile App | User interface, encrypted messaging |
| **Protocol** | DIDComm | Decentralized identity & encrypted communication |
| **Orchestration** | VS Agent (Docker) | Hologram protocol handler |
| **Bot Server** | Node.js + TypeScript | Main application logic |
| **AI Engine** | OpenAI GPT-4o | Natural language understanding & tool orchestration |
| **MCP Client** | @modelcontextprotocol/sdk | Protocol client for MCP servers |
| **MCP Servers** | Python 3.8+ (6 servers) | Specialized travel planning tools |
| **Package Manager** | UV | Fast Python dependency management |

---

## 🚀 Quick Start

### Prerequisites

- **Docker** - For running VS Agent
- **Node.js 18+** - For the bot server
- **Python 3.8+** - For MCP servers
- **UV** - Python package manager ([Install UV](https://docs.astral.sh/uv/))
- **ngrok** - For exposing local server ([Get ngrok](https://ngrok.com/))
- **Hologram App** - Install on your mobile device ([Download](https://hologram.zone))
- **API Keys**:
  - OpenAI API Key ([Get here](https://platform.openai.com/api-keys))
  - SerpAPI Key ([Get here](https://serpapi.com/))

### Installation

1. **Clone and Install Dependencies**

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies for all MCP servers
cd mcp_travelassistant/servers/flight_server && uv sync && cd ../..
cd mcp_travelassistant/servers/hotel_server && uv sync && cd ../..
cd mcp_travelassistant/servers/event_server && uv sync && cd ../..
cd mcp_travelassistant/servers/geocoder_server && uv sync && cd ../..
cd mcp_travelassistant/servers/weather_server && uv sync && cd ../..
cd mcp_travelassistant/servers/finance_server && uv sync && cd ../..
```

2. **Configure Environment Variables**

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your API keys
# OPENAI_API_KEY=sk-your-actual-key-here
# SERPAPI_KEY=your-serpapi-key-here
```

3. **Start ngrok** (Terminal 1)

```bash
ngrok http 3001
# Copy the URL (e.g., abc123.ngrok-free.app)
```

4. **Start Bot Server** (Terminal 2)

```bash
npm start
# Wait for "✅ Travel Agent ready!" message
```

5. **Start VS Agent** (Terminal 3)

```bash
./docker-run.sh <your-ngrok-url>
# Example: ./docker-run.sh abc123.ngrok-free.app
```

6. **Connect with Hologram App**

- Open `http://localhost:3001/invitation` in your browser
- Scan the QR code with the Hologram app
- Accept the connection invitation

7. **Start Planning!**

Send a message like: *"Plan a weekend trip to Paris for under $2000"*

---

## 💬 Real-World Usage Examples

### Example 1: Complete Vacation Planning

**User:** *"I want to plan a trip to Banff and Jasper in Alberta from Reston, Virginia during June 7-14, 2025. Find flights, hotels, and events. We like hiking, sightseeing, dining, and museums. Budget is $5000 USD."*

**Concieragent's Process:**
1. 🗺️ **Geocodes** locations (Reston, VA → Banff, AB → Jasper, AB)
2. ✈️ **Searches flights** from IAD to Calgary for June 7-14
3. 🏨 **Finds hotels** in Banff and Jasper matching budget and preferences
4. 🌤️ **Checks weather** forecasts for outdoor activity planning
5. 🎭 **Discovers events** and activities matching interests
6. 💰 **Converts costs** from CAD to USD
7. 📊 **Synthesizes** everything into a day-by-day itinerary

**Response:** A comprehensive plan with flight options, hotel recommendations, weather-appropriate activity scheduling, event suggestions, and complete budget breakdown in USD.

### Example 2: Quick Weekend Getaway

**User:** *"Plan a weekend trip from San Francisco to Portland, Oregon. We want breweries, food trucks, and outdoor markets. Budget $1500 for 2 people."*

**Concieragent:**
- Finds flights leaving Friday evening, returning Sunday night
- Searches hotels near Portland's food truck areas
- Discovers brewery tours and outdoor markets
- Checks weather for outdoor activities
- Provides budget breakdown with currency conversion if needed

### Example 3: International Business Travel

**User:** *"I need to travel from New York to Tokyo June 20-25, 2025. Business class flights, luxury hotels near Tokyo Station, check weather, convert costs to USD, find networking events for tech professionals."*

**Concieragent:**
- Searches business class flights
- Finds luxury hotels near Tokyo Station
- Gets weather forecasts for appropriate clothing
- Converts all costs to USD
- Discovers tech networking events during the week

---

## 🛠️ Developer Guide

### Project Structure

```
concieragent/
├── src/
│   ├── bot.ts                 # Express server, webhook handler
│   └── agent/
│       ├── McpClient.ts       # MCP protocol client implementation
│       └── TravelAgent.ts    # OpenAI orchestration logic
├── mcp_travelassistant/
│   └── servers/
│       ├── flight_server/     # Flight search MCP server
│       ├── hotel_server/      # Hotel search MCP server
│       ├── event_server/      # Event discovery MCP server
│       ├── geocoder_server/   # Geocoding MCP server
│       ├── weather_server/    # Weather MCP server
│       └── finance_server/    # Finance/currency MCP server
├── docker-run.sh             # VS Agent startup script
├── .env.example              # Environment variables template
├── package.json              # Node.js dependencies
└── tsconfig.json             # TypeScript configuration
```

### How MCP Integration Works

**Model Context Protocol (MCP)** is a protocol for AI assistants to securely access external data sources and tools. Here's how Concieragent uses it:

1. **MCP Client Initialization** (`McpClient.ts`)
   - Spawns Python subprocesses for each MCP server using `uv run`
   - Establishes stdio-based communication channels
   - Manages connection lifecycle

2. **Tool Discovery** (`TravelAgent.ts`)
   - Each MCP server exposes tools via `listTools()`
   - Tools are aggregated and formatted for OpenAI's function calling API
   - Tool-to-server mapping is maintained for routing

3. **Orchestration Flow**
   ```
   User Message → GPT-4o → Tool Selection → MCP Client → Python Server → API Call → Result → GPT-4o → Response
   ```

4. **Multi-Tool Execution**
   - GPT-4o can call multiple tools in parallel when dependencies allow
   - Sequential execution when tools depend on previous results
   - Error handling and retry logic for failed tool calls

### Key Developer Challenges

#### 1. **MCP Protocol Implementation**

**Challenge:** Implementing a robust MCP client that can spawn and manage multiple Python subprocesses.

**Solution:**
- Used `@modelcontextprotocol/sdk` for protocol handling
- Implemented `StdioClientTransport` for subprocess communication
- Added connection pooling and error recovery

**Code Snippet:**
```typescript
const transport = new StdioClientTransport({
  command: "uv",
  args: ["run", "python", path.basename(serverPath)],
  env: { ...process.env, ...env },
  cwd: path.dirname(serverPath)
});
```

#### 2. **Tool Orchestration Complexity**

**Challenge:** GPT-4o needs to understand which tools to use, when to use them, and how to combine results.

**Solution:**
- Comprehensive system prompts explaining tool capabilities
- Tool descriptions include examples and use cases
- Multi-turn conversation handling for complex requests

**Example:**
```typescript
const systemPrompt = `You are Concieragent, a helpful travel assistant...
- Use geocoding before weather searches (need coordinates)
- Search flights before hotels (destination confirmation)
- Convert currencies for budget analysis
- Current Date: ${new Date().toISOString().split('T')[0]}`;
```

#### 3. **Error Handling & Resilience**

**Challenge:** MCP servers can fail, APIs can be rate-limited, or network issues can occur.

**Solution:**
- Graceful degradation (continue with available tools)
- Comprehensive error logging
- User-friendly error messages
- Retry logic for transient failures

#### 4. **Environment Management**

**Challenge:** Managing API keys and environment variables across Node.js and Python processes.

**Solution:**
- Centralized `.env` file with `dotenv`
- Environment variable passthrough to Python subprocesses
- `.env.example` template for easy setup

#### 5. **Type Safety Across Languages**

**Challenge:** Maintaining type safety between TypeScript and Python MCP servers.

**Solution:**
- Zod schemas for runtime validation
- TypeScript interfaces matching MCP tool schemas
- JSON schema validation for tool parameters

### Extending Concieragent

#### Adding a New MCP Server

1. **Add Server to TravelAgent.ts:**
```typescript
const servers = [
  // ... existing servers
  { 
    path: path.join(mcpBasePath, "new_server/new_server.py"), 
    env: { API_KEY: process.env.NEW_API_KEY } 
  },
];
```

2. **Update Environment Variables:**
```bash
# .env.example
NEW_API_KEY=your-api-key-here
```

3. **Install Dependencies:**
```bash
cd mcp_travelassistant/servers/new_server && uv sync
```

#### Customizing AI Behavior

Edit the system prompt in `src/agent/TravelAgent.ts`:

```typescript
content: `You are Concieragent, a helpful travel assistant...
  // Add your custom instructions here
`
```

#### Adding Conversation Memory

Currently, each message is processed independently. To add memory:

```typescript
// In TravelAgent.ts
private conversationHistory: Map<string, ChatCompletionMessageParam[]> = new Map();

async processMessage(userMessage: string, connectionId: string): Promise<string> {
  const history = this.conversationHistory.get(connectionId) || [];
  // Use history in messages array
  // Update history after processing
}
```

---

## 🔍 Troubleshooting

### Bot Not Responding

1. **Check Bot Server Logs**
   ```bash
   # Look for MCP connection errors
   npm start
   ```

2. **Verify MCP Servers**
   ```bash
   # Test a server directly
   cd mcp_travelassistant/servers/flight_server
   uv run python flight_server.py
   ```

3. **Check API Keys**
   ```bash
   # Verify .env file exists and has valid keys
   cat .env
   ```

### MCP Connection Failures

**Error:** `⚠️ Failed to connect to MCP server`

**Solutions:**
- Verify Python dependencies: `cd mcp_travelassistant/servers/<server> && uv sync`
- Check file paths in `TravelAgent.ts`
- Verify environment variables are passed correctly
- Check Python version: `python3 --version` (needs 3.8+)

### VS Agent Issues

**Error:** `Failed to start VS Agent`

**Solutions:**
```bash
# Check Docker is running
docker ps

# Check ports aren't in use
lsof -i :3000
lsof -i :3001

# Restart VS Agent
docker stop vs-agent && docker rm vs-agent
./docker-run.sh <your-ngrok-url>
```

### OpenAI API Errors

**Error:** `Error in TravelAgent processMessage`

**Solutions:**
- Verify `OPENAI_API_KEY` in `.env`
- Check API quota/billing
- Review rate limits
- Check network connectivity

---

## 📊 Performance Considerations

### API Rate Limits

- **SerpAPI**: 250 searches/month (free tier)
- **OpenAI**: Varies by tier / model and credits (check your plan)
- **Weather APIs**: Free

### Optimization Tips

1. **Cache Results**: Implement caching for frequently requested data
2. **Parallel Tool Calls**: GPT-4o can call multiple tools simultaneously
3. **Smart Tool Selection**: System prompt guides GPT-4o to use tools efficiently
4. **Connection Pooling**: MCP clients are reused across requests

---

## 🤝 Contributing

Contributions are welcome! Areas for improvement:

- [ ] Add conversation memory/history
- [ ] Implement result caching
- [ ] Add more MCP servers (car rentals, restaurant reservations)
- [ ] Improve error messages
- [ ] Add unit tests
- [ ] Performance optimizations
- [ ] Multi-language support

---

## 📚 Resources

- [Hologram Documentation](https://hologram.zone)
- [VS Agent GitHub](https://github.com/2060-io/vs-agent)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Hologram** - For the amazing decentralized messaging platform
- **2060 OÜ** - For VS Agent and Hologram infrastructure
- **Anthropic** - For MCP protocol specification
- **OpenAI** - For GPT-4o and function calling capabilities
- **MCP Travel Assistant** - For the comprehensive MCP server ecosystem

---

<div align="center">

**Built with ❤️ for the Hologram ecosystem**

[Report Bug](https://github.com/airkyzzz/concieragent-hologram-demo/issues) • [Request Feature](https://github.com/airkyzzz/concieragent-hologram-demo/issues) • [Documentation](./docs)

</div>
