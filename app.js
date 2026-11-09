/**
 * Zayd — Minimal ChatGPT-style UI (Compact & Embedded)
 * Client Logic:
 * - 1 isolated session per user (not shared)
 * - Refreshing the page refreshes/resets the session
 * - Auto-refreshes to a new session every 5 chats
 */

const CONFIG = {
  ENDPOINT: 'https://axyxymxrxyrpcnjfnrev.supabase.co/functions/v1/nadi-chat',
  BOT_SLUG: 'zayd',
  MAX_CHATS_PER_SESSION: 5
};

class MinimalChatApp {
  constructor() {
    // Clear any legacy persistent storage so refresh always starts fresh
    localStorage.removeItem('nadi_chat_conv_id');
    localStorage.removeItem('nadi_chat_messages');
    localStorage.removeItem('nadi_chat_sessions');
    localStorage.removeItem('nadi_chat_active_id');

    // Fresh session in runtime memory
    this.conversationId = null;
    this.messages = [];
    this.chatCount = 0;
    this.isGenerating = false;

    this.initElements();
    this.initEventListeners();
    this.showEmptyState(true);

    lucide.createIcons();
  }

  initElements() {
    this.messagesContainer = document.getElementById('messagesContainer');
    this.emptyState = document.getElementById('emptyState');
    this.messagesFeed = document.getElementById('messagesFeed');
    this.typingIndicator = document.getElementById('typingIndicator');

    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.newChatHeaderBtn = document.getElementById('newChatHeaderBtn');
    this.toastContainer = document.getElementById('toastContainer');
  }

  initEventListeners() {
    // New Chat Header Button
    if (this.newChatHeaderBtn) {
      this.newChatHeaderBtn.addEventListener('click', () => this.startNewSession(true));
    }

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

    // Quick Prompts in Empty State
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

  handleInputChange() {
    const val = this.messageInput.value.trim();
    this.sendBtn.disabled = val.length === 0 || this.isGenerating;

    // Auto-grow textarea
    this.messageInput.style.height = 'auto';
    this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 160) + 'px';
  }

  startNewSession(notify = false) {
    this.conversationId = null;
    this.messages = [];
    this.chatCount = 0;
    this.messagesFeed.innerHTML = '';
    this.showEmptyState(true);
    this.messageInput.value = '';
    this.handleInputChange();
    if (notify) {
      this.showToast('New session started');
    }
  }

  showEmptyState(show) {
    if (show) {
      this.emptyState.classList.remove('hidden');
    } else {
      this.emptyState.classList.add('hidden');
    }
  }

  async submitMessage() {
    const text = this.messageInput.value.trim();
    if (!text || this.isGenerating) return;

    // Check if session reached the 5-chat limit; if so, rollover to a fresh session
    if (this.chatCount >= CONFIG.MAX_CHATS_PER_SESSION) {
      this.startNewSession(false);
      this.showToast('5-chat limit reached. Started fresh session.');
    }

    this.showEmptyState(false);
    this.messageInput.value = '';
    this.handleInputChange();

    this.chatCount++;

    // User message
    const userMsg = {
      role: 'user',
      content: text
    };
    this.messages.push(userMsg);
    this.renderMessage(userMsg, true);

    // Call Supabase Edge Function
    await this.callEdgeFunction(text);
  }

  async callEdgeFunction(text) {
    this.isGenerating = true;
    this.sendBtn.disabled = true;
    this.typingIndicator.classList.remove('hidden');
    this.scrollToBottom(true);

    try {
      const payload = {
        message: text,
        bot_slug: CONFIG.BOT_SLUG
      };

      // Only pass conversation_id if within the current active session
      if (this.conversationId) {
        payload.conversation_id = this.conversationId;
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
        this.conversationId = data.conversation_id;
      }

      const assistantMsg = {
        role: 'assistant',
        content: data.reply || 'No response.'
      };

      this.messages.push(assistantMsg);
      this.renderMessage(assistantMsg, true);

      // If user has reached the 5th chat of this session, show rollover notice
      if (this.chatCount >= CONFIG.MAX_CHATS_PER_SESSION) {
        this.renderSessionLimitNotice();
      }

    } catch (err) {
      const errorMsg = {
        role: 'assistant',
        content: `Error: ${err.message}. Please try again.`
      };
      this.messages.push(errorMsg);
      this.renderMessage(errorMsg, true);
    } finally {
      this.isGenerating = false;
      this.sendBtn.disabled = this.messageInput.value.trim().length === 0;
      this.typingIndicator.classList.add('hidden');
      this.scrollToBottom(true);
    }
  }

  renderSessionLimitNotice() {
    const notice = document.createElement('div');
    notice.className = 'session-limit-pill';
    notice.innerHTML = `
      <span>Session completed (5/5 chats). Next message will start a fresh session.</span>
    `;
    this.messagesFeed.appendChild(notice);
    this.scrollToBottom(true);
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
      this.scrollToBottom(true);
    }
  }

  showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = text;
    this.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  scrollToBottom(smooth = true) {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTo({
        top: this.messagesContainer.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    });
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
