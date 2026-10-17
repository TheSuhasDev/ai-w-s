# AI-Powered Warehouse Management System

An enterprise-grade, intelligent local warehouse operations platform combining **real-time computer vision tool recognition (YOLO)**, a **generative AI warehouse assistant (Gemini 2.5 Flash)** with voice & function-calling capabilities, **30-day predictive reorder telemetry**, **overdue payment recovery with WhatsApp integration**, and **role-based inventory & order lifecycle management**.

---

## 1. Project Overview

WMS provides end-to-end tooling for warehouse staff and administrators. It automates inventory auditing, receiving, dispatching, and billing with AI assistance at every step:

* **Computer Vision Receiving & Dispatch**: Automatically identifies mechanical tools (drills, hammers, pliers, screwdrivers, wrenches) placed under a camera using a local FastAPI + Ultralytics YOLO service.
* **Conversational AI Warehouse Assistant**: Powered by Google Gemini 2.5 Flash with bi-directional voice recognition/speech synthesis and tool calling (read tools + human-in-the-loop pending action approvals for financial actions).
* **Predictive Reorder Telemetry**: Computes 30-day rolling burn rates, stock exhaustion forecasts ("days left"), and dynamic replenishment suggestions with urgency classification (`CRITICAL`, `WARNING`, `OK`, `NO_DATA`).
* **Payment Sentinel & WhatsApp Integration**: Surfaces packed orders with outstanding balances beyond a 3-day grace period, generates pre-formatted payment reminders, and launches WhatsApp Web/App with one click.
* **Order & Billing Lifecycle**: Multi-stage state machine (`PROCESSING` → `ADVANCE_RECEIVED` → `PACKED` → `DISPATCHED`), atomic transactional dispatching, and print-ready tax invoices.
* **Role-Based Access Control (RBAC)**: Secure JWT authentication with distinct `STAFF` and `ADMIN` permission tiers.

---

## 2. System Architecture

```text
                                  ┌─────────────────────────────────────────┐
                                  │   React 19 + TypeScript + Vite Frontend │
                                  │   - Tailwind CSS v4 & Framer Motion     │
                                  │   - Tabler Icons & Base UI              │
                                  │   - Web Speech API (Voice input/TTS)    │
                                  │   http://localhost:5173                 │
                                  └───────────────┬─────────────────┬───────┘
                                                  │                 │
                           REST API / JWT Auth    │                 │ Direct Vision Stream
                                                  ▼                 ▼
             ┌───────────────────────────────────────────┐    ┌───────────────────────────────┐
             │ Node.js 22 + Express 5 Backend            │    │ FastAPI + Uvicorn Service     │
             │ - JWT Authentication & RBAC               │    │ - Ultralytics YOLO Inference  │
             │ - Gemini 2.5 Flash Tool-Calling Engine    │    │ - Bounding Box Filtering      │
             │ - 30-Day Predictive Stock Telemetry       │    │ - Multi-frame Stabilizer      │
             │ - Transactional Mongoose Operations       │    │ http://127.0.0.1:8001         │
             │ http://localhost:5000                     │    └───────────────────────────────┘
             └─────────────────────┬─────────────────────┘
                                   │
                   Mongoose 9 ODM  ▼
             ┌───────────────────────────────────────────┐
             │ MongoDB (Local Community / Atlas)         │
             │ - users (Admin / Staff credentials)       │
             │ - products (Catalog, stock, min buffers)  │
             │ - orders (State machine, client info)     │
             │ - payments (Advance, partial, full ledger)│
             │ - stockmovements (Auditable receive/disp) │
             └───────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Framer Motion 14, Tabler Icons, Lucide React, Base UI (`@base-ui/react`), clsx, tailwind-merge |
| **Backend API** | Node.js, Express 5, Mongoose 9, MongoDB Community / Atlas, JWT (`jsonwebtoken`), bcryptjs, `express-rate-limit`, CORS, dotenv |
| **Generative AI** | Google Gemini 2.5 Flash via `@google/genai` (Function calling, grounded telemetry tools, human-in-the-loop pending confirmations) |
| **Computer Vision** | Python 3, FastAPI, Uvicorn, Ultralytics YOLO (YOLO11), Pillow, NumPy |
| **Voice & Messaging** | Web Speech API (SpeechRecognition & SpeechSynthesis), WhatsApp URI Scheme (`https://wa.me`) |
| **Tooling & DX** | ESLint 10, Nodemon, TypeScript (`tsc`), PostCSS, Autoprefixer |

