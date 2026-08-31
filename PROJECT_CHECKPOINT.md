# THAI AMULET AI — PROJECT CHECKPOINT

## Project
Name: thai-amulet-ai
Path: C:\Users\maxim\thai-amulet-ai

## Current Development Step
Current Step: 36.12F-5C
Current Status: PASS

## Completed Steps

### STEP 36.12F-5B — ORDER API CHECK
Status: PASS

Verified:
- Next.js Server: localhost:3000
- Product API: GET /api/products → working
- Order API: POST /api/orders → working
- SQLite database: working
- Order record persisted
- Order items persisted
- Stock decrease worked
- Transaction completed successfully

Test Order created during verification:
- Order ID: 1
- Order Number: TEST-36-12F-5B-1788074006313
- Product ID: 4
- Quantity: 1
- Price: 299
- Cost: 100
- Total: 299
- Status: pending

IMPORTANT:
The above test created a real database order and decreased Product ID 4 stock from 50 to 49.
Do NOT repeat the same test unnecessarily.

### STEP 36.12F-5C — OPEN DEV SERVER
Status: PASS

Verified:
- Next.js 16.3.2
- Turbopack
- Local: http://localhost:3000
- Network: http://172.20.10.12:3000
- GET / → 200
- Dev Server is currently running

## NEXT STEP
STEP 36.12F-5D

IMPORTANT:
5D has NOT been completed in this chat yet unless confirmed by a later checkpoint.

## PowerShell Workflow Rules

1. PowerShell commands must be provided ONLY inside code blocks.
2. Never put "Windows PowerShell..." or explanatory text inside a PowerShell code block.
3. User should copy ONLY the commands inside the code block.
4. Do not make the user repeat completed steps.
5. Before changing code, inspect the relevant files first.
6. Do not guess the next STEP when the exact STEP sequence is available.
7. After each important STEP, update this checkpoint.

## Development Server Rule

Keep the PowerShell window running:
    pnpm dev

Expected:
    http://localhost:3000

Do not close the Dev Server window while performing API/UI tests.

## Current Known Architecture

- Next.js 16.3.2
- Turbopack
- TypeScript
- SQLite
- better-sqlite3
- Database:
  data/thai-amulet.db
- Order API:
  src/app/api/orders/route.ts
- Order logic:
  src/lib/orders.ts
- Database module:
  src/lib/db.ts

## Migration / Chat Continuity Rule

When moving to another ChatGPT conversation:

1. Read PROJECT_CHECKPOINT.md first.
2. Identify Current Development Step.
3. Do not repeat steps marked PASS.
4. Continue from NEXT STEP.
5. Preserve all IMPORTANT notes.
6. If the checkpoint conflicts with chat history, verify the actual project files/runtime before changing anything.

## Last Verified Runtime

Dev Server:
RUNNING

Local URL:
http://localhost:3000

Last verified response:
GET / 200
