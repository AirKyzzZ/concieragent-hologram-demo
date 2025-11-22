# Hologram Chatbot - Getting Started

A simple Hologram chatbot that responds with test messages. This is a minimal implementation to get you started with Hologram's Verifiable Service (VS) Agent.

## Prerequisites

Before you begin, make sure you have:

- **Docker** installed and running
- **Node.js 18+** installed
- **ngrok** (or similar tunneling tool) for exposing your local server
- **Hologram app** installed on your iPhone 14 Pro

## Step-by-Step Setup

### Step 1: Install Dependencies

Install the required Node.js packages:

```bash
npm install
```

### Step 2: Start ngrok Tunnel

Open a new terminal window and start ngrok to expose your local server:

```bash
ngrok http 3001
```

This will give you a public URL like `abc123.ngrok-free.app`. **Copy this URL** - you'll need it in the next step.

> 💡 **Note**: Keep this terminal open - ngrok needs to keep running for the tunnel to work.

### Step 3: Start Your Bot Server

In the main terminal, start your chatbot server:

```bash
npm start
```

You should see:
```
🤖 Hologram Chatbot server listening at http://localhost:4001
📡 VS Agent URL: http://localhost:3000
✅ Ready to receive messages!
```

> 💡 **Keep this terminal open** - your bot server needs to keep running.

### Step 4: Start VS Agent with Docker

Open a **third terminal window** and run the VS Agent using the provided script:

```bash
./docker-run.sh <your-ngrok-url>
```

Replace `<your-ngrok-url>` with the URL you got from ngrok (without `https://`). For example:

```bash
./docker-run.sh abc123.ngrok-free.app
```

The script will:
- Pull the VS Agent Docker image (if not already pulled)
- Configure it with your public URL
- Start it on ports 3000 (admin) and 3001 (public)

You should see:
```
✅ VS Agent started successfully!
```

### Step 5: Connect with Hologram App

1. Open your web browser and go to: `http://localhost:3001/invitation`
2. You'll see a QR code on the Hologram website
3. Open the **Hologram app** on your iPhone 14 Pro
4. Scan the QR code
5. Accept the connection invitation

You should now see an empty chat with your bot in the Hologram app!

### Step 6: Test Your Bot

1. In the Hologram app, send any message to your bot (e.g., "Hello!")
2. Your bot should automatically respond with: *"Hello! This is a test message from your Hologram chatbot. I received your message!"*

🎉 **Congratulations!** Your Hologram chatbot is working!

## How It Works

1. **VS Agent** runs in Docker and handles the DIDComm connections with Hologram
2. **Your bot server** (running on port 4001) receives webhook events when messages arrive
3. When a message is received, your bot sends a response back through VS Agent's Admin API
4. VS Agent delivers the message to the user's Hologram app

## Project Structure

```
.
├── src/
│   └── bot.ts          # Main bot server with webhook endpoint
├── package.json        # Node.js dependencies
├── tsconfig.json       # TypeScript configuration
├── docker-run.sh       # Script to run VS Agent
└── README.md           # This file
```

## Customizing Your Bot

Edit `src/bot.ts` to change how your bot responds. The `message-received` endpoint receives messages and can send responses via the VS Agent Admin API.

Example: Change the response message in `src/bot.ts`:

```typescript
const testResponse = "Your custom message here!"
```

## Troubleshooting

### Bot doesn't respond to messages

1. Check that your bot server is running: `npm start`
2. Check VS Agent logs: `docker logs -f vs-agent`
3. Verify ngrok is still running and the URL hasn't changed
4. Make sure the `EVENTS_BASE_URL` in VS Agent matches your local IP (check `docker-run.sh`)

### Can't connect with Hologram app

1. Make sure VS Agent is running: `docker ps` (should see `vs-agent`)
2. Verify ngrok is running and accessible
3. Try accessing `http://localhost:3001/invitation` in your browser
4. Make sure you're using the correct ngrok URL in `docker-run.sh`

### VS Agent won't start

1. Make sure Docker is running
2. Check if port 3000 or 3001 is already in use
3. Stop any existing VS Agent: `docker stop vs-agent && docker rm vs-agent`
4. Try pulling the image manually: `docker pull io2060/vs-agent:dev`

## Next Steps

Now that you have a working basic bot, you can:

1. **Add more sophisticated responses** - Parse user messages and respond intelligently
2. **Add state management** - Remember conversation context
3. **Add external APIs** - Integrate with other services
4. **Issue credentials** - Learn about verifiable credentials (see hologram-docs)
5. **Request credentials** - Verify user credentials (see hologram-docs)

## Useful Commands

```bash
# Start bot server
npm start

# View VS Agent logs
docker logs -f vs-agent

# Stop VS Agent
docker stop vs-agent

# Remove VS Agent container
docker rm vs-agent

# Restart VS Agent (after updating docker-run.sh)
docker stop vs-agent && docker rm vs-agent
./docker-run.sh <your-ngrok-url>
```

## Resources

- [Hologram Documentation](https://hologram.zone)
- [VS Agent GitHub](https://github.com/2060-io/vs-agent)
- [VS Agent API Documentation](http://localhost:3000/api) (Swagger UI when VS Agent is running)

## Support

Check the `hologram-docs` folder for more detailed documentation and examples.

