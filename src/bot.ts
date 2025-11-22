import express from 'express'
import { TravelAgent } from './agent/TravelAgent'

const app = express()
const port = 4001
const agent = new TravelAgent()

// Serve static files (like logo.png) from the current directory
app.use(express.static('.'))

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

app.listen(port, async () => {
  console.log(`🤖 Concieragent server listening at http://localhost:${port}`)
  console.log(`📡 VS Agent URL: ${VS_AGENT_URL}`)
  
  console.log('🔄 Initializing Travel Agent (connecting to MCP servers)...')
  await agent.initialize()
  console.log('✅ Travel Agent ready!')
})

// Keep process alive
process.stdin.resume()

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down...')
  await agent.cleanup()
  process.exit(0)
})