---

## 4. Key Subsystems & Features

### 4.1. Authentication & Role-Based Access Control (RBAC)
* **JWT Token Security**: Passwords hashed with `bcryptjs`. Tokens expire after 8 hours (configurable).
* **Role Separation**:
  * `STAFF`: Access to catalog inspection, live scanner receiving, order creation, and read-only AI assistant tools.
  * `ADMIN`: Elevated permissions to pack orders, dispatch orders, cancel orders, and approve pending payment actions through the AI Assistant.
* **Rate-Limiting**: Login endpoint protected by `express-rate-limit` (10 attempts per 15 minutes).

### 4.2. Computer Vision Tool Recognition
* Real-time camera feed sampling every 1.2 seconds.
* Frame sent to FastAPI endpoint `POST /predict`.
* **Detection Pipeline**:
  1. YOLO bounding box extraction for supported classes: `drill`, `hammer`, `pliers`, `screwdriver`, `wrench`.
  2. Bounding box sanity checks (area ratio between 1% and 80%, scan window bounds).
  3. Frontend **multi-frame stabilization** requiring 3 consecutive stable frames with $\ge 70\%$ confidence before confirming detection.
* **Receiving Station**: Auto-increments product stock by 1 unit and logs an auditable `RECEIVE` movement.
* **Dispatch Cart**: Auto-adds recognized tools to the order cart.

### 4.3. Smart Reorder Telemetry (30-Day Predictive Model)
* Aggregates all `DISPATCH` stock movements over a rolling 30-day window.
* **Formulas**:
  * **Daily Burn Rate**: $\text{Avg Daily Usage} = \frac{\text{Total Dispatched in Last 30 Days}}{30}$
  * **Runout Forecast**: $\text{Days Left} = \frac{\text{Current Stock}}{\text{Avg Daily Usage}}$
  * **Suggested Reorder**: $\max\Big(0,\ \lceil\text{Avg Daily Usage} \times 30\rceil + \text{Minimum Stock} - \text{Current Stock}\Big)$
* **Urgency Tiers**:
  * `CRITICAL`: Stock $\le$ Min Stock **OR** Days Left $\le 3$ days.
  * `WARNING`: Days Left $\le 7$ days.
  * `OK`: Days Left $> 7$ days.
  * `NO_DATA`: No recent dispatches recorded.
* Features a one-click **"Copy Reorder List"** for procurement orders.

### 4.4. Overdue Payment Sentinel & WhatsApp Recovery
* Identifies `PACKED` orders that have an unpaid balance exceeding the configurable grace threshold (default: 3 days).
* **WhatsApp Deep Links**: Formats Indian phone numbers (`+91XXXXXXXXXX`) and generates an invoice reminder message containing the client name, order number, outstanding balance, and payment options.
* **Audit Trail**: Logs reminder history directly to the order document (`POST /api/orders/:id/reminders`).

### 4.5. Conversational AI Assistant (Gemini 2.5 Flash)
* Accessible via the floating interactive chat window with real-time speech-to-text and voice readouts.
* **Read Tools**:
  * `getStock`: Query current quantity, pricing, and shelf location.
  * `listLowStock`: Filter products at or below safety buffer.
  * `getReorderSuggestions`: Return 30-day burn rate and replenishment quantities.
  * `getOrderStatus`: Look up fulfillment progress and financial balance by order number or client name.
  * `listOverduePayments`: Inspect packed orders waiting for final payment.
  * `getDispatchSummary`: 7-day movement and dispatch velocity recap.
  * `searchProducts`: Keyword search across names, SKUs, and bay locations.
* **Action Tools & Human-in-the-Loop Confirmation**:
  * `recordPayment`: Creates a staging action in memory with a 5-minute TTL. The UI renders an interactive confirmation card. The database transaction is committed **only when the Admin clicks "Confirm"**.

