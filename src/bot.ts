import 'reflect-metadata';
import express from 'express'
import { TravelAgent } from './agent/TravelAgent'
import { createStorageProvider, getAvailableStorageProviders, type StorageProvider } from './storage'
import path from 'path'

const app = express()
const port = 4001

// Storage provider will be initialized asynchronously
let storage: StorageProvider | null = null
let agent: TravelAgent | null = null
let agentDegraded = false // Track if agent is running without MCP tools

// Define the root path explicitly based on where the code is running
// src/bot.ts is in src/, so we go up two levels to get to the root
const projectRoot = path.join(__dirname, '../..')
console.log(`📂 Serving static files from: ${projectRoot}`)

// Serve static files from the project root
app.use(express.static(projectRoot))

// Add explicit route for logo.png for debugging
app.get('/logo.png', (req, res) => {
  const logoPath = path.join(projectRoot, 'logo.png')
  res.sendFile(logoPath, (err) => {
    if (err) {
      console.error('❌ Error sending logo.png:', err)
      res.status(404).send('Logo not found')
    } else {
      console.log('✅ Served logo.png')
    }
  })
})

// VS Agent Admin API URL (default port 3000)
const VS_AGENT_URL = process.env.VS_AGENT_URL || 'http://localhost:3000'

app.use(express.json())

/**
 * Send a message to a connection via VS Agent Admin API
 * @returns true if successful, false otherwise
 */
async function sendMessageToConnection(connectionId: string, content: string): Promise<boolean> {
  try {
    const response = await fetch(`${VS_AGENT_URL}/v1/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', connectionId, content })
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      console.error(`❌ Failed to send message to VS Agent:`, {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        connectionId,
      })
      return false
    }

    console.log(`✅ Sent message to connection ${connectionId}`)
    return true
  } catch (error) {
    console.error(`❌ Failed to send message to connection ${connectionId}:`, error)
    return false
  }
}

// POST /message-received - Webhook endpoint for VS Agent
app.post('/message-received', async (req, res) => {
  try {
    if (!agent) {
      console.error('❌ Agent not initialized yet')
      res.status(503).json({ error: 'Service initializing' })
      return
    }

    // Validate request body
    const message = req.body?.message
    if (!message?.connectionId || !message?.content) {
      res.status(400).json({ error: 'Missing connectionId or content in message' })
      return
    }

    const { connectionId, content } = message
    console.log(`📨 Message received from connection ${connectionId}: ${content}`)

    // Use TravelAgent to generate response
    const agentResponse = await agent.processMessage(content, connectionId)

    // Send response back to the user via VS Agent Admin API
    const sent = await sendMessageToConnection(connectionId, agentResponse)

    if (!sent) {
      // Log the failure but still return 200 to webhook caller
      // (the message was processed, just delivery failed)
      console.error(`❌ Message processed but delivery to ${connectionId} failed`)
    }

    res.status(200).end()
  } catch (error) {
    console.error('❌ Error processing message:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  const status = !agent ? 'initializing' : agentDegraded ? 'degraded' : 'ok'
  res.json({
    status,
    service: 'concieragent',
    storage: storage?.name ?? 'not initialized',
    mcpToolsAvailable: agent && !agentDegraded
  })
})

// Get welcome message (can be used by frontend)
app.get('/welcome', (req, res) => {
  if (!agent) {
    res.status(503).json({ error: 'Service initializing' })
    return
  }

  const lang = req.query.lang as string | undefined
  const validLangs = ['en', 'es', 'fr']
  const language = validLangs.includes(lang || '') ? lang as 'en' | 'es' | 'fr' : 'en'

  res.json({
    message: agent.getWelcomeMessage(language),
    language,
    supportedLanguages: agent.getSupportedLanguages()
  })
})

// POST /connection-established - Handle new connections with welcome message
app.post('/connection-established', async (req, res) => {
  try {
    if (!agent) {
      console.error('❌ Agent not initialized yet')
      res.status(503).json({ error: 'Service initializing' })
      return
    }

    const connectionId = req.body?.connectionId
    if (!connectionId) {
      res.status(400).json({ error: 'Missing connectionId' })
      return
    }

    const preferredLanguage = req.body.language || 'en'
    console.log(`🤝 New connection established: ${connectionId}`)

    // Get localized welcome message
    const welcomeMessage = agent.getWelcomeMessage(preferredLanguage)

    // Send welcome message to the user via VS Agent Admin API
    const sent = await sendMessageToConnection(connectionId, welcomeMessage)

    if (sent) {
      console.log(`✅ Sent welcome message to connection ${connectionId} (${preferredLanguage})`)
    }

    res.status(200).json({ success: sent, language: preferredLanguage })
  } catch (error) {
    console.error('❌ Error sending welcome message:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.listen(port, async () => {
  console.log(`🤖 Concieragent server listening at http://localhost:${port}`)
  console.log(`📡 VS Agent URL: ${VS_AGENT_URL}`)

  // Log available storage providers
  const availableStorage = getAvailableStorageProviders()
  console.log('📋 Available storage providers:')
  for (const s of availableStorage) {
    console.log(`   ${s.configured ? '✅' : '⚪'} ${s.type}${s.configured ? '' : ' (not configured)'}`)
  }

  // Initialize storage provider
  console.log('🔄 Initializing storage provider...')
  const allowMemoryFallback = process.env.ALLOW_MEMORY_FALLBACK !== 'false'

  try {
    storage = createStorageProvider()
    await storage.initialize()
    console.log(`✅ Storage initialized: ${storage.name}`)
  } catch (error) {
    console.error('❌ Failed to initialize storage:', error)

    if (allowMemoryFallback) {
      console.warn('⚠️ DEGRADED MODE: Falling back to memory storage. DATA WILL NOT PERSIST!')
      storage = createStorageProvider('memory')
      await storage.initialize()
    } else {
      console.error('💀 Storage is required. Set ALLOW_MEMORY_FALLBACK=true to allow memory-only mode.')
      process.exit(1)
    }
  }

  // Initialize Travel Agent with storage provider
  console.log('🔄 Initializing Travel Agent (connecting to MCP servers)...')
  agent = new TravelAgent(storage)

  const allowDegradedMode = process.env.ALLOW_DEGRADED_MODE !== 'false'

  try {
    await agent.initialize()
    console.log('✅ Travel Agent ready!')
  } catch (error) {
    console.error('❌ Failed to initialize Travel Agent:', error)

    if (allowDegradedMode) {
      console.warn('⚠️ DEGRADED MODE: Bot running WITHOUT MCP tools. Responses will be limited.')
      agentDegraded = true
    } else {
      console.error('💀 MCP tools are required. Set ALLOW_DEGRADED_MODE=true to run without tools.')
      process.exit(1)
    }
  }
})

// Keep process alive
process.stdin.resume()

// Handle cleanup on exit
const shutdown = async () => {
  console.log('🛑 Shutting down...')

  // Cleanup agent first (closes MCP connections)
  if (agent) {
    try {
      await agent.cleanup()
    } catch (error) {
      console.error('⚠️ Agent cleanup error:', error)
    }
  }

  // Then close storage connections
  if (storage) {
    try {
      await storage.close()
    } catch (error) {
      console.error('⚠️ Storage close error:', error)
    }
  }

  console.log('✅ Shutdown complete')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
