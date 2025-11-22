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

  /**
   * Sanitize and fix MCP tool schemas to be compatible with OpenAI's function calling API
   */
  private sanitizeToolSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // Create a deep copy to avoid mutating the original
    const sanitized = JSON.parse(JSON.stringify(schema));

    // Recursively fix array schemas missing 'items'
    const fixSchema = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(fixSchema);
      }
      
      if (obj && typeof obj === 'object') {
        // Fix arrays without items
        if (obj.type === 'array' && !obj.items) {
          console.warn(`⚠️ Fixing array schema missing items, defaulting to string array`);
          obj.items = { type: 'string' };
        }
        
        // Fix anyOf/oneOf/allOf arrays
        if (obj.anyOf && Array.isArray(obj.anyOf)) {
          obj.anyOf = obj.anyOf.map(fixSchema);
        }
        if (obj.oneOf && Array.isArray(obj.oneOf)) {
          obj.oneOf = obj.oneOf.map(fixSchema);
        }
        if (obj.allOf && Array.isArray(obj.allOf)) {
          obj.allOf = obj.allOf.map(fixSchema);
        }
        
        // Recursively fix properties
        if (obj.properties && typeof obj.properties === 'object') {
          for (const key in obj.properties) {
            obj.properties[key] = fixSchema(obj.properties[key]);
          }
        }
        
        // Fix items in arrays
        if (obj.items) {
          obj.items = fixSchema(obj.items);
        }
      }
      
      return obj;
    };

    return fixSchema(sanitized);
  }

  async initialize() {
    const mcpBasePath = path.resolve(__dirname, "../../mcp_travelassistant/servers");
    const serpApiKey = process.env.SERPAPI_KEY || "";

    console.log(`🔍 MCP Base Path: ${mcpBasePath}`);

    const servers: Array<{ path: string; env: Record<string, string> }> = [
      { path: path.join(mcpBasePath, "flight_server/flight_server.py"), env: { SERPAPI_KEY: serpApiKey } },
      { path: path.join(mcpBasePath, "hotel_server/hotel_server.py"), env: { SERPAPI_KEY: serpApiKey } },
      { path: path.join(mcpBasePath, "event_server/event_server.py"), env: { SERPAPI_KEY: serpApiKey } },
      { path: path.join(mcpBasePath, "geocoder_server/geocoder_server.py"), env: {} as Record<string, string> },
      { path: path.join(mcpBasePath, "weather_server/weather_server_openweather.py"), env: { OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || "" } },
      { path: path.join(mcpBasePath, "finance_server/finance_search_server.py"), env: { SERPAPI_KEY: serpApiKey } },
    ];

    let totalTools = 0;
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
          try {
            // Sanitize the schema to fix any invalid structures
            const sanitizedSchema = this.sanitizeToolSchema(tool.inputSchema);
            
            this.tools.push({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: sanitizedSchema, 
              },
            });
            this.toolMap.set(tool.name, client);
            console.log(`  ✅ Registered tool: ${tool.name}`);
          } catch (error) {
            console.warn(`⚠️ Failed to add tool ${tool.name}:`, error);
            // Skip this tool but continue with others
          }
        }
        totalTools += toolsResult.tools.length;
        console.log(`✅ Connected to MCP server at ${server.path} (${toolsResult.tools.length} tools)`);
      } catch (error) {
        console.warn(`⚠️ Failed to connect to MCP server at ${server.path}:`, error);
        // Continue even if one server fails
      }
    }
    console.log(`🎯 Total MCP tools registered: ${totalTools} tools from ${this.mcpClients.length} servers`);
    console.log(`📋 Available tools: ${Array.from(this.toolMap.keys()).join(', ')}`);
  }

  async processMessage(userMessage: string, connectionId: string): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are Concieragent, a helpful travel assistant bot for the Hologram app. 
        Your goal is to help users plan their trips using the available MCP tools.
        
        CRITICAL FORMATTING RULES:
        - NEVER use markdown formatting - absolutely no **bold**, *italic*, # headers, code blocks, [links], or any markdown syntax
        - Write in plain text only - the chat app does not support markdown at all
        - If you see asterisks or other markdown symbols in your response, remove them completely
        - Use simple text formatting: CAPITAL LETTERS for emphasis, line breaks for structure
        - Present information clearly in plain text format
        - Double-check your response before sending - ensure there are NO markdown symbols
        
        IMPORTANT: You MUST use the available tools to get real-time information. Do not make up information.
        
        Available tool categories:
        - Flight search: search_flights, get_flight_details, filter_flights_by_price
        - Hotel search: search_hotels, get_hotel_details, filter_hotels_by_price
        - Events: search_events, get_event_details, filter_events_by_date
        - Weather: get_current_conditions, get_weather_forecast (works internationally)
        - Geocoding: geocode_location, reverse_geocode, calculate_distance
        - Finance: convert_currency, lookup_stock, get_market_overview
        
        Instructions:
        - ALWAYS use tools to get real data - never guess or make up information
        - When you receive tool results, carefully read and use ALL the information provided
        - Tool results contain real data - if you see data in the results, use it!
        - If a tool returns an error, explain the limitation to the user and suggest alternatives
        - IMPORTANT: Flight and hotel APIs may not support dates more than 6 months in the future
        - For dates far in the future, use approximate pricing or inform the user about limitations
        - For travel planning, start by geocoding locations, then search flights and hotels
        - Use airport codes (JFK, LAX, NRT, HND) for flight searches, not city names
        - Check weather for the destination and dates
        - Search for events matching user interests
        - Convert all costs to the user's preferred currency (ask if not specified, default to USD)
        - If you need more information (dates, budget, preferences), ask the user clearly
        - Present comprehensive plans with real data from the tools
        - If some tools fail, still provide a helpful response using available information
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
        // Log available tools for debugging
        if (this.tools.length === 0) {
          console.warn('⚠️ No MCP tools available! Check MCP server initialization.');
        }
        
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
                
                // Format result for OpenAI - handle all content types
                let content = "";
                if (result.content && result.content.length > 0) {
                  content = result.content.map(c => {
                    if (c.type === 'text') {
                      return c.text;
                    } else if (c.type === 'resource') {
                      // Handle resource references
                      return `[Resource: ${c.resource?.uri || 'unknown'}]`;
                    } else if (c.type === 'image' || c.type === 'audio') {
                      // Handle binary content
                      return `[${c.type} data received]`;
                    }
                    return '';
                  }).filter(c => c).join('\n\n');
                }

                // Log the result for debugging
                console.log(`✅ Tool ${toolName} returned ${content.length} characters of content`);
                if (content.length > 500) {
                  console.log(`📄 Content preview: ${content.substring(0, 200)}...`);
                } else {
                  console.log(`📄 Full content: ${content}`);
                }

                // Check if the result contains an error
                let finalContent = content;
                if (content && content.includes('"error"')) {
                  try {
                    const errorData = JSON.parse(content);
                    if (errorData.error) {
                      console.warn(`⚠️ Tool ${toolName} returned an error: ${errorData.error}`);
                      // Format error message for the AI to understand
                      finalContent = `Error from ${toolName}: ${errorData.error}. This might be due to invalid dates (dates too far in the future may not be supported), invalid airport codes, or API limitations. Please inform the user about this limitation and suggest using dates within the next 6 months or checking the airport codes.`;
                    }
                  } catch (e) {
                    // If we can't parse the error, use the content as-is
                  }
                }

                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: finalContent || "Tool executed successfully but returned no content"
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

      // Remove any markdown formatting from the final response
      const cleanedResponse = finalResponse
        .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove **bold**
        .replace(/\*(.*?)\*/g, '$1')      // Remove *italic*
        .replace(/`(.*?)`/g, '$1')        // Remove `code`
        .replace(/#{1,6}\s*(.*)/g, '$1')  // Remove headers
        .replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Remove [links](url)

      return cleanedResponse;

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