### 4.6. Order Fulfillment State Machine
```text
[ PROCESSING ]
      │  (Advance payment recorded)
      ▼
[ ADVANCE_RECEIVED ]
      │  (Admin clicks "Start / Complete Packing")
      ▼
[ PACKED ]
      │  (Full balance paid + sufficient stock verified)
      ▼
[ DISPATCHED ] (Stock atomically deducted via Mongo transaction)
```
* At any stage prior to dispatch, orders can transition to `CANCELLED`.

---

## 5. Repository File Structure

```text
AI-Warehouse-System/
├── ai-model/                          # Computer Vision Microservice (FastAPI + YOLO)
│   ├── api.py                         # FastAPI server with /predict and health routes
│   ├── requirements.txt               # Python dependencies (fastapi, uvicorn, ultralytics)
│   ├── test.py                        # Standalone OpenCV test script
│   ├── train.py                       # YOLO training pipeline
│   ├── best.pt                        # Trained YOLO model weights (ignored by git)
│   ├── .env.example                   # Vision configuration template
│   └── dataset/                       # Mechanical tools YOLO dataset
│       ├── data.yaml                  # Class labels (drill, hammer, pliers, screwdriver, wrench)
│       ├── train/
│       ├── valid/
│       └── test/
├── backend/                           # Express 5 & Mongoose Warehouse REST API
│   ├── package.json
│   ├── .env.example                   # Backend environment template
│   └── src/
│       ├── server.js                  # App entry point, DB connection, & router mounting
│       ├── seed.js                    # Seed catalog products (Hammer, Drill, etc.)
│       ├── seedUsers.js               # Seed Admin and Staff user credentials
│       ├── seedMovements.js           # Seed realistic 30-day dispatch movements for telemetry
│       ├── config/
│       │   ├── database.js            # Mongoose connection logic
│       │   └── orderSettings.js       # Advance requirement ratios & payment modes
│       ├── middleware/
│       │   └── auth.js                # requireAuth & requireRole middlewares
│       ├── models/
│       │   ├── User.js                # Auth user schema (Admin / Staff)
│       │   ├── Product.js             # Inventory schema (SKU, stock, minStock, bay location)
│       │   ├── Order.js               # Order schema & state machine definitions
│       │   ├── Payment.js             # Transactional payment records
│       │   └── StockMovement.js       # Auditable receive/dispatch movement history
│       ├── routes/
│       │   ├── authRoutes.js          # /api/auth (login, /me)
│       │   ├── productRoutes.js       # /api/products (CRUD, receive, dispatch, reorder-suggestions)
│       │   ├── orderRoutes.js         # /api/orders (lifecycle, overdue-payments, reminders)
│       │   └── assistantRoutes.js     # /api/assistant (chat, confirm, cancel)
│       └── services/
│           ├── llm.js                 # Google GenAI (Gemini 2.5 Flash) client integration
│           ├── assistantTools.js      # Gemini tool declarations and execution handlers
│           └── pendingActions.js      # In-memory staging with TTL for destructive actions
├── frontend/warehouse-system/         # React 19 + TypeScript + Vite Dashboard
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   ├── .env.example
│   └── src/
│       ├── main.jsx                   # React root mount
│       ├── App.tsx                    # Main dashboard application & tab routing
│       ├── index.css                  # Tailwind CSS v4 design system
│       ├── context/
│       │   └── AuthContext.tsx        # Authentication state & session provider
│       ├── hooks/
│       │   └── useVoiceSettings.ts    # Voice recognition & TTS preferences hook
│       ├── components/
│       │   ├── LoginPage.tsx          # Authentication screen with demo role presets
│       │   ├── ProtectedRoute.tsx     # Route guard enforcing authentication
│       │   ├── SmartReorderCard.tsx   # 30-day stock burn rate and replenishment telemetry
│       │   ├── PaymentAlertsCard.tsx  # Overdue packed order sentinel & recovery
│       │   ├── WarehouseAssistant.tsx # Floating conversational AI assistant with voice/TTS
│       │   ├── WhatsAppPhoneModal.tsx # WhatsApp phone number prompt and sender
│       │   └── ui/                    # Base UI layout and sidebar components
│       └── lib/
│           ├── api.ts                 # Authenticated API client (JWT header injection)
│           ├── format.ts              # Currency (₹ INR), date helpers, phone validators
│           ├── utils.ts               # Tailwind class merger (clsx + twMerge)
│           ├── voice.ts               # Web Speech API recognition & speech synthesis
│           └── whatsapp.ts            # WhatsApp message builder and link generator
├── .gitignore
└── README.md
```

