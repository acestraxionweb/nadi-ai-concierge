/**
 * Zayd — Minimal ChatGPT-style UI
 * Client Logic
 */

const CONFIG = {
  ENDPOINT: 'https://axyxymxrxyrpcnjfnrev.supabase.co/functions/v1/nadi-chat',
  BOT_SLUG: 'zayd',
  STORAGE_KEYS: {
    SESSIONS: 'nadi_chat_sessions',
    ACTIVE_ID: 'nadi_chat_active_id'
  }
};

class MinimalChatApp {
  constructor() {
    this.sessions = this.loadSessions();
    this.activeSessionId = localStorage.getItem(CONFIG.STORAGE_KEYS.ACTIVE_ID) || null;
    this.isGenerating = false;

    this.initElements();
    this.initEventListeners();
    this.renderHistoryList();

    if (this.activeSessionId && this.sessions[this.activeSessionId]) {
      this.loadSession(this.activeSessionId);
    } else {
      this.showEmptyState(true);
    }

    lucide.createIcons();
  }

  initElements() {
    this.sidebar = document.getElementById('sidebar');
    this.sidebarOverlay = document.getElementById('sidebarOverlay');
    this.sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
    this.sidebarOpenBtn = document.getElementById('sidebarOpenBtn');
    this.newChatBtn = document.getElementById('newChatBtn');
    this.newChatHeaderBtn = document.getElementById('newChatHeaderBtn');
    this.historyList = document.getElementById('historyList');

    this.messagesContainer = document.getElementById('messagesContainer');
    this.emptyState = document.getElementById('emptyState');
    this.messagesFeed = document.getElementById('messagesFeed');
    this.typingIndicator = document.getElementById('typingIndicator');

    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.toastContainer = document.getElementById('toastContainer');
  }

