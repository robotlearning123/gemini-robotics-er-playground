# Franka Panda Pick & Place with Gemini Vision

A real-time robotic simulation where a **Franka Emika Panda** arm picks up objects using **Google Gemini Embodied Reasoning** for visual scene understanding. The system combines AI vision, physics simulation, and inverse kinematics in a browser-based Sense-Plan-Act loop.

## How It Works

```
User Prompt ─→ Canvas Snapshot ─→ Gemini API ─→ 2D→3D Projection ─→ IK Solver ─→ Pick & Place
 "red cubes"     Base64 JPEG      ER 1.5         Raycasting         7-DOF        State Machine
```

1. User types a target (e.g. `"red cubes"`) and selects a detection mode
2. The app captures a screenshot of the 3D scene
3. Gemini Vision analyzes the image and returns 2D coordinates of detected objects
4. Coordinates are projected from 2D screen space into 3D world space via raycasting
5. An analytical IK solver computes joint angles for the 7-DOF arm
6. A state machine executes the pick-and-place sequence: **Hover → Open → Lower → Grasp → Lift → Move → Drop**

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| UI | React 19 + TypeScript | Control panel and state management |
| Rendering | Three.js | 3D scene visualization |
| Physics | MuJoCo (WASM) | Real-time robot simulation |
| AI/Vision | Gemini Robotics ER 1.5 | Object detection and scene understanding |
| Build | Vite 6 | Development server and bundling |

## Detection Modes

| Mode | Output | Description |
|------|--------|-------------|
| **Bounding Boxes** | `box_2d: [y1, x1, y2, x2]` | Rectangular regions around objects |
| **Segmentation Masks** | `mask: "base64..."` | Pixel-level object contours (ER 1.5 only) |
| **Points** | `point: [y, x]` | Exact center coordinates |

## Getting Started

### Prerequisites

- Node.js (v18+)
- A [Gemini API key](https://aistudio.google.com/apikey)

### Setup

```bash
# Install dependencies
npm install

# Set your API key
echo "GEMINI_API_KEY=your_key_here" > .env.local

# Start the dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Project Structure

```
├── App.tsx                    # Main controller — orchestrates the AI loop
├── MujocoSim.ts               # Physics simulation engine
├── RenderSystem.ts            # Three.js scene + 2D→3D projection
├── SequenceAnimator.ts        # Pick-and-place state machine
├── FrankaAnalyticalIK.ts      # Analytical IK solver for 7-DOF arm
├── IkSystem.ts                # IK target management
├── RobotLoader.ts             # Downloads robot model from DeepMind Menagerie
├── types.ts                   # Shared TypeScript interfaces
├── components/
│   ├── UnifiedSidebar.tsx     # Control panel (prompt, detection mode, history)
│   ├── Toolbar.tsx            # Play/Pause, Reset, Dark Mode
│   └── RobotSelector.tsx      # Robot status overlay
├── rendering/
│   └── GeomBuilder.ts         # MuJoCo geometry → Three.js mesh
├── utils/
│   └── StringUtils.ts         # WASM string utilities
├── Reflector.ts               # Reflective floor plane
├── CapsuleGeometry.ts         # Custom capsule geometry
├── MatMath.ts                 # Linear algebra helpers
└── DragStateManager.ts        # Mouse raycasting
```

## Architecture

Open `diagram.html` locally for an interactive architecture diagram covering:

1. Three-pillar architecture (UI / AI / Robot Control)
2. Data flow pipeline (6 steps from prompt to pick)
3. Detection modes comparison
4. Pick-and-place state machine
5. Inverse kinematics solver details
6. File dependency map

## Models

| Model | Capabilities |
|-------|-------------|
| `gemini-robotics-er-1.5-preview` | All detection modes (Boxes, Masks, Points) |
| `gemini-3-flash-preview` | Boxes and Points only (no Segmentation Masks) |

## License

Apache-2.0
