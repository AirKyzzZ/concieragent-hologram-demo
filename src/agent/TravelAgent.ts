import { OpenAI } from "openai";
import { McpClient } from "./McpClient";
import path from "path";
import dotenv from "dotenv";
import { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

dotenv.config();

// Conversation context storage per connection
interface ConversationContext {
  messages: ChatCompletionMessageParam[];
  extractedInfo: ExtractedUserInfo;
  lastUpdated: number;
}

// Information extracted from the conversation
interface ExtractedUserInfo {
  name?: string;
  currentLocation?: string;
  destinations?: string[];
  travelDates?: { start?: string; end?: string };
  budget?: { amount?: number; currency?: string };
  preferences?: string[];
  partySize?: number;
  interests?: string[];
  recentSearches?: string[];
}

export class TravelAgent {
  private openai: OpenAI;
  private mcpClients: McpClient[] = [];
  private tools: ChatCompletionTool[] = [];
  private toolMap: Map<string, McpClient> = new Map();
  // Store conversation history per connection
  private conversationContexts: Map<string, ConversationContext> = new Map();
  // Maximum messages to keep in history
  private readonly MAX_HISTORY_MESSAGES = 20;
  // Context expiration time (1 hour)
  private readonly CONTEXT_EXPIRATION_MS = 60 * 60 * 1000;
  // Token limits for context management
  private readonly MAX_TOOL_RESULT_CHARS = 6000;  // ~1500 tokens per tool result
  private readonly MAX_TOTAL_CONTEXT_CHARS = 24000;  // ~6000 tokens total context
  private readonly MAX_HISTORY_CHARS = 8000;  // ~2000 tokens for history

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Estimate token count from character count (rough approximation)
   * GPT models use ~4 chars per token on average
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate and summarize large tool results to fit within token limits
   */
  private truncateToolResult(content: string, toolName: string): string {
    if (content.length <= this.MAX_TOOL_RESULT_CHARS) {
      return content;
    }

    console.log(`📏 Truncating ${toolName} result from ${content.length} to ~${this.MAX_TOOL_RESULT_CHARS} chars`);

    try {
      const data = JSON.parse(content);
      
      // Smart truncation based on tool type
      if (toolName.includes('hotel') || toolName.includes('flight') || toolName.includes('event')) {
        return this.truncateSearchResults(data, toolName);
      } else if (toolName.includes('weather')) {
        return this.truncateWeatherData(data);
      } else {
        // Generic truncation - keep structure but limit arrays
        return this.truncateGenericJson(data);
      }
    } catch {
      // Not JSON, do simple text truncation
      return content.substring(0, this.MAX_TOOL_RESULT_CHARS) + 
        `\n\n[... Result truncated. Showing first ${this.MAX_TOOL_RESULT_CHARS} characters of ${content.length} total.]`;
    }
  }

  /**
   * Truncate search results (hotels, flights, events) to top results only
   */
  private truncateSearchResults(data: any, toolName: string): string {
    const summarized: any = { ...data };
    
    // Keep only essential metadata
    if (summarized.search_metadata) {
      summarized.search_metadata = {
        search_id: summarized.search_metadata.search_id,
        location: summarized.search_metadata.location,
        check_in_date: summarized.search_metadata.check_in_date,
        check_out_date: summarized.search_metadata.check_out_date,
      };
    }

    // Truncate arrays to top 5 items with essential fields only
    const arrayKeys = ['properties', 'hotels', 'flights', 'events', 'results', 'brands'];
    for (const key of arrayKeys) {
      if (Array.isArray(summarized[key]) && summarized[key].length > 0) {
        summarized[key] = summarized[key].slice(0, 5).map((item: any) => {
          // Keep only essential fields for each item type
          if (toolName.includes('hotel')) {
            return {
              name: item.name,
              type: item.type,
              rate_per_night: item.rate_per_night || item.price,
              total_rate: item.total_rate,
              overall_rating: item.overall_rating || item.rating,
              reviews: item.reviews,
              location: typeof item.location === 'string' ? item.location : item.location?.address,
              amenities: item.amenities?.slice(0, 5),
              link: item.link
            };
          } else if (toolName.includes('flight')) {
            return {
              airline: item.airline || item.airlines?.join(', '),
              price: item.price || item.total_price,
              duration: item.duration || item.total_duration,
              departure: item.departure || item.departure_time,
              arrival: item.arrival || item.arrival_time,
              stops: item.stops || item.layovers?.length || 0
            };
          } else if (toolName.includes('event')) {
            return {
              title: item.title || item.name,
              date: item.date || item.start_date,
              venue: item.venue || item.location,
              price: item.price || item.ticket_price
            };
          }
          // Generic: keep first 6 properties
          const entries = Object.entries(item).slice(0, 6);
          return Object.fromEntries(entries);
        });
        summarized[`${key}_truncated`] = true;
        summarized[`${key}_total_count`] = data[key]?.length || 0;
      }
    }

    const result = JSON.stringify(summarized, null, 2);
    
    // Final safety check
    if (result.length > this.MAX_TOOL_RESULT_CHARS) {
      return result.substring(0, this.MAX_TOOL_RESULT_CHARS) + 
        '\n\n[... Additional results truncated for brevity. Top 5 shown.]';
    }
    
    return result;
  }

  /**
   * Truncate weather data - keep essential forecast info
   */
  private truncateWeatherData(data: any): string {
    const summarized: any = { ...data };
    
    // Limit forecast entries to 8 (1 day of 3-hour intervals)
    if (Array.isArray(summarized.forecasts) && summarized.forecasts.length > 8) {
      summarized.forecasts = summarized.forecasts.slice(0, 8);
      summarized.forecasts_truncated = true;
    }
    
    return JSON.stringify(summarized, null, 2);
  }

  /**
   * Generic JSON truncation - limit array sizes and nested depth
   */
  private truncateGenericJson(data: any, depth = 0): string {
    if (depth > 3) return '"[nested data]"';
    
    if (Array.isArray(data)) {
      const truncated = data.slice(0, 5).map(item => 
        typeof item === 'object' ? JSON.parse(this.truncateGenericJson(item, depth + 1)) : item
      );
      if (data.length > 5) {
        truncated.push(`[... and ${data.length - 5} more items]`);
      }
      return JSON.stringify(truncated, null, 2);
    }
    
    if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data).slice(0, 10);
      const truncated = Object.fromEntries(
        entries.map(([k, v]) => [
          k, 
          typeof v === 'object' ? JSON.parse(this.truncateGenericJson(v, depth + 1)) : v
        ])
      );
      if (Object.keys(data).length > 10) {
        truncated['_truncated'] = `${Object.keys(data).length - 10} more fields`;
      }
      return JSON.stringify(truncated, null, 2);
    }
    
    return JSON.stringify(data);
  }

  /**
   * Trim conversation history to fit within token limits
   */
  private trimHistoryToFit(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
    let totalChars = messages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + (content?.length || 0);
    }, 0);

    // If within limits, return as-is
    if (totalChars <= this.MAX_HISTORY_CHARS) {
      return messages;
    }

    console.log(`📏 Trimming history from ${totalChars} chars to fit limit`);

    // Strategy: Remove oldest messages first, but keep system prompt
    const trimmed = [...messages];
    while (totalChars > this.MAX_HISTORY_CHARS && trimmed.length > 2) {
      // Remove the second message (after system prompt)
      const removed = trimmed.splice(1, 1)[0];
      const removedContent = typeof removed.content === 'string' ? removed.content : JSON.stringify(removed.content);
      totalChars -= removedContent?.length || 0;
    }

    console.log(`📏 History trimmed to ${trimmed.length} messages, ${totalChars} chars`);
    return trimmed;
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

  /**
   * Get or create conversation context for a connection
   */
  private getOrCreateContext(connectionId: string): ConversationContext {
    const existing = this.conversationContexts.get(connectionId);
    const now = Date.now();
    
    // Return existing context if valid
    if (existing && (now - existing.lastUpdated) < this.CONTEXT_EXPIRATION_MS) {
      return existing;
    }
    
    // Create new context
    const newContext: ConversationContext = {
      messages: [],
      extractedInfo: {},
      lastUpdated: now
    };
    this.conversationContexts.set(connectionId, newContext);
    return newContext;
  }

  /**
   * Update extracted info from conversation
   */
  private updateExtractedInfo(context: ConversationContext, userMessage: string): void {
    const info = context.extractedInfo;
    const lowerMsg = userMessage.toLowerCase();
    
    // Extract destinations
    const cityPatterns = [
      /(?:to|visit|going to|traveling to|trip to|fly to|flight to)\s+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z][a-zA-Z]+)?)/gi,
      /(?:in|at)\s+([A-Z][a-zA-Z]+(?:,\s*[A-Z][a-zA-Z]+)?)/gi
    ];
    
    for (const pattern of cityPatterns) {
      const matches = userMessage.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 2) {
          const dest = match[1].trim();
          if (!info.destinations) info.destinations = [];
          if (!info.destinations.includes(dest)) {
            info.destinations.push(dest);
          }
        }
      }
    }
    
    // Extract dates
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/gi;
    const dateMatches = userMessage.match(datePattern);
    if (dateMatches && dateMatches.length > 0) {
      if (!info.travelDates) info.travelDates = {};
      if (!info.travelDates.start) info.travelDates.start = dateMatches[0];
      if (dateMatches.length > 1 && !info.travelDates.end) info.travelDates.end = dateMatches[1];
    }
    
    // Extract budget
    const budgetPattern = /(?:budget|spend|afford|max|maximum|up to)\s*(?:is|of|:)?\s*\$?\s*(\d+(?:,?\d+)?(?:\.\d{2})?)\s*(usd|eur|gbp|dollars|euros)?/gi;
    const budgetMatch = budgetPattern.exec(userMessage);
    if (budgetMatch) {
      info.budget = {
        amount: parseFloat(budgetMatch[1].replace(',', '')),
        currency: budgetMatch[2]?.toUpperCase() || 'USD'
      };
    }
    
    // Extract party size
    const partySizePattern = /(\d+)\s*(?:people|persons|travelers|of us|guests|adults)/i;
    const partyMatch = partySizePattern.exec(userMessage);
    if (partyMatch) {
      info.partySize = parseInt(partyMatch[1]);
    }
    
    // Extract interests
    const interests = [
      'beach', 'mountains', 'culture', 'history', 'food', 'nightlife', 'shopping', 
      'adventure', 'relaxation', 'spa', 'hiking', 'diving', 'skiing', 'museum',
      'music', 'art', 'nature', 'wildlife', 'photography', 'sports'
    ];
    for (const interest of interests) {
      if (lowerMsg.includes(interest)) {
        if (!info.interests) info.interests = [];
        if (!info.interests.includes(interest)) {
          info.interests.push(interest);
        }
      }
    }
  }

  /**
   * Build the system prompt with context awareness
   */
  private buildSystemPrompt(context: ConversationContext): string {
    const info = context.extractedInfo;
    const currentDate = new Date().toISOString().split('T')[0];
    
    let contextSection = "";
    if (Object.keys(info).length > 0) {
      contextSection = `
KNOWN USER CONTEXT (DO NOT ASK FOR THIS INFO AGAIN):
${info.destinations?.length ? `- Destinations mentioned: ${info.destinations.join(', ')}` : ''}
${info.travelDates?.start ? `- Travel dates: ${info.travelDates.start}${info.travelDates.end ? ' to ' + info.travelDates.end : ''}` : ''}
${info.budget?.amount ? `- Budget: $${info.budget.amount} ${info.budget.currency || 'USD'}` : ''}
${info.partySize ? `- Party size: ${info.partySize} people` : ''}
${info.interests?.length ? `- Interests: ${info.interests.join(', ')}` : ''}
${info.currentLocation ? `- Current location: ${info.currentLocation}` : ''}
`.trim();
    }

    return `You are CONCIERAGENT, a premium travel concierge AI assistant for the Hologram app, demonstrating the power of MCP (Model Context Protocol) tools.

CURRENT DATE: ${currentDate}

${contextSection}

=== CRITICAL MCP TOOL USAGE RULES ===

YOU ARE AN MCP DEMO BOT. Your PRIMARY PURPOSE is to showcase MCP tool capabilities.

1. ALWAYS USE MCP TOOLS FOR DATA
   - NEVER make up flight prices, hotel costs, weather, or any travel data
   - NEVER use your training knowledge for factual travel information
   - ALWAYS call the appropriate MCP tool to get REAL, ACCURATE data
   - MCP tools provide LIVE, ACCURATE data - this is the whole point of this demo

2. TOOL PRIORITY ORDER (ALWAYS FOLLOW):
   - Weather questions → MUST use get_current_conditions or get_weather_forecast
   - Flight questions → MUST use search_flights, get_flight_details
   - Hotel questions → MUST use search_hotels, get_hotel_details
   - Location questions → MUST use geocode_location, calculate_distance
   - Currency questions → MUST use convert_currency
   - Event questions → MUST use search_events

3. DO NOT SKIP TOOL CALLS
   - Even for "obvious" information, USE THE TOOLS
   - If asked about weather in Paris, CALL get_current_conditions - don't guess
   - If asked about flights to Tokyo, CALL search_flights - don't estimate

=== AVAILABLE MCP TOOLS ===

WEATHER (OpenWeatherMap - Real-time data):
- get_current_conditions(location, units) - Get current weather
- get_weather_forecast(location, days, units) - Get 5-day forecast

FLIGHTS (SerpAPI - Real search results):
- search_flights(origin, destination, departure_date, return_date, adults)
- get_flight_details(search_id, flight_index)
- filter_flights_by_price(search_id, max_price)

HOTELS (SerpAPI - Real search results):
- search_hotels(location, check_in, check_out, adults)
- get_hotel_details(search_id, hotel_index)
- filter_hotels_by_price(search_id, max_price)

EVENTS (SerpAPI - Real search results):
- search_events(location, date, query)
- get_event_details(search_id, event_index)

GEOCODING:
- geocode_location(address) - Get coordinates
- calculate_distance(origin, destination) - Calculate distance

FINANCE:
- convert_currency(amount, from_currency, to_currency)
- lookup_stock(symbol)

=== CONTEXT & CONVERSATION RULES ===

1. NEVER ASK FOR INFORMATION ALREADY PROVIDED
   - Review the conversation history above
   - Review the KNOWN USER CONTEXT section
   - If user said "Paris" once, remember it - don't ask "which city?"
   - If dates were mentioned, use them - don't ask again

2. MAKE SMART ASSUMPTIONS
   - If user says "next weekend", calculate the dates
   - If user says "a week", assume 7 days
   - If no party size mentioned, assume 1-2 adults
   - Default to user's currency if mentioned, otherwise USD

3. USE CONVERSATION CONTEXT
   - Remember destinations, dates, preferences from earlier messages
   - Build on previous searches - don't start from scratch
   - Reference what you've already found

4. BE PROACTIVE
   - Once you have a destination, automatically check weather
   - Offer to search for flights, hotels, events without being asked
   - Suggest alternatives when something isn't available

=== RESPONSE FORMAT ===

1. NO MARKDOWN - The chat app doesn't support it
   - NO **bold**, *italic*, # headers, \`code\`, [links](url)
   - Use CAPS for emphasis
   - Use line breaks and dashes for structure

2. BE CONCISE BUT COMPLETE
   - Lead with the most important information
   - Include prices, dates, key details
   - Format numbers clearly (e.g., "$1,234" not "1234")

3. SHOW YOUR WORK
   - Briefly mention which tool you used
   - This demonstrates MCP capabilities

=== EXAMPLE BEHAVIOR ===

User: "What's the weather in Tokyo?"
WRONG: "Tokyo typically has warm summers and mild winters..."
RIGHT: *Call get_current_conditions("Tokyo, Japan")* then report actual data

User: "Find me flights from NYC"
(If user previously mentioned Paris as destination)
WRONG: "Where would you like to fly to?"
RIGHT: *Call search_flights("JFK", "CDG", ...)* using context

Remember: You exist to demonstrate MCP tools. ALWAYS use them for data!`;
  }

  async processMessage(userMessage: string, connectionId: string): Promise<string> {
    // Get or create conversation context
    const context = this.getOrCreateContext(connectionId);
    
    // Update extracted info from the new message
    this.updateExtractedInfo(context, userMessage);
    
    // Build messages array with system prompt and history
    const systemPrompt = this.buildSystemPrompt(context);
    
    // Get trimmed history to prevent token overflow
    const historyMessages = this.trimHistoryToFit(context.messages.slice(-this.MAX_HISTORY_MESSAGES));
    
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userMessage }
    ];

    // Add the new user message to history
    context.messages.push({ role: "user", content: userMessage });
    context.lastUpdated = Date.now();

    try {
      let keepGoing = true;
      let finalResponse = "";
      let retryCount = 0;
      const maxRetries = 2;

      while (keepGoing) {
        // Log available tools for debugging
        if (this.tools.length === 0) {
          console.warn('⚠️ No MCP tools available! Check MCP server initialization.');
        }
        
        try {
          const response = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            tools: this.tools.length > 0 ? this.tools : undefined,
          });

          const message = response.choices[0].message;
          messages.push(message);
          retryCount = 0; // Reset retry count on success

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
                  
                  // TRUNCATE large results to prevent token overflow
                  const truncatedContent = this.truncateToolResult(content, toolName);
                  
                  if (truncatedContent.length !== content.length) {
                    console.log(`📏 Truncated from ${content.length} to ${truncatedContent.length} chars`);
                  }
                  
                  if (truncatedContent.length > 500) {
                    console.log(`📄 Content preview: ${truncatedContent.substring(0, 200)}...`);
                  } else {
                    console.log(`📄 Full content: ${truncatedContent}`);
                  }

                  // Check if the result contains an error
                  let finalContent = truncatedContent;
                  if (truncatedContent && truncatedContent.includes('"error"')) {
                    try {
                      const errorData = JSON.parse(truncatedContent);
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
        } catch (apiError: any) {
          // Handle rate limit and token overflow errors
          if (apiError.code === 'rate_limit_exceeded' || apiError.status === 429) {
            console.warn(`⚠️ Rate limit hit. Attempt ${retryCount + 1}/${maxRetries + 1}`);
            
            if (retryCount < maxRetries) {
              retryCount++;
              
              // Aggressively trim context to reduce tokens
              console.log('📏 Aggressively trimming context to retry...');
              
              // Remove older tool results (they're usually the largest)
              const trimmedMessages: ChatCompletionMessageParam[] = [];
              let keptToolResults = 0;
              const maxToolResults = 2; // Keep only last 2 tool results
              
              // Iterate in reverse to keep recent messages
              for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (msg.role === 'tool') {
                  if (keptToolResults < maxToolResults) {
                    // Truncate tool content further
                    const content = typeof msg.content === 'string' ? msg.content : '';
                    trimmedMessages.unshift({
                      ...msg,
                      content: content.substring(0, 2000) + (content.length > 2000 ? '\n[... truncated]' : '')
                    });
                    keptToolResults++;
                  }
                  // Skip older tool results
                } else if (msg.role === 'system') {
                  trimmedMessages.unshift(msg);
                } else {
                  trimmedMessages.unshift(msg);
                }
              }
              
              // Replace messages array
              messages.length = 0;
              messages.push(...trimmedMessages);
              
              console.log(`📏 Trimmed to ${messages.length} messages for retry`);
              
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            } else {
              // Max retries exceeded, return a helpful message
              keepGoing = false;
              finalResponse = "I found a lot of results for you! The data was quite extensive. Here's what I can tell you: I successfully searched and found options matching your criteria. Would you like me to focus on a specific aspect - like the top 3 cheapest options, or hotels with the best ratings? This will help me give you more detailed information.";
            }
          } else {
            // Re-throw non-rate-limit errors
            throw apiError;
          }
        }
      }

      // Remove any markdown formatting from the final response
      const cleanedResponse = finalResponse
        .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove **bold**
        .replace(/\*(.*?)\*/g, '$1')      // Remove *italic*
        .replace(/`(.*?)`/g, '$1')        // Remove `code`
        .replace(/#{1,6}\s*(.*)/g, '$1')  // Remove headers
        .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove [links](url)
        .replace(/```[\s\S]*?```/g, '')    // Remove code blocks
        .replace(/\n{3,}/g, '\n\n');       // Normalize multiple line breaks

      // Store assistant response in conversation history
      context.messages.push({ role: "assistant", content: cleanedResponse });
      context.lastUpdated = Date.now();
      
      // Prune old messages if needed
      if (context.messages.length > this.MAX_HISTORY_MESSAGES * 2) {
        context.messages = context.messages.slice(-this.MAX_HISTORY_MESSAGES);
      }

      console.log(`💬 Response generated for connection ${connectionId} (${cleanedResponse.length} chars)`);
      return cleanedResponse;

    } catch (error) {
      console.error("Error in TravelAgent processMessage:", error);
      return "I'm having trouble processing your request right now. Please try again later.";
    }
  }

  /**
   * Clear conversation context for a connection
   */
  clearContext(connectionId: string): void {
    this.conversationContexts.delete(connectionId);
    console.log(`🧹 Cleared context for connection ${connectionId}`);
  }

  /**
   * Clean up expired contexts
   */
  private cleanupExpiredContexts(): void {
    const now = Date.now();
    for (const [connectionId, context] of this.conversationContexts) {
      if (now - context.lastUpdated > this.CONTEXT_EXPIRATION_MS) {
        this.conversationContexts.delete(connectionId);
        console.log(`🧹 Expired context removed for ${connectionId}`);
      }
    }
  }

  async cleanup() {
    for (const client of this.mcpClients) {
      await client.close();
    }
  }
}