  initEventListeners() {
    // Sidebar toggle
    this.sidebarCollapseBtn.addEventListener('click', () => this.toggleSidebar(false));
    this.sidebarOpenBtn.addEventListener('click', () => this.toggleSidebar(true));
    this.sidebarOverlay.addEventListener('click', () => this.toggleSidebar(false));

    // New Chat
    this.newChatBtn.addEventListener('click', () => this.startNewChat());
    this.newChatHeaderBtn.addEventListener('click', () => this.startNewChat());

    // Input handlers
    this.messageInput.addEventListener('input', () => this.handleInputChange());
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.sendBtn.disabled && !this.isGenerating) {
          this.submitMessage();
        }
      }
    });

    this.sendBtn.addEventListener('click', () => this.submitMessage());

    // Quick Prompts
    document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt');
        if (prompt) {
          this.messageInput.value = prompt;
          this.handleInputChange();
          this.submitMessage();
        }
      });
    });
  }

  toggleSidebar(open) {
    if (window.innerWidth <= 768) {
      if (open) {
        this.sidebar.classList.add('open');
        this.sidebarOverlay.classList.add('active');
      } else {
        this.sidebar.classList.remove('open');
        this.sidebarOverlay.classList.remove('active');
      }
    } else {
      this.sidebar.classList.toggle('collapsed', !open);
    }
  }

  handleInputChange() {
    const val = this.messageInput.value.trim();
    this.sendBtn.disabled = val.length === 0 || this.isGenerating;

    // Auto-grow textarea
    this.messageInput.style.height = 'auto';
    this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 200) + 'px';
  }

  loadSessions() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SESSIONS)) || {};
    } catch {
      return {};
    }
  }

  saveSessions() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SESSIONS, JSON.stringify(this.sessions));
  }

  getActiveSession() {
    if (!this.activeSessionId) return null;
    return this.sessions[this.activeSessionId] || null;
  }

  startNewChat() {
    this.activeSessionId = 'chat_' + Date.now();
    this.sessions[this.activeSessionId] = {
      id: this.activeSessionId,
      conversationId: null,
      title: 'New chat',
      createdAt: new Date().toISOString(),
      messages: []
    };
    localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_ID, this.activeSessionId);
    this.saveSessions();
    this.renderHistoryList();
    this.messagesFeed.innerHTML = '';
    this.showEmptyState(true);
    this.messageInput.value = '';
    this.handleInputChange();
    this.toggleSidebar(false);
  }

  loadSession(sessionId) {
    const session = this.sessions[sessionId];
    if (!session) return;
    this.activeSessionId = sessionId;
    localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_ID, sessionId);

    this.messagesFeed.innerHTML = '';
    if (session.messages.length === 0) {
      this.showEmptyState(true);
    } else {
      this.showEmptyState(false);
      session.messages.forEach(msg => this.renderMessage(msg, false));
    }

    this.renderHistoryList();
    this.toggleSidebar(false);
    this.scrollToBottom();
  }

  showEmptyState(show) {
    if (show) {
      this.emptyState.classList.remove('hidden');
    } else {
      this.emptyState.classList.add('hidden');
    }
  }

  renderHistoryList() {
    this.historyList.innerHTML = '';
    const sorted = Object.values(this.sessions).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    sorted.forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item ${session.id === this.activeSessionId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="history-title">${session.title}</span>
        <button class="history-del-btn" title="Delete"><i data-lucide="trash-2"></i></button>
      `;

      item.querySelector('.history-title').addEventListener('click', () => {
        this.loadSession(session.id);
      });

      item.querySelector('.history-del-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        delete this.sessions[session.id];
        this.saveSessions();
        if (this.activeSessionId === session.id) {
          const remaining = Object.keys(this.sessions);
          if (remaining.length > 0) {
            this.loadSession(remaining[0]);
          } else {
            this.startNewChat();
          }
        } else {
          this.renderHistoryList();
        }
      });

      this.historyList.appendChild(item);
    });

    lucide.createIcons();
  }

  async submitMessage() {
    const text = this.messageInput.value.trim();
    if (!text || this.isGenerating) return;

    if (!this.activeSessionId || !this.sessions[this.activeSessionId]) {
      this.startNewChat();
    }

    const session = this.getActiveSession();
    this.showEmptyState(false);
    this.messageInput.value = '';
    this.handleInputChange();

    // User message
    const userMsg = {
      role: 'user',
      content: text
    };
    session.messages.push(userMsg);

    // Title assignment on 1st prompt
    if (session.messages.length === 1) {
      session.title = text.length > 28 ? text.substring(0, 28) + '...' : text;
    }

    this.renderMessage(userMsg, true);
    this.saveSessions();
    this.renderHistoryList();

    // Send to Edge Function
    await this.callEdgeFunction(text);
  }

  async callEdgeFunction(text) {
    const session = this.getActiveSession();
    this.isGenerating = true;
    this.sendBtn.disabled = true;
    this.typingIndicator.classList.remove('hidden');
    this.scrollToBottom();

    try {
      const payload = {
        message: text,
        bot_slug: CONFIG.BOT_SLUG
      };

      if (session.conversationId) {
        payload.conversation_id = session.conversationId;
      }

      const res = await fetch(CONFIG.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.conversation_id) {
        session.conversationId = data.conversation_id;
      }

      const assistantMsg = {
        role: 'assistant',
        content: data.reply || 'No response.'
      };

      session.messages.push(assistantMsg);
      this.saveSessions();
      this.renderMessage(assistantMsg, true);

    } catch (err) {
      const errorMsg = {
        role: 'assistant',
        content: `Error: ${err.message}. Please try again.`
      };
      session.messages.push(errorMsg);
      this.renderMessage(errorMsg, true);
    } finally {
      this.isGenerating = false;
      this.sendBtn.disabled = this.messageInput.value.trim().length === 0;
      this.typingIndicator.classList.add('hidden');
      this.scrollToBottom();
    }
  }

  renderMessage(msg, scroll = true) {
    const row = document.createElement('div');
    row.className = `msg-row ${msg.role}`;

    if (msg.role === 'user') {
      row.innerHTML = `<div class="msg-bubble-user">${this.escapeHtml(msg.content)}</div>`;
    } else {
      let parsed = '';
      if (typeof marked !== 'undefined') {
        marked.setOptions({ gfm: true, breaks: true });
        parsed = DOMPurify.sanitize(marked.parse(msg.content));
      } else {
        parsed = `<p>${this.escapeHtml(msg.content)}</p>`;
      }

      row.innerHTML = `
        <div class="assistant-content">${parsed}</div>
        <div class="assistant-actions">
          <button class="btn-tiny-action btn-copy-msg" title="Copy response">
            <i data-lucide="copy"></i>
          </button>
        </div>
      `;

      row.querySelector('.btn-copy-msg').addEventListener('click', () => {
        navigator.clipboard.writeText(msg.content);
        this.showToast('Copied to clipboard');
      });

      // Highlight code blocks
      row.querySelectorAll('pre code').forEach(codeBlock => {
        Prism.highlightElement(codeBlock);
        const pre = codeBlock.parentElement;
        const wrapper = document.createElement('div');
        wrapper.className = 'code-wrapper';
        pre.parentNode.insertBefore(wrapper, pre);

        const lang = codeBlock.className.replace('language-', '') || 'code';
        const header = document.createElement('div');
        header.className = 'code-header';
        header.innerHTML = `
          <span>${lang}</span>
          <button class="btn-code-copy"><i data-lucide="copy"></i> Copy code</button>
        `;
        header.querySelector('.btn-code-copy').addEventListener('click', () => {
          navigator.clipboard.writeText(codeBlock.innerText);
          this.showToast('Code copied');
        });

        wrapper.appendChild(header);
        wrapper.appendChild(pre);
      });
    }

    this.messagesFeed.appendChild(row);
    lucide.createIcons();

    if (scroll) {
      this.scrollToBottom();
    }
  }

  showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = text;
    this.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  scrollToBottom() {
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 40);
  }

  escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new MinimalChatApp();
});
