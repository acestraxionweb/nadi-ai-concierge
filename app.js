/**
 * Zayd — Minimal ChatGPT-style UI (Compact & Embedded)
 * Client Logic
 */

const CONFIG = {
  ENDPOINT: 'https://axyxymxrxyrpcnjfnrev.supabase.co/functions/v1/nadi-chat',
  BOT_SLUG: 'zayd',
  STORAGE_KEYS: {
    CONVERSATION_ID: 'nadi_chat_conv_id',
    MESSAGES: 'nadi_chat_messages'
  }
};

class MinimalChatApp {
  constructor() {
    this.conversationId = localStorage.getItem(CONFIG.STORAGE_KEYS.CONVERSATION_ID) || null;
    this.messages = this.loadMessages();
    this.isGenerating = false;

    this.initElements();
    this.initEventListeners();

    if (this.messages.length > 0) {
      this.showEmptyState(false);
      this.messages.forEach(msg => this.renderMessage(msg, false));
      this.scrollToBottom(false);
    } else {
      this.showEmptyState(true);
    }

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
      this.newChatHeaderBtn.addEventListener('click', () => this.startNewChat());
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

  handleInputChange() {
    const val = this.messageInput.value.trim();
    this.sendBtn.disabled = val.length === 0 || this.isGenerating;

    // Auto-grow textarea
    this.messageInput.style.height = 'auto';
    this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 160) + 'px';
  }

  loadMessages() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.MESSAGES)) || [];
    } catch {
      return [];
    }
  }

  saveMessages() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.MESSAGES, JSON.stringify(this.messages));
    if (this.conversationId) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.CONVERSATION_ID, this.conversationId);
    }
  }

  startNewChat() {
    this.conversationId = null;
    this.messages = [];
    localStorage.removeItem(CONFIG.STORAGE_KEYS.CONVERSATION_ID);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.MESSAGES);
    this.messagesFeed.innerHTML = '';
    this.showEmptyState(true);
    this.messageInput.value = '';
    this.handleInputChange();
    this.showToast('New session started');
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

    this.showEmptyState(false);
    this.messageInput.value = '';
    this.handleInputChange();

    // User message
    const userMsg = {
      role: 'user',
      content: text
    };
    this.messages.push(userMsg);
    this.renderMessage(userMsg, true);
    this.saveMessages();

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
      this.saveMessages();
      this.renderMessage(assistantMsg, true);

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
