import express from 'express'
import { TravelAgent } from './agent/TravelAgent'
import path from 'path'

const app = express()
const port = 4001
const agent = new TravelAgent()

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

// POST /message-received - Webhook endpoint for VS Agent
app.post('/message-received', async (req, res) => {
  try {
    const message = req.body.message
    const connectionId = message.connectionId
    const content = message.content

    console.log(`📨 Message received from connection ${connectionId}: ${content}`)

    // Use TravelAgent to generate response
    const agentResponse = await agent.processMessage(content, connectionId)

    // Send response back to the user via VS Agent Admin API
    const responseMessage = {
      type: 'text',
      connectionId: connectionId,
      content: agentResponse
    }

    const response = await fetch(`${VS_AGENT_URL}/v1/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(responseMessage)
    })

    if (!response.ok) {
      console.error(`❌ Failed to send message: ${response.statusText}`)
    } else {
      console.log(`✅ Sent response to connection ${connectionId}`)
    }

    res.status(200).end()
  } catch (error) {
    console.error('❌ Error processing message:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'concieragent' })
})

app.listen(port, () => {
  console.log(`🤖 Concieragent server listening at http://localhost:${port}`)
  console.log(`📡 VS Agent URL: ${VS_AGENT_URL}`)
  
  // Initialize Travel Agent asynchronously (don't block server startup)
  console.log('🔄 Initializing Travel Agent (connecting to MCP servers)...')
  agent.initialize().then(() => {
    console.log('✅ Travel Agent ready!')
  }).catch(error => {
    console.error('❌ Failed to initialize Travel Agent:', error)
    console.log('⚠️ Bot will continue but MCP features may not work')
  })
})

// Keep process alive
process.stdin.resume()

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down...')
  await agent.cleanup()
  process.exit(0)
})