---

## 6. Complete Installation & Setup Guide

### 6.1. Prerequisites

Make sure the following are installed on your host system:
1. **Node.js**: v20+ or v22+ LTS (`node -v`, `npm -v`).
2. **Python**: Python 3.10, 3.11, or 3.12 (`python --version`).
3. **MongoDB**: MongoDB Community Server running locally on port 27017, or a MongoDB Atlas connection string.
4. **Google Gemini API Key**: Free API key from [Google AI Studio](https://aistudio.google.com).
5. **YOLO Model Weights**: Place your trained `best.pt` file inside the `ai-model/` folder.

---

### 6.2. Step-by-Step Setup

Open a terminal (e.g. PowerShell on Windows) and run each service in its own terminal tab:

#### Terminal 1 — Backend Setup & Launch
```powershell
cd backend
npm install
Copy-Item .env.example .env

# Edit backend/.env to add your GEMINI_API_KEY and verify MONGO_URI

# Seed the database
node src/seed.js                 # Seeds default tools (Drill, Hammer, Pliers, etc.)
npm run seed:users               # Seeds Admin & Staff credentials
npm run seed:demo-movements      # Seeds 30-day dispatch history for reorder telemetry

# Start the Express server
npm run dev
```
*Backend runs on: `http://localhost:5000`*

---

#### Terminal 2 — AI Computer Vision Service
```powershell
cd ai-model

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env

# Verify that best.pt is present in ai-model/
# Start the FastAPI vision service
python -m uvicorn api:app --host 127.0.0.1 --port 8001
```
*Vision service runs on: `http://127.0.0.1:8001`*

---

#### Terminal 3 — Frontend Control Center
```powershell
cd frontend\warehouse-system
npm install
Copy-Item .env.example .env

# Start the Vite development server
npm run dev
```
*Frontend opens at: `http://localhost:5173`*

---

## 7. Default Seed Credentials

When `npm run seed:users` is executed, the following accounts are initialized:

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@warehouse.local` | `adminpassword123` | Full access: Packing, Dispatches, Cancellations, Confirming AI Payments |
| **Staff Member** | `staff@warehouse.local` | `staffpassword123` | Operational access: Scanning, Receiving, Order Creation, Read-only AI Assistant |

---

## 8. Environment Variables Reference

### `backend/.env`
```ini
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/nexus_wms
JWT_SECRET=super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=8h
REORDER_COVER_DAYS=30
REMINDER_AFTER_DAYS=3
GEMINI_API_KEY=your_gemini_api_key_from_ai_studio
GEMINI_MODEL=gemini-2.5-flash

# Seed configurations
ADMIN_NAME="Admin User"
ADMIN_EMAIL=admin@warehouse.local
ADMIN_PASSWORD=adminpassword123
STAFF_NAME="Staff User"
STAFF_EMAIL=staff@warehouse.local
STAFF_PASSWORD=staffpassword123
```

### `frontend/warehouse-system/.env`
```ini
VITE_API_URL=http://localhost:5000/api
VITE_AI_API_URL=http://127.0.0.1:8001
```

### `ai-model/.env`
```ini
AI_MODEL_PATH=.\best.pt
AI_CONFIDENCE=0.70
AI_DEBUG_DETECTIONS=false
AI_SCAN_X_MIN=0.20
AI_SCAN_X_MAX=0.80
AI_SCAN_Y_MIN=0.15
AI_SCAN_Y_MAX=0.85
AI_MIN_BOX_WIDTH_RATIO=0.05
AI_MIN_BOX_HEIGHT_RATIO=0.05
AI_MIN_BOX_AREA_RATIO=0.01
AI_MAX_BOX_AREA_RATIO=0.80
```

---

## 9. API Endpoint Reference

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticate user, returns JWT and user payload |
| `GET` | `/api/auth/me` | Authenticated | Retrieve profile of currently authenticated user |

### Products & Inventory (`/api/products`)
| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Authenticated | List all catalog products |
| `POST` | `/api/products` | Authenticated | Create a new product entry |
| `GET` | `/api/products/dashboard` | Authenticated | Dashboard metric counts and recent movement logs |
| `GET` | `/api/products/reorder-suggestions` | Authenticated | 30-day predictive burn-rate telemetry & reorder quantities |
| `PATCH` | `/api/products/:id/receive` | Authenticated | Increment stock by 1 unit and log `RECEIVE` movement |
| `PATCH` | `/api/products/:id/dispatch` | Authenticated | Decrement stock and log `DISPATCH` movement |
| `POST` | `/api/products/dispatch/transaction` | Authenticated | Transactionally dispatch multiple line items |
| `GET` | `/api/products/movements/history` | Authenticated | Filter and inspect auditable stock movements |

### Orders & Invoicing (`/api/orders`)
| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/orders` | Authenticated | Create new dispatch order with client metadata |
| `GET` | `/api/orders` | Authenticated | List orders with optional status query filter |
| `GET` | `/api/orders/overdue-payments` | Authenticated | List packed orders with pending balance past grace period |
| `GET` | `/api/orders/payments/history` | Authenticated | Global ledger of all recorded payments |
| `GET` | `/api/orders/:id` | Authenticated | Fetch specific order details, payments, and reminders |
| `POST` | `/api/orders/:id/payments` | Authenticated | Record an advance, partial, or full payment |
| `POST` | `/api/orders/:id/reminders` | Authenticated | Log a WhatsApp or manual payment reminder attempt |
| `PATCH` | `/api/orders/:id/pack` | Admin Only | Transition order to `PACKED` (validates advance payment) |
| `PATCH` | `/api/orders/:id/dispatch` | Admin Only | Transactionally deduct stock and mark `DISPATCHED` |
| `PATCH` | `/api/orders/:id/cancel` | Admin Only | Cancel order prior to dispatch |

### AI Warehouse Assistant (`/api/assistant`)
| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/assistant/chat` | Authenticated | Send user query; invokes Gemini 2.5 Flash with tool calling |
| `POST` | `/api/assistant/confirm` | Admin Only | Confirm and execute a pending payment action token |
| `POST` | `/api/assistant/cancel` | Authenticated | Cancel and expire a pending action token |

### AI Computer Vision (`http://127.0.0.1:8001`)
| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Public | Vision service health, model path, threshold, scan region |
| `POST` | `/predict` | Public | Upload frame (`multipart/form-data`) and receive detections |

---

## 10. Verification & Health Checks

Run these commands in PowerShell to verify system health across all components:

```powershell
# 1. Check AI Computer Vision Service
Invoke-RestMethod http://127.0.0.1:8001/

# 2. Check Backend REST API Health
Invoke-RestMethod http://localhost:5000/

# 3. Verify Frontend TypeScript Compilation (0 errors expected)
cd frontend\warehouse-system
npx tsc --noEmit

# 4. Verify Frontend Production Build
npm run build
```

---

## 11. Product Catalog

The default warehouse catalog is configured with the following baseline items:

| Product | SKU | Initial Stock | Safety Minimum | Storage Bay |
| :--- | :---: | :---: | :---: | :--- |
| **Cordless Drill** | `DRL001` | 10 | 3 | Rack A - Shelf 01 |
| **Claw Hammer** | `HAM001` | 20 | 5 | Rack A - Shelf 02 |
| **Slip-Joint Pliers** | `PLR001` | 15 | 5 | Rack B - Shelf 01 |
| **Precision Screwdriver** | `SCR001` | 25 | 5 | Rack B - Shelf 02 |
| **Adjustable Wrench** | `WRC001` | 15 | 5 | Rack C - Shelf 01 |

---

## 12. License & Attribution

* **Dataset**: Mechanical Tools Dataset provided by Roboflow under **CC BY 4.0**.
* **Model**: YOLO11 architecture by Ultralytics.
* **Icons**: Tabler Icons & Lucide Icons.
