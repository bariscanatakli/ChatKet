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
```mermaid
flowchart TB
  subgraph Client["Client Browser"]
    ClientSpa["React SPA (Vite)"]
    LoginForm["LoginForm"]
    RoomList["RoomList"]
    ChatRoom["ChatRoom"]
    SocketService["Socket Service"]
    LoginForm --> ClientSpa
    RoomList --> ClientSpa
    ChatRoom --> ClientSpa
    SocketService --> ClientSpa
  end

  subgraph Nginx["Nginx Reverse Proxy"]
    NginxProxy["Nginx"]
    StaticFiles["Static file serving (React build)"]
    ApiProxy["/api/* -> NestJS server:3000/"]
    WsProxy["/socket.io/* -> NestJS server:3000/socket.io/"]
    DocsProxy["/docs/* -> Swagger UI (server:3000/docs/)"]
    NginxGzip["Gzip compression, security headers, caching"]
    NginxProxy --> StaticFiles
    NginxProxy --> ApiProxy
    NginxProxy --> WsProxy
    NginxProxy --> DocsProxy
    NginxProxy --> NginxGzip
  end

  subgraph Server["NestJS Server"]
    NestCore["NestJS Core"]
    AuthModule["Auth Module"]
    RoomsModule["Rooms Module"]
    ChatModule["Chat Module"]
    PrismaModule["Prisma Module"]
    PrismaOrm["Prisma ORM"]
    NestCore --> AuthModule
    NestCore --> RoomsModule
    NestCore --> ChatModule
    NestCore --> PrismaModule
    PrismaModule --> PrismaOrm
  end

  Database["PostgreSQL 15"]
  Tables["Users, LoginCodes, Rooms, RoomMemberships, Messages, Dedupe"]

  ClientSpa -->|HTTP /api/*| NginxProxy
  ClientSpa -->|WebSocket /socket.io/*| NginxProxy
  NginxProxy --> NestCore
  PrismaOrm --> Database
  Database --> Tables
```

