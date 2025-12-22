# ChatKet Architecture Notes

> **Author**: Barış Can Ataklı  
> **Date**: December 2024  
> **Version**: 2.0 (Open Source Release)

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Design Decisions & Trade-offs](#design-decisions--trade-offs)
5. [Project Structure](#project-structure)
6. [Authentication Architecture](#authentication-architecture)
7. [Real-time Messaging Architecture](#real-time-messaging-architecture)
8. [Data Model](#data-model)
9. [Anti-abuse Systems](#anti-abuse-systems)
10. [Reconnection & Recovery](#reconnection--recovery)
11. [Socket Events Contract](#socket-events-contract)
12. [Deployment Architecture](#deployment-architecture)
13. [API Documentation](#api-documentation)
14. [Security Considerations](#security-considerations)
15. [Scalability Path](#scalability-path)
16. [Production Improvements](#production-improvements)

---

## Overview

ChatKet is an open-source real-time chat system demonstrating modern web architecture patterns. The system supports:

- **Authentication**: One-time code + JWT based auth
- **Rooms**: Create, discover, and join chat rooms
- **Real-time Messaging**: Socket.IO powered WebSocket communication
- **Message Deduplication**: Idempotent message delivery with client-generated IDs
- **Rate Limiting**: 5 messages per 10 seconds with 30s mute on violation
- **Presence Tracking**: Online/offline status with heartbeat mechanism
- **Reconnection Recovery**: Automatic sync of missed messages on reconnect

### Architecture Principles

| Principle | Implementation |
|-----------|----------------|
| **Separation of Concerns** | REST for CRUD, WebSocket for real-time events |
| **Stateless Auth** | JWT tokens valid for both HTTP and WebSocket |
| **Idempotency** | Client-generated message IDs prevent duplicates |
| **Graceful Degradation** | Socket.IO fallback to polling if WebSocket fails |
| **Containerization** | Docker Compose for reproducible deployments |

---

## System Architecture

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────────────┐
│                           Client Browser                             │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      React SPA (Vite)                           ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐││
│  │  │LoginForm │  │ RoomList │  │ ChatRoom │  │ Socket Service   │││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                 HTTP (/api/*) │ WebSocket (/socket.io/*)
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                         Nginx Reverse Proxy                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ • Static file serving (React build)                             ││
│  │ • /api/* → NestJS server:3000/                                  ││
│  │ • /socket.io/* → NestJS server:3000/socket.io/                  ││
│  │ • /docs/* → Swagger UI (server:3000/docs/)                      ││
│  │ • Gzip compression, security headers, caching                   ││
│  └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                         NestJS Server                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                     Modular Architecture                         ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐││
│  │  │   Auth   │  │  Rooms   │  │   Chat   │  │     Prisma       │││
│  │  │  Module  │  │  Module  │  │  Module  │  │     Module       │││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘││
│  │        │             │             │               │            ││
│  │        └─────────────┴──────┬──────┴───────────────┘            ││
│  │                             │                                    ││
│  │  ┌──────────────────────────▼──────────────────────────────────┐││
│  │  │                    Prisma ORM                               │││
│  │  └──────────────────────────┬──────────────────────────────────┘││
│  └─────────────────────────────┼───────────────────────────────────┘│
└────────────────────────────────┼────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                         PostgreSQL 15                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  Users │ LoginCodes │ Rooms │ RoomMemberships │ Messages │ Dedupe│
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram
```
┌──────────┐                    ┌──────────────┐                ┌────────────┐
│  Client  │                    │    Server    │                │  Database  │
└────┬─────┘                    └──────┬───────┘                └─────┬──────┘
     │                                 │                              │
     │ 1. POST /auth/request-code     │                              │
     │───────────────────────────────>│                              │
     │                                 │ Find/Create User            │
     │                                 │────────────────────────────>│
     │                                 │<────────────────────────────│
     │ { code: "123456" }             │ Store hashed code           │
     │<───────────────────────────────│────────────────────────────>│
     │                                 │                              │
     │ 2. POST /auth/verify-code      │                              │
     │───────────────────────────────>│ Verify code hash            │
     │                                 │────────────────────────────>│
     │ { accessToken, user }          │<────────────────────────────│
     │<───────────────────────────────│                              │
     │                                 │                              │
     │ 3. WebSocket connect           │                              │
     │══════════════════════════════=>│                              │
     │   { auth: { token } }          │ Verify JWT                  │
     │                                 │                              │
     │ 4. rooms:sync                  │                              │
     │───────────────────────────────>│ Verify memberships          │
     │                                 │────────────────────────────>│
     │ missed messages                │<────────────────────────────│
     │<───────────────────────────────│                              │
     │                                 │                              │
     │ 5. message:send                │                              │
     │───────────────────────────────>│ Rate limit check            │
     │                                 │ Dedupe check                │
     │                                 │────────────────────────────>│
     │                                 │ Store message               │
     │                                 │────────────────────────────>│
     │ ACK { messageId }              │<────────────────────────────│
     │<───────────────────────────────│                              │
     │                                 │                              │
     │ message:new (broadcast)        │                              │
     │<═══════════════════════════════│                              │
     │                                 │                              │
```

---

## Technology Stack

### Backend (Server)

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | Node.js | 20 LTS | JavaScript runtime |
| Framework | NestJS | 10.x | Modular backend framework |
| WebSocket | Socket.IO | 4.x | Real-time bidirectional communication |
| ORM | Prisma | 5.x | Type-safe database access |
| Database | PostgreSQL | 15 | Relational data storage |
| Auth | JWT + bcrypt | - | Stateless authentication |
| Validation | class-validator | - | DTO validation |
| Docs | Swagger/OpenAPI | - | API documentation |

### Frontend (Client)

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | React | 18.x | UI library |
| Build Tool | Vite | 5.x | Fast development & builds |
| Language | TypeScript | 5.x | Type safety |
| Styling | Tailwind CSS | 3.x | Utility-first CSS |
| WebSocket | socket.io-client | 4.x | Socket.IO client |
| State | React Hooks | - | Local state management |

### Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| Containerization | Docker | Application packaging |
| Orchestration | Docker Compose | Multi-container management |
| Reverse Proxy | Nginx | Static serving, routing, SSL termination |
| Database | PostgreSQL 15-alpine | Persistent data storage |

---

## Design Decisions & Trade-offs

### 1. NestJS over Express
**Decision**: Use NestJS instead of plain Express  
**Rationale**: 
- Built-in module system for clean separation (auth, rooms, chat)
- First-class TypeScript support with decorators
- Integrated WebSocket gateway with @nestjs/platform-socket.io
- Dependency injection for testability
- Built-in validation with class-validator

**Trade-off**: More boilerplate than Express, steeper learning curve

### 2. Socket.IO over Native WebSocket
**Decision**: Use Socket.IO instead of ws library  
**Rationale**:
- Built-in room management (`socket.join()`, `socket.to()`)
- ACK callbacks for message delivery confirmation
- Automatic reconnection with exponential backoff
- Fallback to HTTP long-polling for problematic networks
- Namespace support for future extensions

**Trade-off**: Larger client bundle (~40KB gzipped), not pure WebSocket protocol

### 3. In-Memory Rate Limiting & Presence
**Decision**: Store rate limits and presence in memory, not Redis  
**Rationale**:
- Simpler deployment for single-instance scenarios
- No additional infrastructure dependencies
- Sufficient for demonstration purposes
- Code structured for easy Redis migration

**Trade-off**: State lost on server restart, doesn't scale horizontally without Redis

### 4. Message Deduplication in Database
**Decision**: Store `clientMsgId` in database for deduplication  
**Rationale**:
- Survives server restarts (vs in-memory)
- Prevents duplicates even after reconnection
- Database unique constraint handles race conditions
- Enables idempotent retries

**Trade-off**: Extra DB write per message (could use Redis for hot path)

### 5. One-Time Code Authentication
**Decision**: Username + 6-digit code instead of password  
**Rationale**:
- Simpler for demo/testing (no password management)
- Code returned in response for easy development testing
- Mimics modern "magic link" authentication flows

**Trade-off**: Not production-ready without email/SMS integration

### 6. Nginx as Reverse Proxy
**Decision**: Use Nginx in front of NestJS  
**Rationale**:
- Efficient static file serving for React build
- Single entry point (port 80)
- WebSocket upgrade handling
- Gzip compression, caching headers
- Security headers (X-Frame-Options, etc.)
- Easy SSL/TLS termination

**Trade-off**: Additional container, slight complexity

---

## Project Structure

```
beatair/
├── architecture-notes.md          # This document
├── docker-compose.yml             # Container orchestration
├── .env.example                   # Environment variables template
├── README.md                      # Quick start guide
│
├── server/                        # NestJS Backend
│   ├── Dockerfile                 # Multi-stage production build
│   ├── docker-entrypoint.sh       # DB migration runner
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   │
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   │
│   └── src/
│       ├── main.ts                # App bootstrap + Swagger setup
│       ├── app.module.ts          # Root module
│       ├── app.controller.ts      # Health check endpoint
│       │
│       ├── auth/                  # Authentication module
│       │   ├── auth.module.ts
│       │   ├── auth.controller.ts # POST /auth/request-code, verify-code
│       │   ├── auth.service.ts    # Code generation, JWT signing
│       │   ├── dto/               # Request validation DTOs
│       │   ├── guards/            # JWT auth guard
│       │   └── strategies/        # Passport JWT strategy
│       │
│       ├── rooms/                 # Room management module
│       │   ├── rooms.module.ts
│       │   ├── rooms.controller.ts # CRUD room endpoints
│       │   ├── rooms.service.ts   # Room & membership logic
│       │   └── dto/               # Room DTOs
│       │
│       ├── chat/                  # Real-time chat module
│       │   ├── chat.module.ts
│       │   ├── chat.gateway.ts    # Socket.IO gateway (WebSocket handlers)
│       │   ├── chat.service.ts    # Message CRUD, deduplication
│       │   ├── messages.controller.ts # GET /rooms/:id/messages
│       │   ├── rate-limit.service.ts  # Sliding window rate limiter
│       │   └── presence.service.ts    # Online/offline tracking
│       │
│       └── prisma/                # Database module
│           ├── prisma.module.ts
│           └── prisma.service.ts  # Prisma client wrapper
│
└── client/                        # React Frontend
    ├── Dockerfile                 # Multi-stage build with Nginx
    ├── nginx.conf                 # Nginx reverse proxy config
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── tsconfig.json
    ├── index.html
    │
    └── src/
        ├── main.tsx               # React entry point
        ├── App.tsx                # Main app component
        ├── index.css              # Tailwind imports
        │
        ├── components/
        │   ├── index.ts           # Re-exports
        │   ├── LoginForm.tsx      # Auth UI
        │   ├── RoomList.tsx       # Room sidebar
        │   └── ChatRoom.tsx       # Chat messages UI
        │
        ├── hooks/
        │   ├── useAuth.ts         # Auth state management
        │   └── useSocket.ts       # Socket.IO connection & events
        │
        ├── services/
        │   ├── api.ts             # REST API client
        │   └── socket.ts          # Socket.IO service
        │
        └── types/
            └── index.ts           # TypeScript interfaces
```

---

## Authentication Architecture

### Flow Diagram
```
┌─────────────────────────────────────────────────────────────────────┐
│                    Authentication Flow                               │
└─────────────────────────────────────────────────────────────────────┘

  Client                              Server                    Database
    │                                    │                          │
    │  POST /auth/request-code           │                          │
    │  { username: "alice" }             │                          │
    │───────────────────────────────────>│                          │
    │                                    │  Find user by username   │
    │                                    │─────────────────────────>│
    │                                    │<─────────────────────────│
    │                                    │                          │
    │                                    │  If not exists, create   │
    │                                    │─────────────────────────>│
    │                                    │<─────────────────────────│
    │                                    │                          │
    │                                    │  Generate 6-digit code   │
    │                                    │  Hash with bcrypt        │
    │                                    │  Store with 10min expiry │
    │                                    │─────────────────────────>│
    │                                    │<─────────────────────────│
    │                                    │                          │
    │  { message, code: "123456" }       │  (Code in response for   │
    │<───────────────────────────────────│   demo purposes)         │
    │                                    │                          │
    │                                    │                          │
    │  POST /auth/verify-code            │                          │
    │  { username: "alice",              │                          │
    │    code: "123456" }                │                          │
    │───────────────────────────────────>│                          │
    │                                    │  Find valid codes        │
    │                                    │─────────────────────────>│
    │                                    │<─────────────────────────│
    │                                    │                          │
    │                                    │  bcrypt.compare()        │
    │                                    │  Mark code as used       │
    │                                    │─────────────────────────>│
    │                                    │                          │
    │                                    │  Sign JWT token          │
    │                                    │  { sub, username, exp }  │
    │                                    │                          │
    │  { accessToken, user }             │                          │
    │<───────────────────────────────────│                          │
    │                                    │                          │
    │                                    │                          │
    │  WebSocket handshake               │                          │
    │  { auth: { token: JWT } }          │                          │
    │═══════════════════════════════════>│                          │
    │                                    │  Verify JWT              │
    │                                    │  Attach user to socket   │
    │                                    │                          │
    │  Connection established            │                          │
    │<═══════════════════════════════════│                          │
```

### JWT Payload Structure
```typescript
{
  sub: "cuid_user_id",     // User's unique ID (subject)
  username: "alice",       // For display without DB lookup
  iat: 1703203200,         // Issued at (Unix timestamp)
  exp: 1703808000          // Expires in 7 days
}
```

### Security Measures
- Password/code hashing with bcrypt (10 salt rounds)
- Code expiry (10 minutes)
- Single-use codes (marked as used after verification)
- Previous codes invalidated on new request
- JWT secret from environment variable
- Token verification on every WebSocket connection

---

## Real-time Messaging Architecture

### Message Lifecycle
```
┌─────────────────────────────────────────────────────────────────────┐
│                    Message Send Flow                                 │
└─────────────────────────────────────────────────────────────────────┘

1. User types message, clicks Send
2. Client generates UUID (clientMsgId) ←── Key for idempotency
3. Client shows message with "sending..." status
4. Client emits 'message:send' with ACK callback
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Server receives message:send                                         │
│                                                                      │
│  1. Validate user authenticated (socket.data.user)                  │
│  2. Verify room membership (roomsService.isMember)                  │
│  3. Check rate limit (rateLimitService.checkAndRecord)              │
│     - If muted → return error with mutedUntil                       │
│     - If limit exceeded → apply 30s mute, return error              │
│  4. Check dedupe table for clientMsgId                              │
│     - If exists → return existing messageId (idempotent)            │
│  5. Create message + dedupe record in transaction                   │
│  6. Broadcast 'message:new' to all room members                     │
│  7. Return ACK with messageId to sender                             │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
5. Client receives ACK, updates message status to "delivered"
6. All room members receive 'message:new' event
7. Client deduplicates by messageId (prevents showing twice)
```

### Why clientMsgId?

**Problem**: Network unreliability causes duplicate messages
```
Client sends message → Network drops → Client reconnects → Client retries
Without deduplication: Message appears twice in chat
```

**Solution**: Client-generated unique ID
```typescript
// Client generates ID before sending
const clientMsgId = crypto.randomUUID();

// Server stores mapping
model MessageDedupe {
  roomId      String
  userId      String
  clientMsgId String    // Client's UUID
  messageId   String    // Server's message ID
  
  @@unique([roomId, userId, clientMsgId])  // Unique constraint
}

// On retry with same clientMsgId:
// → Return existing messageId (idempotent response)
```

### Message Format
```typescript
// Sent by client
interface MessageSendPayload {
  roomId: string;
  text: string;
  clientMsgId: string;  // UUID generated by client
}

// Broadcast to room
interface MessageNew {
  messageId: string;
  roomId: string;
  text: string;
  createdAt: string;    // ISO 8601
  sender: {
    id: string;
    username: string;
  };
}

// ACK to sender
interface MessageAck {
  success: boolean;
  messageId?: string;
  error?: string;
  mutedUntil?: string;  // If rate limited
  isDuplicate?: boolean;
}
```

---

## Data Model

### Entity Relationship Diagram
```
┌──────────────────────┐         ┌──────────────────────┐
│        User          │         │      LoginCode       │
├──────────────────────┤         ├──────────────────────┤
│ id         (PK) cuid │───┐     │ id         (PK) cuid │
│ username   (UQ) str  │   │     │ username   (FK) str  │───┐
│ createdAt       time │   │     │ codeHash        str  │   │
│ updatedAt       time │   │     │ expiresAt       time │   │
└──────────────────────┘   │     │ used            bool │   │
         │                 │     │ createdAt       time │   │
         │                 │     └──────────────────────┘   │
         │                 └────────────────────────────────┘
         │
         │ 1:N (createdRooms)
         │ 1:N (memberships)
         │ 1:N (messages)
         ▼
┌──────────────────────┐         ┌──────────────────────┐
│        Room          │◄────────│   RoomMembership     │
├──────────────────────┤   N:1   ├──────────────────────┤
│ id         (PK) cuid │         │ id         (PK) cuid │
│ name            str  │         │ roomId     (FK) str  │
│ createdById (FK) str │         │ userId     (FK) str  │
│ createdAt       time │         │ joinedAt        time │
│ updatedAt       time │         │ lastSeenAt      time │
└──────────────────────┘         └──────────────────────┘
         │                        @@unique([roomId, userId])
         │
         │ 1:N
         ▼
┌──────────────────────┐         ┌──────────────────────┐
│       Message        │◄────────│    MessageDedupe     │
├──────────────────────┤   1:1   ├──────────────────────┤
│ id         (PK) cuid │         │ id         (PK) cuid │
│ roomId     (FK) str  │         │ roomId     (FK) str  │
│ userId     (FK) str  │         │ userId     (FK) str  │
│ text            str  │         │ clientMsgId     str  │
│ createdAt       time │         │ messageId  (FK) str  │
└──────────────────────┘         └──────────────────────┘
  @@index([roomId, createdAt])    @@unique([roomId, userId, clientMsgId])
```

### Database Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| User | `username` (unique) | Login lookup |
| LoginCode | `[username, expiresAt]` | Find valid codes |
| Room | `createdById` | User's created rooms |
| RoomMembership | `[roomId, userId]` (unique) | Membership lookup |
| RoomMembership | `roomId` | Room's members |
| RoomMembership | `userId` | User's rooms |
| Message | `[roomId, createdAt]` | Paginated history |
| Message | `userId` | User's messages |
| MessageDedupe | `[roomId, userId, clientMsgId]` (unique) | Deduplication |

---

## Anti-abuse Systems

### Rate Limiting

**Algorithm**: Sliding Window Counter

```
Configuration:
- Window: 10 seconds
- Limit: 5 messages per user per room
- Violation penalty: 30-second mute
```

**Implementation**:
```typescript
interface RateLimitEntry {
  timestamps: number[];     // Message times in current window
  mutedUntil: number | null; // Mute expiry timestamp
}

// Pseudocode
function checkAndRecord(userId: string, roomId: string): RateLimitResult {
  const key = `${userId}:${roomId}`;
  const now = Date.now();
  
  let entry = rateLimitMap.get(key);
  
  // Check if currently muted
  if (entry?.mutedUntil && now < entry.mutedUntil) {
    return { allowed: false, mutedUntil: new Date(entry.mutedUntil) };
  }
  
  // Clear expired mute
  if (entry?.mutedUntil && now >= entry.mutedUntil) {
    entry.mutedUntil = null;
    entry.timestamps = [];
  }
  
  // Slide window - keep only last 10 seconds
  const windowStart = now - WINDOW_MS;
  entry.timestamps = entry.timestamps.filter(t => t > windowStart);
  
  // Check limit
  if (entry.timestamps.length >= MAX_MESSAGES) {
    entry.mutedUntil = now + MUTE_DURATION_MS;
    return { allowed: false, mutedUntil: new Date(entry.mutedUntil) };
  }
  
  // Record message
  entry.timestamps.push(now);
  return { allowed: true, remaining: MAX_MESSAGES - entry.timestamps.length };
}
```

**Client Notification**:
```typescript
// On rate limit exceeded, server emits to user
socket.emit('room:system', {
  type: 'muted',
  roomId: 'xxx',
  until: '2024-12-22T12:00:30.000Z'
});

// ACK also includes mute info
{
  success: false,
  error: 'Rate limit exceeded. You are muted for 30 seconds.',
  mutedUntil: '2024-12-22T12:00:30.000Z'
}
```

### Presence Tracking

**States**: `online` | `offline`

**Mechanism**:
```
1. Client connected      → online
2. Client sends ping     → refresh lastPing timestamp
3. No ping for 30 sec    → offline (detected by periodic check)
4. Socket disconnects    → immediate offline
```

**Data Structure**:
```typescript
// Per-user presence
presenceMap: Map<userId, {
  lastPing: number;       // Last heartbeat timestamp
  socketId: string;       // Current socket connection
  roomIds: Set<string>;   // Rooms user is in
}>

// Per-room membership  
roomUsers: Map<roomId, Set<userId>>

// Reverse lookup for disconnect handling
socketToUser: Map<socketId, userId>
```

**Heartbeat Flow**:
```
Client (every 15 sec)                Server
    │                                   │
    │  presence:ping { roomId }         │
    │──────────────────────────────────>│
    │                                   │ Update lastPing
    │                                   │ Check if room changed
    │  { success: true }                │
    │<──────────────────────────────────│
```

---

## Reconnection & Recovery

### Client-Side Flow
```
┌─────────────────────────────────────────────────────────────────────┐
│                   Reconnection Recovery                              │
└─────────────────────────────────────────────────────────────────────┘

1. Socket.IO detects disconnect
   │
2. Automatic reconnection (built-in exponential backoff)
   │ - reconnectionDelay: 1000ms
   │ - reconnectionDelayMax: 5000ms
   │ - maxReconnectAttempts: 10
   │
3. On 'connect' event:
   │
4. Client emits 'rooms:sync' with last known state
   │ ┌────────────────────────────────────────────┐
   │ │ {                                          │
   │ │   rooms: [                                 │
   │ │     { roomId: "abc", lastSeenAt: "..." },  │
   │ │     { roomId: "def", lastSeenAt: "..." }   │
   │ │   ]                                        │
   │ │ }                                          │
   │ └────────────────────────────────────────────┘
   │
5. Server processes each room:
   │ - Verify membership
   │ - Join socket to room
   │ - Fetch messages since lastSeenAt (max 100)
   │ - Emit missed messages
   │ - Emit current roster
   │
6. Client merges messages (dedupe by messageId)
   │
7. UI updates with recovered state
```

### localStorage Persistence
```typescript
// Key: beatair_last_seen
// Value (JSON):
{
  "room_abc": "2024-12-22T11:30:00.000Z",
  "room_def": "2024-12-22T11:45:00.000Z"
}

// Updated on every new message received
// Survives browser refresh
// Enables recovery even after full page reload
```

### Server-Side Recovery Logic
```typescript
@SubscribeMessage('rooms:sync')
async handleRoomsSync(client, payload: RoomSyncPayload) {
  const results = [];
  
  for (const room of payload.rooms) {
    // 1. Verify membership
    const isMember = await roomsService.isMember(user.id, room.roomId);
    if (!isMember) continue;
    
    // 2. Join socket to room
    client.join(room.roomId);
    presenceService.joinRoom(user.id, room.roomId);
    
    // 3. Fetch missed messages
    const lastSeenAt = new Date(room.lastSeenAt);
    const missedMessages = await chatService.getMessagesSince(
      room.roomId,
      lastSeenAt,
      100  // Max 100 messages
    );
    
    // 4. Send missed messages to client
    for (const msg of missedMessages) {
      client.emit('message:new', msg);
    }
    
    // 5. Send current roster
    await sendRosterToClient(client, room.roomId);
    
    results.push({ roomId: room.roomId, synced: true });
  }
  
  // 6. Broadcast roster updates (user is back online)
  for (const room of payload.rooms) {
    await broadcastRoster(room.roomId);
  }
  
  return { success: true, results };
}
```

---

## Socket Events Contract

### Client → Server Events

| Event | Payload | Response (ACK) | Description |
|-------|---------|----------------|-------------|
| `rooms:sync` | `{ rooms: [{ roomId, lastSeenAt }] }` | `{ success, results }` | Reconnect & sync state |
| `room:join` | `{ roomId, lastSeenAt? }` | `{ success }` | Join room's live feed |
| `room:leave` | `{ roomId }` | `{ success }` | Leave room's live feed |
| `message:send` | `{ roomId, text, clientMsgId }` | `{ success, messageId }` | Send message |
| `typing:update` | `{ roomId, isTyping }` | - | Typing indicator |
| `presence:ping` | `{ roomId }` | - | Heartbeat |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ messageId, roomId, text, createdAt, sender }` | New message in room |
| `room:system` | `{ type, roomId, user?, until? }` | System notification (join/leave/muted) |
| `room:roster` | `{ roomId, users[] }` | Online users update |
| `typing:update` | `{ roomId, user, isTyping }` | User typing status |

### Detailed Payload Schemas

```typescript
// ─────────────────────────────────────────
// CLIENT → SERVER
// ─────────────────────────────────────────

// rooms:sync
interface RoomsSyncPayload {
  rooms: Array<{
    roomId: string;
    lastSeenAt: string;  // ISO 8601
  }>;
}

// room:join
interface RoomJoinPayload {
  roomId: string;
  lastSeenAt?: string;  // For fetching missed messages
}

// room:leave
interface RoomLeavePayload {
  roomId: string;
}

// message:send
interface MessageSendPayload {
  roomId: string;
  text: string;          // Max 500 chars
  clientMsgId: string;   // Client-generated UUID
}

// typing:update (Client → Server)
interface TypingUpdatePayload {
  roomId: string;
  isTyping: boolean;
}

// presence:ping
interface PresencePingPayload {
  roomId: string;
}

// ─────────────────────────────────────────
// SERVER → CLIENT
// ─────────────────────────────────────────

// message:new
interface MessageNew {
  messageId: string;
  roomId: string;
  text: string;
  createdAt: string;  // ISO 8601
  sender: {
    id: string;
    username: string;
  };
}

// room:system
interface RoomSystem {
  type: 'join' | 'leave' | 'muted';
  roomId: string;
  user?: {
    id: string;
    username: string;
  };
  createdAt: string;
  until?: string;  // Only for 'muted' type
}

// room:roster
interface RoomRoster {
  roomId: string;
  users: Array<{
    id: string;
    username: string;
    status: 'online' | 'offline';
  }>;
}

// typing:update (Server → Client)
interface TypingUpdate {
  roomId: string;
  user: {
    id: string;
    username: string;
  };
  isTyping: boolean;
}

// ─────────────────────────────────────────
// ACK RESPONSES
// ─────────────────────────────────────────

// Generic success
interface SuccessAck {
  success: true;
}

// Generic error
interface ErrorAck {
  success: false;
  error: string;
}

// message:send ACK
interface MessageAck {
  success: boolean;
  messageId?: string;
  error?: string;
  mutedUntil?: string;
  isDuplicate?: boolean;
}

// rooms:sync ACK
interface RoomsSyncAck {
  success: boolean;
  results: Array<{
    roomId: string;
    synced: boolean;
    messageCount?: number;
  }>;
}
```

---

## Deployment Architecture

### Docker Compose Setup
```yaml
services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: beatair-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-beatair}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-beatair_secret}
      POSTGRES_DB: ${POSTGRES_DB:-beatair}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U beatair -d beatair"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - beatair-network

  # NestJS Backend
  server:
    build: ./server
    container_name: beatair-server
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://beatair:beatair_secret@postgres:5432/beatair
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3000/health"]
      interval: 30s
      start_period: 10s
    networks:
      - beatair-network

  # React Frontend + Nginx
  client:
    build: ./client
    container_name: beatair-client
    ports:
      - "80:80"
    depends_on:
      server:
        condition: service_healthy
    networks:
      - beatair-network

volumes:
  postgres_data:

networks:
  beatair-network:
    driver: bridge
```

### Container Architecture
```
┌─────────────────────────────────────────────────────────────────────┐
│                      Docker Network: beatair-network                │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │    postgres     │  │     server      │  │       client        │ │
│  │  (PostgreSQL)   │  │    (NestJS)     │  │  (Nginx + React)    │ │
│  │                 │  │                 │  │                     │ │
│  │  Port: 5432     │  │  Port: 3000     │  │  Port: 80 (exposed) │ │
│  │  (internal)     │  │  (internal)     │  │                     │ │
│  │                 │  │                 │  │  Routes:            │ │
│  │  Volume:        │  │  Entrypoint:    │  │  /api/* → server    │ │
│  │  postgres_data  │  │  - Run prisma   │  │  /socket.io/*       │ │
│  │                 │  │    migrate      │  │    → server         │ │
│  │                 │  │  - Start server │  │  /docs/* → server   │ │
│  │                 │  │                 │  │  /* → static files  │ │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘ │
│           │                    │                      │            │
│           │    DATABASE_URL    │      proxy_pass      │            │
│           └────────────────────┼──────────────────────┘            │
│                                │                                    │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                            Port 80 ──────► Internet
```

### Nginx Configuration Highlights
```nginx
# API proxy (strips /api prefix)
location /api/ {
    proxy_pass http://server:3000/;
}

# Socket.IO with WebSocket upgrade
location /socket.io/ {
    proxy_pass http://server:3000/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# Swagger docs (^~ prevents regex override)
location ^~ /docs/ {
    proxy_pass http://server:3000/docs/;
}

# SPA fallback
location / {
    try_files $uri $uri/ /index.html;
}
```

### Multi-Stage Docker Builds

**Server Dockerfile**:
```dockerfile
# Build stage
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json prisma/ ./
RUN npm ci && npx prisma generate
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY prisma/ ./prisma/
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh ./
USER node
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
```

**Client Dockerfile**:
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

---

## API Documentation

### Swagger/OpenAPI

**Access URL**: `http://localhost/docs/`

**Features**:
- Interactive API testing
- Bearer token authentication
- Request/response examples
- WebSocket events documentation

### REST Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/auth/request-code` | No | Request login code |
| POST | `/auth/verify-code` | No | Verify code, get JWT |
| GET | `/rooms` | Yes | List user's rooms |
| GET | `/rooms?all=true` | Yes | List all rooms |
| POST | `/rooms` | Yes | Create new room |
| POST | `/rooms/:id/join` | Yes | Join existing room |
| GET | `/rooms/:id/messages` | Yes | Paginated message history |

### Example Requests

```bash
# Health check
curl http://localhost/api/health

# Request login code
curl -X POST http://localhost/api/auth/request-code \
  -H "Content-Type: application/json" \
  -d '{"username": "alice"}'
# Response: {"message":"Code generated successfully","code":"123456"}

# Verify code
curl -X POST http://localhost/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "code": "123456"}'
# Response: {"accessToken":"eyJhbG...","user":{"id":"...","username":"alice"}}

# Create room (with auth)
curl -X POST http://localhost/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbG..." \
  -d '{"name": "General"}'

# Get messages (with pagination)
curl "http://localhost/api/rooms/{roomId}/messages?limit=50&before={messageId}" \
  -H "Authorization: Bearer eyJhbG..."
```

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Unauthenticated WebSocket** | JWT verified on connection, socket rejected if invalid |
| **Unauthorized room access** | Membership checked before every room operation |
| **Message spam** | Rate limiting (5/10s), 30s mute on violation |
| **XSS in messages** | React auto-escapes, no `dangerouslySetInnerHTML` |
| **SQL Injection** | Prisma parameterized queries |
| **Brute force auth** | Code expiry (10 min), bcrypt hashing |
| **CORS** | Configured for known origins |
| **Clickjacking** | X-Frame-Options: SAMEORIGIN |
| **MIME sniffing** | X-Content-Type-Options: nosniff |
| **Input validation** | class-validator on all DTOs |
| **JWT exposure** | HttpOnly cookies recommended for production |

---

## Scalability Path

### Current State (Single Instance)
```
┌─────────────────────────────────────────────────────────────────────┐
│                        Single Server                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │   Rate Limit    │  │    Presence     │  │     Socket.IO       │ │
│  │   (in-memory)   │  │   (in-memory)   │  │      Server         │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
                      ┌─────────────────┐
                      │   PostgreSQL    │
                      └─────────────────┘
```

### Horizontal Scaling (Future with Redis)
```
                         ┌─────────────────┐
                         │  Load Balancer  │
                         │  (sticky/hash)  │
                         └────────┬────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           │                      │                      │
           ▼                      ▼                      ▼
     ┌──────────┐           ┌──────────┐           ┌──────────┐
     │ Server 1 │           │ Server 2 │           │ Server 3 │
     └────┬─────┘           └────┬─────┘           └────┬─────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
              ▼                                     ▼
       ┌─────────────┐                     ┌─────────────────┐
       │    Redis    │                     │   PostgreSQL    │
       │  (pub/sub,  │                     │                 │
       │  rate limit,│                     │                 │
       │  presence)  │                     │                 │
       └─────────────┘                     └─────────────────┘
```

### Redis Migration Points

1. **Socket.IO Adapter**
   ```typescript
   import { createAdapter } from '@socket.io/redis-adapter';
   io.adapter(createAdapter(pubClient, subClient));
   ```

2. **Rate Limiting** → Redis Sorted Sets
   ```redis
   ZADD ratelimit:user1:room1 <timestamp> <uuid>
   ZREMRANGEBYSCORE ratelimit:user1:room1 0 <10sec_ago>
   ZCARD ratelimit:user1:room1
   ```

3. **Presence** → Redis Hash + TTL
   ```redis
   HSET presence:user1 socketId <id> rooms <json>
   EXPIRE presence:user1 30
   PUBLISH presence:updates {userId, status, roomIds}
   ```

---

## Production Improvements

### High Priority

1. **Add Redis**
   - Move rate limiting and presence to Redis
   - Enable horizontal scaling with Socket.IO Redis adapter
   - Handle server restarts gracefully

2. **Proper Authentication**
   - Email/SMS code delivery integration
   - Refresh token rotation
   - HttpOnly cookies instead of localStorage
   - Account lockout after failed attempts

3. **Comprehensive Testing**
   - Unit tests for services
   - Integration tests for API endpoints
   - E2E tests for critical flows
   - Load testing for WebSocket connections

4. **Observability**
   - Structured logging (Pino/Winston)
   - Prometheus metrics
   - Distributed tracing (OpenTelemetry)
   - Error tracking (Sentry)

### Medium Priority

5. **Message Features**
   - Edit/delete messages
   - Emoji reactions
   - File attachments (S3 + presigned URLs)
   - Message threading/replies
   - Read receipts

6. **Performance**
   - Message caching (Redis)
   - Connection pooling (PgBouncer)
   - Cursor-based pagination
   - Message batching

7. **Security Hardening**
   - Auth endpoint rate limiting
   - CAPTCHA for suspicious activity
   - Content moderation
   - IP-based abuse detection

### Nice to Have

8. **Infrastructure**
   - Kubernetes deployment
   - CI/CD pipeline (GitHub Actions)
   - Blue-green deployments
   - Auto-scaling based on connections

9. **Features**
   - Push notifications
   - Typing indicators
   - User profiles & avatars
   - Room permissions (admin, moderator)
   - Private/direct messages

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `JWT_SECRET` | Yes | - | JWT signing secret (use strong random value) |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiry duration |
| `PORT` | No | `3000` | Server port |
| `POSTGRES_USER` | No | `beatair` | Database user |
| `POSTGRES_PASSWORD` | No | `beatair_secret` | Database password |
| `POSTGRES_DB` | No | `beatair` | Database name |

### Quick Start

```bash
# Clone and navigate
cd beatair

# Start all services
docker compose up -d

# Access application
open http://localhost          # Chat UI
open http://localhost/docs/    # API Documentation

# View logs
docker compose logs -f

# Stop services
docker compose down
```

---

## Conclusion

BeatAir demonstrates a production-minded approach to building real-time applications with:

- **Clean Architecture**: Modular NestJS structure with clear separation
- **Type Safety**: End-to-end TypeScript
- **Reliability**: Message deduplication, reconnection recovery
- **Scalability**: Code structured for easy Redis migration
- **Developer Experience**: Swagger docs, Docker Compose, hot reload

The codebase is designed for a single developer to maintain while being ready for a team to extend.

---

*Last updated: December 2024*
*Version: 2.0*
