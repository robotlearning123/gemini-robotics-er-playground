#!/bin/bash
# Franka Panda Pick & Place — Quick Setup
# Usage: bash setup.sh

set -e

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  Franka Panda Pick & Place Setup         ║"
echo "  ║  Gemini Vision + MuJoCo + Three.js       ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  [!] Node.js is required but not installed."
    echo "      Install it from https://nodejs.org/"
    exit 1
fi

NODE_VER=$(node -v)
echo "  [✓] Node.js $NODE_VER"

# Install dependencies
echo ""
echo "  [1/3] Installing dependencies..."
npm install --silent 2>&1 | tail -1
echo "  [✓] Dependencies installed"

# API Key
echo ""
echo "  [2/3] Gemini API Key"

if [ -f .env.local ] && grep -q "GEMINI_API_KEY=." .env.local && ! grep -q "PLACEHOLDER" .env.local; then
    echo "  [✓] API key already configured in .env.local"
else
    echo ""
    echo "  Get your free key at: https://aistudio.google.com/apikey"
    echo ""
    read -p "  Enter your Gemini API key (or press Enter to skip): " API_KEY
    if [ -n "$API_KEY" ]; then
        echo "GEMINI_API_KEY=$API_KEY" > .env.local
        echo "  [✓] API key saved to .env.local"
    else
        echo "  [!] Skipped. Set it later in .env.local"
        echo "GEMINI_API_KEY=PLACEHOLDER_API_KEY" > .env.local
    fi
fi

# Start
echo ""
echo "  [3/3] Starting development server..."
echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │  App:    http://localhost:3000           │"
echo "  │  Study:  http://localhost:3000/study.html│"
echo "  │  Arch:   http://localhost:3000/diagram.html│"
echo "  │                                         │"
echo "  │  Press Ctrl+C to stop                   │"
echo "  └─────────────────────────────────────────┘"
echo ""

npm run dev