### Data Flow Diagram
```mermaid
sequenceDiagram
  participant Client
  participant Server
  participant DB as Database

  Client->>Server: POST /auth/request-code
  Server->>DB: Find/Create user
  DB-->>Server: user
  Server->>DB: Store hashed code
  DB-->>Server: ok
  Server-->>Client: { code: "123456" }

  Client->>Server: POST /auth/verify-code
  Server->>DB: Verify code hash
  DB-->>Server: ok
  Server-->>Client: { accessToken, user }

  Client->>Server: WebSocket connect { auth: { token } }
  Server->>Server: Verify JWT

  Client->>Server: rooms:sync
  Server->>DB: Verify memberships
  DB-->>Server: missed messages
  Server-->>Client: missed messages

  Client->>Server: message:send
  Server->>Server: Rate limit check
  Server->>DB: Dedupe check
  DB-->>Server: ok
  Server->>DB: Store message
  DB-->>Server: messageId
  Server-->>Client: ACK { messageId }
  Server-->>Client: message:new (broadcast)
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

```mermaid
flowchart TB
  Root["beatair/"]
  ANotes["architecture-notes.md (This document)"]
  DockerCompose["docker-compose.yml (Container orchestration)"]
  EnvExample[".env.example (Environment variables template)"]
  Readme["README.md (Quick start guide)"]

  Root --> ANotes
  Root --> DockerCompose
  Root --> EnvExample
  Root --> Readme

  ServerDir["server/ (NestJS Backend)"]
  ClientDir["client/ (React Frontend)"]
  Root --> ServerDir
  Root --> ClientDir

  ServerDockerfile["Dockerfile (Multi-stage production build)"]
  ServerEntrypoint["docker-entrypoint.sh (DB migration runner)"]
  ServerPackage["package.json"]
  ServerTsconfig["tsconfig.json"]
  NestCli["nest-cli.json"]
  ServerDir --> ServerDockerfile
  ServerDir --> ServerEntrypoint
  ServerDir --> ServerPackage
  ServerDir --> ServerTsconfig
  ServerDir --> NestCli

  PrismaDir["prisma/"]
  PrismaSchema["schema.prisma (Database schema)"]
  ServerDir --> PrismaDir
  PrismaDir --> PrismaSchema

  ServerSrc["src/"]
  ServerDir --> ServerSrc
  ServerMain["main.ts (App bootstrap + Swagger setup)"]
  AppModule["app.module.ts (Root module)"]
  AppController["app.controller.ts (Health check endpoint)"]
  ServerSrc --> ServerMain
  ServerSrc --> AppModule
  ServerSrc --> AppController

  AuthDir["auth/ (Authentication module)"]
  RoomsDir["rooms/ (Room management module)"]
  ChatDir["chat/ (Real-time chat module)"]
  PrismaModuleDir["prisma/ (Database module)"]
  ServerSrc --> AuthDir
  ServerSrc --> RoomsDir
  ServerSrc --> ChatDir
  ServerSrc --> PrismaModuleDir

  AuthModuleFile["auth.module.ts"]
  AuthControllerFile["auth.controller.ts (POST /auth/request-code, verify-code)"]
  AuthServiceFile["auth.service.ts (Code generation, JWT signing)"]
  AuthDtoDir["dto/ (Request validation DTOs)"]
  AuthGuardsDir["guards/ (JWT auth guard)"]
  AuthStrategiesDir["strategies/ (Passport JWT strategy)"]
  AuthDir --> AuthModuleFile
  AuthDir --> AuthControllerFile
  AuthDir --> AuthServiceFile
  AuthDir --> AuthDtoDir
  AuthDir --> AuthGuardsDir
  AuthDir --> AuthStrategiesDir

  RoomsModuleFile["rooms.module.ts"]
  RoomsControllerFile["rooms.controller.ts (CRUD room endpoints)"]
  RoomsServiceFile["rooms.service.ts (Room and membership logic)"]
  RoomsDtoDir["dto/ (Room DTOs)"]
  RoomsDir --> RoomsModuleFile
  RoomsDir --> RoomsControllerFile
  RoomsDir --> RoomsServiceFile
  RoomsDir --> RoomsDtoDir

  ChatModuleFile["chat.module.ts"]
  ChatGatewayFile["chat.gateway.ts (Socket.IO gateway)"]
  ChatServiceFile["chat.service.ts (Message CRUD, deduplication)"]
  MessagesControllerFile["messages.controller.ts (GET /rooms/:id/messages)"]
  RateLimitFile["rate-limit.service.ts (Sliding window rate limiter)"]
  PresenceFile["presence.service.ts (Online/offline tracking)"]
  ChatDir --> ChatModuleFile
  ChatDir --> ChatGatewayFile
  ChatDir --> ChatServiceFile
  ChatDir --> MessagesControllerFile
  ChatDir --> RateLimitFile
  ChatDir --> PresenceFile

  PrismaModuleFile["prisma.module.ts"]
  PrismaServiceFile["prisma.service.ts (Prisma client wrapper)"]
  PrismaModuleDir --> PrismaModuleFile
  PrismaModuleDir --> PrismaServiceFile

  ClientDockerfile["Dockerfile (Multi-stage build with Nginx)"]
  NginxConf["nginx.conf (Nginx reverse proxy config)"]
  ClientPackage["package.json"]
  ViteConfig["vite.config.ts"]
  TailwindConfig["tailwind.config.js"]
  ClientTsconfig["tsconfig.json"]
  IndexHtml["index.html"]
  ClientDir --> ClientDockerfile
  ClientDir --> NginxConf
  ClientDir --> ClientPackage
  ClientDir --> ViteConfig
  ClientDir --> TailwindConfig
  ClientDir --> ClientTsconfig
  ClientDir --> IndexHtml

  ClientSrc["src/"]
  ClientDir --> ClientSrc
  ClientMain["main.tsx (React entry point)"]
  AppTsx["App.tsx (Main app component)"]
  IndexCss["index.css (Tailwind imports)"]
  ClientSrc --> ClientMain
  ClientSrc --> AppTsx
  ClientSrc --> IndexCss

  ComponentsDir["components/"]
  HooksDir["hooks/"]
  ServicesDir["services/"]
  TypesDir["types/"]
  ClientSrc --> ComponentsDir
  ClientSrc --> HooksDir
  ClientSrc --> ServicesDir
  ClientSrc --> TypesDir

  ComponentsIndex["index.ts (Re-exports)"]
  LoginFormComp["LoginForm.tsx (Auth UI)"]
  RoomListComp["RoomList.tsx (Room sidebar)"]
  ChatRoomComp["ChatRoom.tsx (Chat messages UI)"]
  ComponentsDir --> ComponentsIndex
  ComponentsDir --> LoginFormComp
  ComponentsDir --> RoomListComp
  ComponentsDir --> ChatRoomComp

  UseAuth["useAuth.ts (Auth state management)"]
  UseSocket["useSocket.ts (Socket.IO connection and events)"]
  HooksDir --> UseAuth
  HooksDir --> UseSocket

  ApiClient["api.ts (REST API client)"]
  SocketClient["socket.ts (Socket.IO service)"]
  ServicesDir --> ApiClient
  ServicesDir --> SocketClient

  TypesIndex["index.ts (TypeScript interfaces)"]
  TypesDir --> TypesIndex
