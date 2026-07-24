#!/bin/sh

echo "🚀 Starting all Cortex-AI backend services inside the same container..."

# Start each microservice in the background — logs visible in Railway console
cd /app/services/auth && AUTH_PORT=8001 node index.js &
cd /app/services/chat && CHAT_PORT=8002 node index.js &
cd /app/services/agent && AGENT_PORT=8003 node index.js &
cd /app/services/billing && BILLING_PORT=8004 node index.js &

# Wait for microservices to initialize before gateway starts
sleep 4

# Start the Gateway service in the foreground (Railway expects this process)
echo "👉 Starting Gateway Service..."
cd /app/gateway && node index.js
