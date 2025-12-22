// In production (Docker), API is proxied through nginx at /api
// In development, API runs on localhost:3000
const API_BASE_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3000';

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

// Auth API
export const authApi = {
  requestCode: (username: string) =>
    request<{ message: string; code?: string }>('/auth/request-code', {
      method: 'POST',
      body: { username },
    }),

  verifyCode: (username: string, code: string) =>
    request<{ accessToken: string; user: { id: string; username: string } }>('/auth/verify-code', {
      method: 'POST',
      body: { username, code },
    }),
};

// Rooms API
export const roomsApi = {
  getRooms: (token: string, all?: boolean) =>
    request<Array<{
      id: string;
      name: string;
      createdAt: string;
      createdBy: { id: string; username: string };
      memberCount: number;
      joinedAt?: string;
      lastSeenAt?: string;
    }>>(`/rooms${all ? '?all=true' : ''}`, { token }),

  createRoom: (token: string, name: string) =>
    request<{
      id: string;
      name: string;
      createdAt: string;
      createdBy: { id: string; username: string };
      memberCount: number;
    }>('/rooms', {
      method: 'POST',
      body: { name },
      token,
    }),

  joinRoom: (token: string, roomId: string) =>
    request<{
      id: string;
      name: string;
      createdAt: string;
      createdBy: { id: string; username: string };
      memberCount: number;
      joinedAt: string;
    }>(`/rooms/${roomId}/join`, {
      method: 'POST',
      token,
    }),

  getMessages: (token: string, roomId: string, options?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.before) params.set('before', options.before);
    if (options?.limit) params.set('limit', options.limit.toString());
    const query = params.toString();
    return request<Array<{
      messageId: string;
      roomId: string;
      text: string;
      createdAt: string;
      sender: { id: string; username: string };
      replyTo?: { id: string; text: string; sender: { id: string; username: string } } | null;
      reactions?: Array<{ emoji: string; count: number; users: Array<{ id: string; username: string }> }>;
    }>>(`/rooms/${roomId}/messages${query ? `?${query}` : ''}`, { token });
  },
};

// Users API
export const usersApi = {
  getMyProfile: (token: string) =>
    request<{
      id: string;
      username: string;
      displayName?: string;
      bio?: string;
      avatarColor?: string;
      status?: string;
      createdAt: string;
    }>('/users/me', { token }),

  updateMyProfile: (token: string, data: {
    displayName?: string;
    bio?: string;
    avatarColor?: string;
    status?: string;
  }) =>
    request<{
      id: string;
      username: string;
      displayName?: string;
      bio?: string;
      avatarColor?: string;
      status?: string;
      createdAt: string;
    }>('/users/me', {
      method: 'PUT',
      body: data,
      token,
    }),

  getProfile: (token: string, username: string) =>
    request<{
      id: string;
      username: string;
      displayName?: string;
      bio?: string;
      avatarColor?: string;
      status?: string;
      createdAt: string;
    }>(`/users/${username}`, { token }),

  searchUsers: (token: string, query: string) =>
    request<Array<{
      id: string;
      username: string;
      displayName?: string;
      avatarColor?: string;
    }>>(`/users/search?q=${encodeURIComponent(query)}`, { token }),
};

// DM API
export const dmApi = {
  getConversations: (token: string) =>
    request<Array<{
      id: string;
      otherUser: {
        id: string;
        username: string;
        displayName?: string;
        avatarColor?: string;
      };
      lastMessage: {
        id: string;
        text: string;
        createdAt: string;
        senderId: string;
        readAt?: string;
      } | null;
      unreadCount: number;
      updatedAt: string;
    }>>('/dm/conversations', { token }),

  startConversation: (token: string, userId: string) =>
    request<{
      id: string;
      otherUser: {
        id: string;
        username: string;
        displayName?: string;
        avatarColor?: string;
      };
      createdAt: string;
    }>(`/dm/conversations/${userId}`, {
      method: 'POST',
      token,
    }),

  getConversation: (token: string, conversationId: string) =>
    request<{
      id: string;
      otherUser: {
        id: string;
        username: string;
        displayName?: string;
        avatarColor?: string;
      };
      createdAt: string;
    }>(`/dm/conversations/${conversationId}`, { token }),

  getMessages: (token: string, conversationId: string, options?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.before) params.set('before', options.before);
    if (options?.limit) params.set('limit', options.limit.toString());
    const query = params.toString();
    return request<Array<{
      id: string;
      conversationId: string;
      senderId: string;
      receiverId: string;
      text: string;
      createdAt: string;
      readAt?: string;
      sender: {
        id: string;
        username: string;
        displayName?: string;
        avatarColor?: string;
      };
      replyTo?: {
        id: string;
        text: string;
        sender: { id: string; username: string };
      } | null;
    }>>(`/dm/conversations/${conversationId}/messages${query ? `?${query}` : ''}`, { token });
  },

  markAsRead: (token: string, conversationId: string) =>
    request<{ success: boolean }>(`/dm/conversations/${conversationId}/read`, {
      method: 'POST',
      token,
    }),

  getUnreadCount: (token: string, conversationId?: string) =>
    conversationId
      ? request<{ count: number }>(`/dm/conversations/${conversationId}/unread`, { token })
      : request<{ count: number }>('/dm/unread', { token }),
};

// Reactions API
export const reactionsApi = {
  getEmojis: (token: string) =>
    request<{ emojis: string[] }>('/messages/emojis', { token }),

  getReactions: (token: string, messageId: string) =>
    request<Array<{ emoji: string; count: number; users: Array<{ id: string; username: string }> }>>(
      `/messages/${messageId}/reactions`,
      { token }
    ),

  addReaction: (token: string, messageId: string, emoji: string) =>
    request<{ id: string; messageId: string; userId: string; emoji: string }>(
      `/messages/${messageId}/reactions`,
      {
        method: 'POST',
        body: { emoji },
        token,
      }
    ),

  removeReaction: (token: string, messageId: string, emoji: string) =>
    request<{ success: boolean }>(
      `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      {
        method: 'DELETE',
        token,
      }
    ),
};