```

---

## Authentication Architecture

### Flow Diagram
```mermaid
sequenceDiagram
  participant Client
  participant Server
  participant DB as Database

  Client->>Server: POST /auth/request-code { username: "alice" }
  Server->>DB: Find user by username
  DB-->>Server: user or none
  alt User not found
    Server->>DB: Create user
    DB-->>Server: created
  end
  Server->>Server: Generate 6-digit code, hash, set expiry
  Server->>DB: Store code hash (10 min)
  DB-->>Server: ok
  Server-->>Client: { message, code: "123456" } (demo)

  Client->>Server: POST /auth/verify-code { username: "alice", code: "123456" }
  Server->>DB: Find valid codes
  DB-->>Server: codes
  Server->>Server: bcrypt.compare and mark used
  Server->>DB: Mark code as used
  DB-->>Server: ok
  Server->>Server: Sign JWT { sub, username, exp }
  Server-->>Client: { accessToken, user }

  Client->>Server: WebSocket handshake { auth: { token: JWT } }
  Server->>Server: Verify JWT, attach user to socket
  Server-->>Client: Connection established
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
```mermaid
flowchart TB
  subgraph Client["Client"]
    C1["1. User types message, clicks Send"]
    C2["2. Generate UUID (clientMsgId) - key for idempotency"]
    C3["3. Show message with 'sending...' status"]
    C4["4. Emit message:send with ACK callback"]
    C5["5. Receive ACK, update status to delivered"]
    C6["6. Receive message:new event"]
    C7["7. Deduplicate by messageId (prevents showing twice)"]
    C1 --> C2 --> C3 --> C4
  end

  subgraph Server["Server"]
    S1["Validate user authenticated (socket.data.user)"]
    S2["Verify room membership (roomsService.isMember)"]
    S3["Check rate limit (rateLimitService.checkAndRecord)"]
    S4["Check dedupe table for clientMsgId"]
    S5["Create message + dedupe record in transaction"]
    S6["Broadcast message:new to all room members"]
    S7["Return ACK with messageId to sender"]
    S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7
  end

  C4 --> S1
  S7 --> C5
  S6 --> C6 --> C7
```

### Why clientMsgId?

