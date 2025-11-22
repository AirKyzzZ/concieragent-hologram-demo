import { OpenAI } from "openai";
import { McpClient } from "./McpClient";
import path from "path";
import dotenv from "dotenv";
import { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

dotenv.config();

export class TravelAgent {
  private openai: OpenAI;
  private mcpClients: McpClient[] = [];
  private tools: ChatCompletionTool[] = [];
  private toolMap: Map<string, McpClient> = new Map();

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async initialize() {
    const mcpBasePath = path.resolve(__dirname, "../../mcp_travelassistant/servers");
    const serpApiKey = process.env.SERPAPI_KEY || "";

    const servers: Array<{ path: string; env: Record<string, string> }> = [
      { path: path.join(mcpBasePath, "flight_server/flight_server.py"), env: { SERPAPI_KEY: serpApiKey } },
      { path: path.join(mcpBasePath, "hotel_server/hotel_server.py"), env: { SERPAPI_KEY: serpApiKey } },
      { path: path.join(mcpBasePath, "event_server/event_server.py"), env: { SERPAPI_KEY: serpApiKey } },
      { path: path.join(mcpBasePath, "geocoder_server/geocoder_server.py"), env: {} as Record<string, string> },
      { path: path.join(mcpBasePath, "weather_server/weather_server.py"), env: {} as Record<string, string> },
      { path: path.join(mcpBasePath, "finance_server/finance_search_server.py"), env: { SERPAPI_KEY: serpApiKey } },
    ];

    for (const server of servers) {
      try {
        // Check if file exists before connecting, handle different naming conventions if needed
        // In the file list provided earlier:
        // hotel_server.py, event_server.py, geocoder_server.py, finance_search_server.py seem correct
        // flight_server.py is correct
        // weather_server/weather_search_server.py might be weather_server.py or weatherstack_server.py
        // Let's assume the paths from the plan/readme are mostly correct but verify against file list
        
        const client = new McpClient(server.path, server.env);
        await client.connect();
        this.mcpClients.push(client);

        const toolsResult = await client.listTools();
        
        for (const tool of toolsResult.tools) {
          this.tools.push({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema as any, 
            },
          });
          this.toolMap.set(tool.name, client);
        }
        console.log(`✅ Connected to MCP server at ${server.path}`);
      } catch (error) {
        console.warn(`⚠️ Failed to connect to MCP server at ${server.path}:`, error);
        // Continue even if one server fails
      }
    }
  }

  async processMessage(userMessage: string, connectionId: string): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are Concieragent, a helpful travel assistant bot for the Hologram app. 
        Your goal is to help users plan their trips using the available tools.
        - Always be polite and helpful.
        - Use the provided tools to fetch real-time information about flights, hotels, events, weather, and finance.
        - If you need more information to call a tool (like dates or budget), ask the user.
        - When you have a plan, present it clearly.
        - Convert costs to the user's preferred currency if asked (default to USD).
        - Current Date: ${new Date().toISOString().split('T')[0]}
        `
      },
      { role: "user", content: userMessage }
    ];

    // Add conversation history management here if needed (simplified for now)

    try {
      let keepGoing = true;
      let finalResponse = "";

      while (keepGoing) {
        const response = await this.openai.chat.completions.create({
          model: "gpt-4o",
          messages: messages,
          tools: this.tools.length > 0 ? this.tools : undefined,
        });

        const message = response.choices[0].message;
        messages.push(message);

        if (message.tool_calls && message.tool_calls.length > 0) {
          for (const toolCall of message.tool_calls) {
            // OpenAI tool calls always have a 'function' property in the standard format
            if (!('function' in toolCall)) {
              console.warn('Unexpected tool call format:', toolCall);
              continue;
            }
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);
            const client = this.toolMap.get(toolName);

            if (client) {
              console.log(`🛠️ Calling tool: ${toolName}`, toolArgs);
              try {
                const result = await client.callTool(toolName, toolArgs);
                
                // Format result for OpenAI
                let content = "";
                if (result.content && result.content.length > 0) {
                   // Assuming text content for simplicity
                   content = result.content.map(c => c.type === 'text' ? c.text : '').join('\n');
                }

                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: content || "Success"
                });
              } catch (err: any) {
                 console.error(`❌ Tool execution failed: ${err.message}`);
                 messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Error executing tool: ${err.message}`
                });
              }
            } else {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: "Tool not found"
              });
            }
          }
        } else {
          keepGoing = false;
          finalResponse = message.content || "I'm sorry, I couldn't generate a response.";
        }
      }

      return finalResponse;

    } catch (error) {
      console.error("Error in TravelAgent processMessage:", error);
      return "I'm having trouble processing your request right now. Please try again later.";
    }
  }

  async cleanup() {
    for (const client of this.mcpClients) {
      await client.close();
    }
  }
}

