/**
 * Zayd — NADI AI Concierge
 * Client Application Logic
 */

const CONFIG = {
  ENDPOINT: 'https://axyxymxrxyrpcnjfnrev.supabase.co/functions/v1/nadi-chat',
  DEFAULT_BOT_SLUG: 'zayd',
  STORAGE_KEYS: {
    SESSIONS: 'nadi_concierge_sessions',
    ACTIVE_ID: 'nadi_concierge_active_id',
    BOT_SLUG: 'nadi_concierge_bot_slug',
    SOUND: 'nadi_concierge_sound'
  }
};

class NadiConciergeApp {
  constructor() {
    this.sessions = this.loadSessions();
    this.activeSessionId = localStorage.getItem(CONFIG.STORAGE_KEYS.ACTIVE_ID) || null;
    this.botSlug = localStorage.getItem(CONFIG.STORAGE_KEYS.BOT_SLUG) || CONFIG.DEFAULT_BOT_SLUG;
    this.soundEnabled = localStorage.getItem(CONFIG.STORAGE_KEYS.SOUND) === 'true';
    this.isGenerating = false;
    this.recognition = null;

    this.initElements();
    this.initEventListeners();
    this.initSpeechRecognition();
    this.renderHistoryList();

    if (this.activeSessionId && this.sessions[this.activeSessionId]) {
      this.loadSession(this.activeSessionId);
    } else {
      this.showWelcomeHero(true);
    }

    this.updateSoundIcon();
    lucide.createIcons();
  }

  initElements() {
    this.sidebar = document.getElementById('sidebar');
    this.sidebarOverlay = document.getElementById('sidebarOverlay');
    this.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    this.closeSidebarBtn = document.getElementById('closeSidebarBtn');
    this.newChatBtn = document.getElementById('newChatBtn');
    this.clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');
    this.historyList = document.getElementById('historyList');

    this.messagesContainer = document.getElementById('messagesContainer');
    this.welcomeHero = document.getElementById('welcomeHero');
    this.messagesFeed = document.getElementById('messagesFeed');
    this.typingIndicator = document.getElementById('typingIndicator');

    this.composerForm = document.getElementById('composerForm');
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.charCount = document.getElementById('charCount');
    this.suggestedChipsBar = document.getElementById('suggestedChipsBar');
    this.chipsWrapper = document.getElementById('chipsWrapper');
    this.voiceInputBtn = document.getElementById('voiceInputBtn');
    this.micIcon = document.getElementById('micIcon');

    this.soundToggleBtn = document.getElementById('soundToggleBtn');
    this.soundIcon = document.getElementById('soundIcon');
    this.exportChatBtn = document.getElementById('exportChatBtn');
    this.resetCurrentChatBtn = document.getElementById('resetCurrentChatBtn');

    // Settings Modal
    this.openSettingsBtn = document.getElementById('openSettingsBtn');
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    this.settingsModal = document.getElementById('settingsModal');
    this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    this.currentConvIdDisplay = document.getElementById('currentConvIdDisplay');
    this.copyConvIdBtn = document.getElementById('copyConvIdBtn');
    this.endpointDisplay = document.getElementById('endpointDisplay');
    this.botSlugSelect = document.getElementById('botSlugSelect');
    this.testConnectionBtn = document.getElementById('testConnectionBtn');
    this.pingResult = document.getElementById('pingResult');
    this.toastContainer = document.getElementById('toastContainer');

    this.botSlugSelect.value = this.botSlug;
    this.endpointDisplay.textContent = CONFIG.ENDPOINT;
  }

  initEventListeners() {
    // Sidebar Toggles
    if (this.toggleSidebarBtn) {
      this.toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar(true));
    }
    if (this.closeSidebarBtn) {
      this.closeSidebarBtn.addEventListener('click', () => this.toggleSidebar(false));
    }
    if (this.sidebarOverlay) {
      this.sidebarOverlay.addEventListener('click', () => this.toggleSidebar(false));
    }

    // New Chat & Reset
    this.newChatBtn.addEventListener('click', () => this.startNewChat());
    this.resetCurrentChatBtn.addEventListener('click', () => this.resetCurrentChat());
    this.clearAllHistoryBtn.addEventListener('click', () => this.clearAllHistory());