**Problem**: Network unreliability causes duplicate messages
```mermaid
flowchart LR
  A["Client sends message"] --> B["Network drops"]
  B --> C["Client reconnects"]
  C --> D["Client retries"]
  D --> E["Without deduplication: message appears twice"]
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
```mermaid
erDiagram
  USER {
    string id PK
    string username "UQ"
    datetime createdAt
    datetime updatedAt
  }
  LOGIN_CODE {
    string id PK
    string username FK
    string codeHash
    datetime expiresAt
    boolean used
    datetime createdAt
  }
  ROOM {
    string id PK
    string name
    string createdById FK
    datetime createdAt
    datetime updatedAt
  }
  ROOM_MEMBERSHIP {
    string id PK
    string roomId FK
    string userId FK
    datetime joinedAt
    datetime lastSeenAt
  }
  MESSAGE {
    string id PK
    string roomId FK
    string userId FK
    string text
    datetime createdAt
  }
  MESSAGE_DEDUPE {
    string id PK
    string roomId FK
    string userId FK
    string clientMsgId
    string messageId FK
  }

  USER ||--o{ LOGIN_CODE : "auth codes"
  USER ||--o{ ROOM : "createdRooms"
  USER ||--o{ ROOM_MEMBERSHIP : "memberships"
  USER ||--o{ MESSAGE : "messages"
  ROOM ||--o{ ROOM_MEMBERSHIP : "memberships"
  ROOM ||--o{ MESSAGE : "messages"
  MESSAGE ||--|| MESSAGE_DEDUPE : "dedupe"
  USER ||--o{ MESSAGE_DEDUPE : "dedupe"
  ROOM ||--o{ MESSAGE_DEDUPE : "dedupe"
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

```mermaid
flowchart TB
  Config["Rate Limiting Configuration"]
  Window["Window: 10 seconds"]
  Limit["Limit: 5 messages per user per room"]
  Penalty["Violation penalty: 30-second mute"]
  Config --> Window
  Config --> Limit
  Config --> Penalty
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
```mermaid
flowchart TB
  Step1["1. Client connected -> online"]
  Step2["2. Client sends ping -> refresh lastPing timestamp"]
  Step3["3. No ping for 30 sec -> offline (periodic check)"]
  Step4["4. Socket disconnects -> immediate offline"]
  Step1 --> Step2 --> Step3 --> Step4
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
```mermaid
sequenceDiagram
  participant Client
  participant Server
  Client->>Server: presence:ping { roomId } (every 15 sec)
  Server->>Server: Update lastPing
  Server->>Server: Check if room changed
  Server-->>Client: { success: true }
```

---

## Reconnection & Recovery

### Client-Side Flow
```mermaid
flowchart TB
  A["1. Socket.IO detects disconnect"]
  B["2. Automatic reconnection (exponential backoff)"]
  B1["reconnectionDelay: 1000ms<br/>reconnectionDelayMax: 5000ms<br/>maxReconnectAttempts: 10"]
  C["3. On connect event"]
  D["4. Client emits rooms:sync with last known state"]
  Payload["rooms: [ { roomId: abc, lastSeenAt: ... }, { roomId: def, lastSeenAt: ... } ]"]
  E["5. Server processes each room:<br/>Verify membership<br/>Join socket to room<br/>Fetch messages since lastSeenAt (max 100)<br/>Emit missed messages<br/>Emit current roster"]
  F["6. Client merges messages (dedupe by messageId)"]
  G["7. UI updates with recovered state"]

  A --> B --> C --> D --> E --> F --> G
  B --> B1
  D --> Payload
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
```mermaid
flowchart TB
  subgraph Net["Docker Network: beatair-network"]
    Postgres["postgres (PostgreSQL)<br/>Port: 5432 (internal)<br/>Volume: postgres_data"]
    Server["server (NestJS)<br/>Port: 3000 (internal)<br/>Entrypoint: prisma migrate, start server"]
    Client["client (Nginx + React)<br/>Port: 80 (exposed)<br/>Routes:<br/>/api/* -> server<br/>/socket.io/* -> server<br/>/docs/* -> server<br/>/* -> static files"]
    Postgres <-->|DATABASE_URL| Server
    Client -->|proxy_pass| Server
  end
  Internet["Internet"]
  Client -->|Port 80| Internet
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
```mermaid
flowchart TB
  subgraph Single["Single Server"]
    Rate["Rate Limit (in-memory)"]
    Presence["Presence (in-memory)"]
    Socket["Socket.IO Server"]
  end
  DB["PostgreSQL"]
  Socket --> DB
```

### Horizontal Scaling (Future with Redis)
```mermaid
flowchart TB
  LB["Load Balancer (sticky/hash)"]
  S1["Server 1"]
  S2["Server 2"]
  S3["Server 3"]
  Redis["Redis (pub/sub, rate limit, presence)"]
  DB["PostgreSQL"]

  LB --> S1
  LB --> S2
  LB --> S3
  S1 --> Redis
  S2 --> Redis
  S3 --> Redis
  S1 --> DB
  S2 --> DB
  S3 --> DB
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
