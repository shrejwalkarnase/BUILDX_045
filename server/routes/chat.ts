import { Router, Request, Response } from 'express';
import { getAllChatMessages, insertChatMessage } from '../db.js';
import { broadcastSSE } from '../sse.js';

export const chatRouter = Router();

// GET /api/chat → ChatMessage[]
chatRouter.get('/', (req: Request, res: Response) => {
  try {
    const messages = getAllChatMessages();
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve chat messages', details: err.message });
  }
});

// POST /api/chat
chatRouter.post('/', (req: Request, res: Response) => {
  try {
    const { sender, sender_role, recipient, message, case_id } = req.body;

    if (!sender || !message) {
      return res.status(400).json({ error: 'sender and message are required fields' });
    }

    const newMsg = insertChatMessage({
      case_id: case_id || null,
      sender: sender.trim(),
      sender_role: sender_role || 'control',
      recipient: recipient || 'All',
      message: message.trim()
    });

    // Broadcast SSE "chat_message" with { data: newMsg }
    broadcastSSE('chat_message', newMsg);

    res.status(201).json({ success: true, message: newMsg });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to send chat message', details: err.message });
  }
});
