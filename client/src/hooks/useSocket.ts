import { useState, useEffect, useCallback, useRef } from 'react';
import { socketService } from '../services/socket';
import type { Message, RoomSystemEvent, UserPresence, Room, TypingUser } from '../types';

const PING_INTERVAL = 15000; // 15 seconds
const LAST_SEEN_KEY = 'chatket_last_seen';
const TYPING_TIMEOUT = 3000; // 3 seconds

interface UseSocketOptions {
  token: string | null;
  rooms: Room[];
}

export function useSocket({ token, rooms }: UseSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Map<string, Message[]>>(new Map());
  const [rosters, setRosters] = useState<Map<string, UserPresence[]>>(new Map());
  const [systemEvents, setSystemEvents] = useState<RoomSystemEvent[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser[]>>(new Map());
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRoomsRef = useRef<Set<string>>(new Set());

  // Load last seen times from storage
  const getLastSeenTimes = useCallback((): Map<string, string> => {
    const stored = localStorage.getItem(LAST_SEEN_KEY);
    return stored ? new Map(JSON.parse(stored)) : new Map();
  }, []);

  // Save last seen time
  const saveLastSeenTime = useCallback((roomId: string, time: string) => {
    const times = getLastSeenTimes();
    times.set(roomId, time);
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(Array.from(times.entries())));
  }, [getLastSeenTimes]);

  // Connect to socket
  useEffect(() => {
    if (!token) {
      socketService.disconnect();
      setIsConnected(false);
      return;
    }

    socketService.connect(token)
      .then(() => {
        setIsConnected(true);
        // Sync rooms on connect
        if (rooms.length > 0) {
          const lastSeenTimes = getLastSeenTimes();
          const syncPayload = rooms.map((room) => ({
            roomId: room.id,
            lastSeenAt: lastSeenTimes.get(room.id) || room.lastSeenAt || new Date(0).toISOString(),
          }));
          socketService.syncRooms(syncPayload);
        }
      })
      .catch((error) => {
        console.error('Failed to connect:', error);
        setIsConnected(false);
      });

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [token, rooms, getLastSeenTimes]);

  // Set up event listeners
  useEffect(() => {
    const unsubMessage = socketService.onMessage((message) => {
      setMessages((prev) => {
        const newMap = new Map(prev);
        const roomMessages = newMap.get(message.roomId) || [];
        
        // Check for duplicate
        if (!roomMessages.some((m) => m.messageId === message.messageId)) {
          newMap.set(message.roomId, [...roomMessages, message]);
          // Update last seen time
          saveLastSeenTime(message.roomId, message.createdAt);
        }
        
        return newMap;
      });
    });

    const unsubSystem = socketService.onSystemEvent((event) => {
      setSystemEvents((prev) => {
        // Prevent duplicate system events (same type, user, room within 2 seconds)
        const isDuplicate = prev.some(
          (e) =>
            e.type === event.type &&
            e.roomId === event.roomId &&
            e.user?.id === event.user?.id &&
            Math.abs(new Date(e.createdAt).getTime() - new Date(event.createdAt).getTime()) < 2000
        );
        if (isDuplicate) return prev;
        return [...prev.slice(-99), event]; // Keep last 100
      });
    });

    const unsubRoster = socketService.onRoster((event) => {
      setRosters((prev) => {
        const newMap = new Map(prev);
        newMap.set(event.roomId, event.users);
        return newMap;
      });
    });

    const unsubConnection = socketService.onConnectionChange((connected) => {
      setIsConnected(connected);
      if (connected && rooms.length > 0) {
        // Re-sync on reconnect
        const lastSeenTimes = getLastSeenTimes();
        const syncPayload = rooms.map((room) => ({
          roomId: room.id,
          lastSeenAt: lastSeenTimes.get(room.id) || room.lastSeenAt || new Date(0).toISOString(),
        }));
        socketService.syncRooms(syncPayload);
      }
    });

    const unsubTyping = socketService.onTyping((event) => {
      setTypingUsers((prev) => {
        const newMap = new Map(prev);
        const roomTyping = newMap.get(event.roomId) || [];
        
        if (event.isTyping) {
          // Add or update typing user
          const existingIndex = roomTyping.findIndex((u) => u.id === event.user.id);
          const typingUser: TypingUser = {
            id: event.user.id,
            username: event.user.username,
            startedAt: Date.now(),
          };
          
          if (existingIndex >= 0) {
            roomTyping[existingIndex] = typingUser;
          } else {
            roomTyping.push(typingUser);
          }
          newMap.set(event.roomId, [...roomTyping]);
        } else {
          // Remove typing user
          newMap.set(event.roomId, roomTyping.filter((u) => u.id !== event.user.id));
        }
        
        return newMap;
      });
    });

    return () => {
      unsubMessage();
      unsubSystem();
      unsubRoster();
      unsubConnection();
      unsubTyping();
    };
  }, [rooms, getLastSeenTimes, saveLastSeenTime]);

  // Clean up stale typing indicators
  useEffect(() => {
    typingTimeoutRef.current = setInterval(() => {
      setTypingUsers((prev) => {
        const newMap = new Map(prev);
        const now = Date.now();
        
        for (const [roomId, users] of newMap.entries()) {
          const filtered = users.filter((u) => now - u.startedAt < TYPING_TIMEOUT);
          if (filtered.length !== users.length) {
            newMap.set(roomId, filtered);
          }
        }
        
        return newMap;
      });
    }, 1000);

    return () => {
      if (typingTimeoutRef.current) {
        clearInterval(typingTimeoutRef.current);
      }
    };
  }, []);

  // Ping for presence
  useEffect(() => {
    if (!isConnected) return;

    pingIntervalRef.current = setInterval(() => {
      activeRoomsRef.current.forEach((roomId) => {
        socketService.ping(roomId);
      });
    }, PING_INTERVAL);

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [isConnected]);

  const joinRoom = useCallback(async (roomId: string) => {
    const lastSeenTimes = getLastSeenTimes();
    const lastSeenAt = lastSeenTimes.get(roomId);
    await socketService.joinRoom(roomId, lastSeenAt);
    activeRoomsRef.current.add(roomId);
  }, [getLastSeenTimes]);

  const leaveRoom = useCallback(async (roomId: string) => {
    await socketService.leaveRoom(roomId);
    activeRoomsRef.current.delete(roomId);
  }, []);

  const sendMessage = useCallback(async (roomId: string, text: string, clientMsgId: string, replyToId?: string) => {
    const result = await socketService.sendMessage(roomId, text, clientMsgId, replyToId);
    return result;
  }, []);

  const getRoomMessages = useCallback((roomId: string) => {
    return messages.get(roomId) || [];
  }, [messages]);

  const getRoomRoster = useCallback((roomId: string) => {
    return rosters.get(roomId) || [];
  }, [rosters]);

  const setRoomMessages = useCallback((roomId: string, newMessages: Message[]) => {
    setMessages((prev) => {
      const newMap = new Map(prev);
      newMap.set(roomId, newMessages);
      return newMap;
    });
  }, []);

  const sendTyping = useCallback((roomId: string, isTyping: boolean) => {
    socketService.sendTyping(roomId, isTyping);
  }, []);

  const getTypingUsers = useCallback((roomId: string) => {
    return typingUsers.get(roomId) || [];
  }, [typingUsers]);

  return {
    isConnected,
    messages,
    rosters,
    systemEvents,
    typingUsers,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendTyping,
    getRoomMessages,
    getRoomRoster,
    getTypingUsers,
    setRoomMessages,
  };
}