    // Input Handling
    this.messageInput.addEventListener('input', () => this.handleInputChange());
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.sendBtn.disabled && !this.isGenerating) {
          this.composerForm.dispatchEvent(new Event('submit'));
        }
      }
    });

    this.composerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.messageInput.value.trim();
      if (text && !this.isGenerating) {
        this.submitUserMessage(text);
      }
    });

    // Prompt Chips in Hero
    document.querySelectorAll('.prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) {
          this.submitUserMessage(prompt);
        }
      });
    });

    // Sound Toggle
    this.soundToggleBtn.addEventListener('click', () => {
      this.soundEnabled = !this.soundEnabled;
      localStorage.setItem(CONFIG.STORAGE_KEYS.SOUND, this.soundEnabled);
      this.updateSoundIcon();
      this.showToast(this.soundEnabled ? 'Speech responses enabled' : 'Speech responses muted');
    });

    // Export Chat
    this.exportChatBtn.addEventListener('click', () => this.exportChatAsMarkdown());

    // Settings Modal
    this.openSettingsBtn.addEventListener('click', () => this.openSettings());
    this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    this.saveSettingsBtn.addEventListener('click', () => {
      this.botSlug = this.botSlugSelect.value;
      localStorage.setItem(CONFIG.STORAGE_KEYS.BOT_SLUG, this.botSlug);
      this.closeSettings();
      this.showToast('Settings saved');
    });

    this.copyConvIdBtn.addEventListener('click', () => {
      const activeSession = this.getActiveSession();
      if (activeSession && activeSession.conversationId) {
        navigator.clipboard.writeText(activeSession.conversationId);
        this.showToast('Conversation ID copied to clipboard');
      }
    });

    this.testConnectionBtn.addEventListener('click', () => this.testConnection());
  }

  toggleSidebar(open) {
    if (open) {
      this.sidebar.classList.add('open');
      this.sidebarOverlay.classList.add('active');
    } else {
      this.sidebar.classList.remove('open');
      this.sidebarOverlay.classList.remove('active');
    }
  }

  updateSoundIcon() {
    this.soundIcon.setAttribute('data-lucide', this.soundEnabled ? 'volume-2' : 'volume-x');
    lucide.createIcons();
  }

  handleInputChange() {
    const len = this.messageInput.value.length;
    this.charCount.textContent = `${len} / 6000`;
    this.sendBtn.disabled = len === 0 || this.isGenerating;

    // Auto expand textarea
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
    this.activeSessionId = 'session_' + Date.now();
    this.sessions[this.activeSessionId] = {
      id: this.activeSessionId,
      conversationId: null,
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      messages: []
    };
    localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_ID, this.activeSessionId);
    this.saveSessions();
    this.renderHistoryList();
    this.messagesFeed.innerHTML = '';
    this.showWelcomeHero(true);
    this.suggestedChipsBar.classList.add('hidden');
    this.messageInput.value = '';
    this.handleInputChange();
    this.toggleSidebar(false);
  }

  resetCurrentChat() {
    if (!this.activeSessionId) return;
    delete this.sessions[this.activeSessionId];
    this.saveSessions();
    this.startNewChat();
    this.showToast('Conversation cleared');
  }

  clearAllHistory() {
    if (confirm('Are you sure you want to clear all conversation history?')) {
      this.sessions = {};
      this.saveSessions();
      this.startNewChat();
      this.showToast('All history cleared');
    }
  }

  loadSession(sessionId) {
    const session = this.sessions[sessionId];
    if (!session) return;
    this.activeSessionId = sessionId;
    localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_ID, sessionId);

    this.messagesFeed.innerHTML = '';
    if (session.messages.length === 0) {
      this.showWelcomeHero(true);
    } else {
      this.showWelcomeHero(false);
      session.messages.forEach(msg => this.renderMessage(msg, false));
      this.renderFollowupChips(session.messages[session.messages.length - 1]);
    }

    this.renderHistoryList();
    this.toggleSidebar(false);
    this.scrollToBottom();
  }

  showWelcomeHero(show) {
    if (show) {
      this.welcomeHero.classList.remove('hidden');
    } else {
      this.welcomeHero.classList.add('hidden');
    }
  }

  renderHistoryList() {
    this.historyList.innerHTML = '';
    const sorted = Object.values(this.sessions).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (sorted.length === 0) {
      this.historyList.innerHTML = `<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">No conversations yet</div>`;
      return;
    }

    sorted.forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item ${session.id === this.activeSessionId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="history-item-title" title="${session.title}">${session.title}</span>
        <button class="history-item-delete" title="Delete"><i data-lucide="trash"></i></button>
      `;

      item.querySelector('.history-item-title').addEventListener('click', () => {
        this.loadSession(session.id);
      });

      item.querySelector('.history-item-delete').addEventListener('click', (e) => {
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

  async submitUserMessage(text) {
    if (!this.activeSessionId || !this.sessions[this.activeSessionId]) {
      this.startNewChat();
    }

    const session = this.getActiveSession();
    this.showWelcomeHero(false);
    this.messageInput.value = '';
    this.handleInputChange();

    // Add user message to state
    const userMsg = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    session.messages.push(userMsg);

    // Update title if first message
    if (session.messages.length === 1) {
      session.title = text.length > 32 ? text.substring(0, 32) + '...' : text;
    }

    this.renderMessage(userMsg, true);
    this.saveSessions();
    this.renderHistoryList();
    this.suggestedChipsBar.classList.add('hidden');

    // Call Supabase Edge Function
    await this.callNadiChat(text);
  }

  async callNadiChat(userMessage) {
    const session = this.getActiveSession();
    this.isGenerating = true;
    this.sendBtn.disabled = true;
    this.typingIndicator.classList.remove('hidden');
    this.scrollToBottom();

    const startTime = performance.now();

    try {
      const payload = {
        message: userMessage,
        bot_slug: this.botSlug
      };

      if (session.conversationId) {
        payload.conversation_id = session.conversationId;
      }

      const response = await fetch(CONFIG.ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status} from Edge Function`);
      }

      const data = await response.json();

      // Store Supabase conversation_id for thread continuity
      if (data.conversation_id) {
        session.conversationId = data.conversation_id;
      }

      const assistantMsg = {
        role: 'assistant',
        content: data.reply || 'No reply received.',
        model: data.model || 'deepseek-v4.1-flash',
        usage: data.usage || {},
        latencyMs: latencyMs,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      session.messages.push(assistantMsg);
      this.saveSessions();
      this.renderMessage(assistantMsg, true);
      this.renderFollowupChips(assistantMsg);

      if (this.soundEnabled && assistantMsg.content) {
        this.speakText(assistantMsg.content);
      }

    } catch (err) {
      console.error('NADI Chat Error:', err);
      const errorMsg = {
        role: 'assistant',
        content: `**Connection Error**: ${err.message}\n\nPlease check your internet connection or verify CORS permissions in the Supabase edge function.`,
        isError: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      session.messages.push(errorMsg);
      this.renderMessage(errorMsg, true);
      this.showToast(err.message, 'error');
    } finally {
      this.isGenerating = false;
      this.sendBtn.disabled = this.messageInput.value.length === 0;
      this.typingIndicator.classList.add('hidden');
      this.scrollToBottom();
    }
  }

  renderMessage(msg, scroll = true) {
    const row = document.createElement('div');
    row.className = `message-row ${msg.role}`;

    const isUser = msg.role === 'user';
    const avatarLetter = isUser ? 'U' : 'Z';
    const senderName = isUser ? 'You' : 'Zayd';

    // Parse Markdown safely
    let parsedContent = '';
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        gfm: true,
        breaks: true
      });
      parsedContent = DOMPurify.sanitize(marked.parse(msg.content));
    } else {
      parsedContent = `<p>${this.escapeHtml(msg.content)}</p>`;
    }

    // Format metrics
    let metricsHtml = '';
    if (!isUser && !msg.isError) {
      const tokens = msg.usage ? (msg.usage.output_tokens || 0) : 0;
      const latency = msg.latencyMs ? `${(msg.latencyMs / 1000).toFixed(2)}s` : '';
      metricsHtml = `
        <div class="metrics-badge-row">
          ${msg.model ? `<span class="metric-item"><i data-lucide="cpu"></i> ${msg.model}</span>` : ''}
          ${tokens ? `<span class="metric-item"><i data-lucide="zap"></i> ${tokens} tokens</span>` : ''}
          ${latency ? `<span class="metric-item"><i data-lucide="clock"></i> ${latency}</span>` : ''}
        </div>
      `;
    }

    row.innerHTML = `
      <div class="message-avatar">${avatarLetter}</div>
      <div class="message-body-wrap">
        <div class="message-header-meta">
          <span class="sender-name">${senderName}</span>
          <span class="message-time">${msg.timestamp || ''}</span>
        </div>
        <div class="message-card ${msg.isError ? 'error-card' : ''}">
          ${parsedContent}
        </div>
        <div class="message-footer-actions">
          ${metricsHtml}
          <div class="message-action-btns">
            <button class="btn-action-icon copy-msg-btn" title="Copy text">
              <i data-lucide="copy"></i>
            </button>
            ${!isUser ? `
            <button class="btn-action-icon speak-msg-btn" title="Read aloud">
              <i data-lucide="volume-2"></i>
            </button>` : ''}
          </div>
        </div>
      </div>
    `;

    // Copy Message Handler
    row.querySelector('.copy-msg-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content);
      this.showToast('Copied to clipboard');
    });

    // Speak Message Handler
    const speakBtn = row.querySelector('.speak-msg-btn');
    if (speakBtn) {
      speakBtn.addEventListener('click', () => {
        this.speakText(msg.content);
      });
    }

    // Enhance Code Blocks with Copy button
    row.querySelectorAll('pre code').forEach(codeBlock => {
      Prism.highlightElement(codeBlock);
      const pre = codeBlock.parentElement;
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      pre.parentNode.insertBefore(wrapper, pre);
      
      const lang = codeBlock.className.replace('language-', '') || 'code';
      const header = document.createElement('div');
      header.className = 'code-block-header';
      header.innerHTML = `
        <span>${lang}</span>
        <button class="btn-copy-code"><i data-lucide="copy"></i> Copy</button>
      `;
      header.querySelector('.btn-copy-code').addEventListener('click', () => {
        navigator.clipboard.writeText(codeBlock.innerText);
        this.showToast('Code copied to clipboard');
      });

      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });

    this.messagesFeed.appendChild(row);
    lucide.createIcons();

    if (scroll) {
      this.scrollToBottom();
    }
  }

  renderFollowupChips(lastAssistantMsg) {
    if (!lastAssistantMsg || lastAssistantMsg.role !== 'assistant' || lastAssistantMsg.isError) {
      this.suggestedChipsBar.classList.add('hidden');
      return;
    }

    const suggestions = [
      'What are the 5 phases of NADI integration?',
      'How do you handle exceptions and fallbacks?',
      'Can you map a sample customer service workflow?',
      'What tools can NADI connect with?'
    ];

    this.chipsWrapper.innerHTML = '';
    suggestions.slice(0, 3).forEach(text => {
      const chip = document.createElement('button');
      chip.className = 'followup-chip';
      chip.textContent = text;
      chip.addEventListener('click', () => {
        this.submitUserMessage(text);
      });
      this.chipsWrapper.appendChild(chip);
    });

    this.suggestedChipsBar.classList.remove('hidden');
  }

  speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    // Strip markdown chars
    const plain = text.replace(/[*#`_\[\]()]/g, '').replace(/https?:\/\/\S+/g, '');
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  initSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      this.voiceInputBtn.style.display = 'none';
      return;
    }

    this.recognition = new SpeechRec();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.voiceInputBtn.classList.add('listening');
      this.showToast('Listening... Speak now');
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      this.messageInput.value = (this.messageInput.value + ' ' + transcript).trim();
      this.handleInputChange();
    };

    this.recognition.onend = () => {
      this.voiceInputBtn.classList.remove('listening');
    };

    this.voiceInputBtn.addEventListener('click', () => {
      if (this.voiceInputBtn.classList.contains('listening')) {
        this.recognition.stop();
      } else {
        this.recognition.start();
      }
    });
  }

  exportChatAsMarkdown() {
    const session = this.getActiveSession();
    if (!session || session.messages.length === 0) {
      this.showToast('No messages to export');
      return;
    }

    let md = `# Conversation with Zayd (NADI AI Concierge)\n\n`;
    md += `**Date:** ${session.createdAt}\n`;
    md += `**Conversation ID:** \`${session.conversationId || 'None'}\`\n\n---\n\n`;

    session.messages.forEach(msg => {
      const sender = msg.role === 'user' ? '👤 **You**' : '⚡ **Zayd (NADI AI Concierge)**';
      md += `### ${sender} (${msg.timestamp || ''})\n\n${msg.content}\n\n`;
      if (msg.usage) {
        md += `> Tokens: ${msg.usage.output_tokens || 0} | Latency: ${msg.latencyMs || 0}ms\n\n`;
      }
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nadi-concierge-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Conversation exported');
  }

  openSettings() {
    const session = this.getActiveSession();
    this.currentConvIdDisplay.textContent = session?.conversationId || 'None (No active remote thread yet)';
    this.settingsModal.classList.remove('hidden');
    lucide.createIcons();
  }

  closeSettings() {
    this.settingsModal.classList.add('hidden');
    this.pingResult.classList.add('hidden');
  }

  async testConnection() {
    this.pingResult.classList.remove('hidden', 'success', 'error');
    this.pingResult.textContent = 'Pinging Supabase Edge Function...';

    try {
      const res = await fetch(CONFIG.ENDPOINT, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type'
        }
      });

      if (res.ok) {
        this.pingResult.className = 'ping-status-result success';
        this.pingResult.innerHTML = `✓ Connection Successful: HTTP ${res.status} OK<br>CORS allowed: ${res.headers.get('Access-Control-Allow-Origin') || 'Dynamic'}`;
      } else {
        this.pingResult.className = 'ping-status-result error';
        this.pingResult.textContent = `✗ HTTP Error ${res.status}`;
      }
    } catch (err) {
      this.pingResult.className = 'ping-status-result error';
      this.pingResult.textContent = `✗ Ping failed: ${err.message}`;
    }
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}"></i>
      <span>${this.escapeHtml(message)}</span>
    `;
    this.toastContainer.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 200ms ease';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  scrollToBottom() {
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 50);
  }

  escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new NadiConciergeApp();
});
