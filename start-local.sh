#!/bin/bash

# Set PATH to use Node v22 LTS
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

echo "🚀 Starting Cortex-AI services locally..."

# Clean up function for background processes
cleanup() {
  echo -e "\n🛑 Stopping all services..."
  kill $(jobs -p) 2>/dev/null
  exit
}
trap cleanup SIGINT SIGTERM

# Start Backend Services
echo "👉 Starting Auth Service (Port 8001)..."
npm --prefix backend/services/auth run dev > /dev/null 2>&1 &

echo "👉 Starting Chat Service (Port 8002)..."
npm --prefix backend/services/chat run dev > /dev/null 2>&1 &

echo "👉 Starting Agent Service (Port 8003)..."
npm --prefix backend/services/agent run dev > /dev/null 2>&1 &

echo "👉 Starting Billing Service (Port 8004)..."
npm --prefix backend/services/billing run dev > /dev/null 2>&1 &

# Give services a couple of seconds to boot before starting the gateway
sleep 2

echo "👉 Starting Gateway Service (Port 8000)..."
npm --prefix backend/gateway run dev > /dev/null 2>&1 &

# Start Frontend Service
echo "👉 Starting Frontend Service (Port 5173)..."
npm --prefix frontend run dev > /dev/null 2>&1 &

echo "✅ All services launched!"
echo "   - Gateway: http://localhost:8000"
echo "   - Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait for all background processes
wait
