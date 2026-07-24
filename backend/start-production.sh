#!/bin/sh

echo "🚀 Starting all Cortex-AI backend services inside the same container..."

# Start each microservice in the background
cd /app/services/auth && npm start > /dev/null 2>&1 &
cd /app/services/chat && npm start > /dev/null 2>&1 &
cd /app/services/agent && npm start > /dev/null 2>&1 &
cd /app/services/billing && npm start > /dev/null 2>&1 &

# Wait for microservices to initialize
sleep 3

# Start the Gateway service in the foreground
echo "👉 Starting Gateway Service (Port 8000)..."
cd /app/gateway && npm start
