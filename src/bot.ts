import express from 'express'

const app = express()
const port = 4001

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

    // Simple test response - just echo back with a test message
    const testResponse = "Hello! This is a test message from your Hologram chatbot. I received your message!"

    // Send response back to the user via VS Agent Admin API
    const responseMessage = {
      type: 'text',
      connectionId: connectionId,
      content: testResponse
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
  res.json({ status: 'ok', service: 'hologram-chatbot' })
})

app.listen(port, () => {
  console.log(`🤖 Hologram Chatbot server listening at http://localhost:${port}`)
  console.log(`📡 VS Agent URL: ${VS_AGENT_URL}`)
  console.log(`✅ Ready to receive messages!`)
})

// Keep process alive
process.stdin.resume()

