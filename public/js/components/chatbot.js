/**
 * Suki Store Smart AI Assistant ("Bassam" - بسام) & Customer Support Widget
 * Features:
 * - Natural Egyptian dialect assistant named Bassam ("بسام")
 * - Live store catalog, prices, discounts, loyalty points, and coupons knowledge
 * - Natural 3-dot typing indicator with 1-3s human-like pacing before reply
 * - Multi-turn conversation awareness & clickable product recommendation cards
 * - Clear escalation to human customer support agent with live sync
 * - Strictly isolated from admin dashboard & administrative endpoints
 */

const Chatbot = {
  isOpen: false,
  isTyping: false,
  conversationId: null,
  isWaitingAgent: false,
  pollTimer: null,
  messages: [],

  WELCOME_TEXT: 'أهلاً بحضرتك يا فندم، أنا بسام المساعد الذكي لمتجر سوقي ستور. إزاي أقدر أساعد حضرتك؟',

  isOnAdminRoute() {
    return window.location.hash && window.location.hash.startsWith('#/admin');
  },

  init() {
    this.conversationId = localStorage.getItem('suki_chat_id');
    if (!this.conversationId) {
      this.conversationId = 'conv_' + ((window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : (Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)));
      localStorage.setItem('suki_chat_id', this.conversationId);
    }

    this.renderWidget();
    if (this.isOnAdminRoute()) {
      const wrapper = document.getElementById('suki-chatbot-wrapper');
      if (wrapper) wrapper.style.display = 'none';
    }
    this.loadHistory();
  },

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatRichText(text) {
    const escaped = this.escapeHtml(text);
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-extrabold text-slate-900">$1</strong>')
      .replace(/\n/g, '<br>');
  },

  renderWidget() {
    if (document.getElementById('suki-chatbot-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'suki-chatbot-wrapper';
    wrapper.className = 'fixed bottom-5 left-5 z-50 select-none';
    wrapper.innerHTML = `
      <!-- Launcher Button -->
      <button 
        id="chatbot-launcher-btn" 
        onclick="Chatbot.toggle()" 
        class="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full p-3.5 shadow-2xl flex items-center gap-2.5 transition-all transform hover:scale-105 active:scale-95 group focus:outline-none"
        title="بسام - المساعد الذكي لسوقي ستور"
      >
        <div class="relative">
          <i class="fa-solid fa-headset text-xl"></i>
          <span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping"></span>
        </div>
        <span class="text-xs font-extrabold hidden group-hover:inline-block transition-all duration-300">
          تحدث مع بسام 💬
        </span>
      </button>

      <!-- Chat Window Popup -->
      <div 
        id="chatbot-window" 
        class="hidden fixed bottom-20 left-5 w-[92vw] sm:w-[390px] h-[540px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 z-50"
      >
        <!-- Header -->
        <div class="bg-gradient-to-r from-emerald-600 to-emerald-700 p-4 text-white flex items-center justify-between shadow-md">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white text-base">
              <i class="fa-solid fa-user-tie"></i>
            </div>
            <div>
              <div class="font-extrabold text-sm leading-tight">بسام • المساعد الذكي لسوقي ستور</div>
              <div id="chatbot-status-subtitle" class="text-[10px] text-emerald-100 flex items-center gap-1 mt-0.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
                <span>متصل الآن • معاك في التسوق وخدمة العملاء</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="Chatbot.resetChat()" title="بدء محادثة جديدة" class="text-white/80 hover:text-white p-1.5 rounded-lg text-xs focus:outline-none hover:bg-white/10 transition-colors">
              <i class="fa-solid fa-rotate-right"></i>
            </button>
            <button onclick="Chatbot.toggle()" title="إغلاق" class="text-white/80 hover:text-white p-1.5 rounded-lg text-lg focus:outline-none hover:bg-white/10 transition-colors">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Messages Area -->
        <div id="chatbot-messages-body" class="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50 text-right">
          <!-- Initial Bassam Welcome Bubble -->
          <div class="flex justify-start">
            <div class="bg-white border border-slate-200 rounded-2xl rounded-tr-none p-3 max-w-[85%] text-xs text-slate-800 shadow-sm leading-relaxed">
              ${this.escapeHtml(this.WELCOME_TEXT)}
            </div>
          </div>

          <!-- Quick Suggestion Pills -->
          <div id="chatbot-quick-pills" class="flex flex-wrap gap-1.5 pt-1">
            <button onclick="Chatbot.sendQuick('أحدث العروض والخصومات')" class="bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 shadow-xs">
              🔥 أحدث العروض والخصومات
            </button>
            <button onclick="Chatbot.sendQuick('رصيد نقاطي وكوبوناتي')" class="bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 shadow-xs">
              🎁 رصيد نقاطي وكوبوناتي
            </button>
            <button onclick="Chatbot.sendQuick('عايز أعرف مصاريف الشحن')" class="bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 shadow-xs">
              🚚 مصاريف الشحن
            </button>
            <button onclick="Chatbot.sendQuick('تتبع طلبي')" class="bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 shadow-xs">
              📦 تتبع طلبي
            </button>
            <button onclick="Chatbot.promptHumanEscalation()" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-200 shadow-xs">
              👨‍💼 التحدث مع موظف
            </button>
          </div>

          <!-- Live Chat Stream -->
          <div id="chatbot-stream" class="space-y-3"></div>

          <!-- 3-Dot Typing Indicator (Hidden by default) -->
          <div id="chatbot-typing-indicator" class="hidden flex justify-start">
            <div class="bg-white border border-slate-200 rounded-2xl rounded-tr-none px-3.5 py-2.5 shadow-sm flex items-center gap-2">
              <span class="text-[11px] font-bold text-emerald-700">بسام يكتب</span>
              <span class="chatbot-typing-dots" aria-label="جاري الكتابة">
                <span></span><span></span><span></span>
              </span>
            </div>
          </div>
        </div>

        <!-- Escalation Prompt Box (Hidden by default) -->
        <div id="chatbot-escalate-box" class="hidden bg-amber-50 p-3 border-t border-amber-200 text-right">
          <div class="text-[11px] font-bold text-amber-900 mb-1.5">
            أدخل اسمك ورقم موبايلك لتحويل المحادثة فوراً لأحد موظفي خدمة العملاء:
          </div>
          <form onsubmit="Chatbot.submitEscalate(event)" class="space-y-2">
            <input type="text" id="cb-esc-name" class="form-control text-xs h-8" placeholder="اسم حضرتك الكريم" required />
            <input type="tel" id="cb-esc-phone" class="form-control text-xs h-8 font-mono" placeholder="رقم الموبايل / واتساب (اختياري للمتابعة السريعة)" />
            <div class="flex gap-1.5">
              <button type="submit" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-lg text-xs">
                تأكيد والتحويل لموظف الآن
              </button>
              <button type="button" onclick="Chatbot.cancelEscalate()" class="bg-slate-200 text-slate-700 text-xs px-2.5 py-1.5 rounded-lg">
                إلغاء
              </button>
            </div>
          </form>
        </div>

        <!-- Input Bar -->
        <div class="p-2.5 bg-white border-t border-slate-200">
          <form onsubmit="Chatbot.submitMessage(event)" class="flex items-center gap-1.5">
            <input 
              type="text" 
              id="chatbot-input" 
              class="form-control text-xs flex-1 h-9 rounded-xl pr-3" 
              placeholder="اكتب سؤالك أو اسم المنتج لبسام يا فندم..." 
              autocomplete="off" 
              required
            />
            <button id="chatbot-send-btn" type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all shadow-sm">
              <i class="fa-solid fa-paper-plane text-xs"></i>
            </button>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
  },

  updateHeaderStatus() {
    const sub = document.getElementById('chatbot-status-subtitle');
    if (!sub) return;
    if (this.isWaitingAgent) {
      sub.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse"></span><span>محول لخدمة العملاء • متابعة مباشرة مع موظف</span>`;
    } else {
      sub.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-300"></span><span>متصل الآن • معاك في التسوق وخدمة العملاء</span>`;
    }
  },

  resetChat() {
    this.isTyping = false;
    this.isWaitingAgent = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.messages = [];
    this.conversationId = 'conv_' + ((window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : (Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)));
    localStorage.setItem('suki_chat_id', this.conversationId);
    this.hideTypingIndicator();
    this.cancelEscalate();
    this.updateHeaderStatus();
    this.renderMessages();
  },

  toggle() {
    if (this.isOnAdminRoute()) return;
    const win = document.getElementById('chatbot-window');
    if (!win) return;
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      win.classList.remove('hidden');
      const input = document.getElementById('chatbot-input');
      if (input) setTimeout(() => input.focus(), 100);
      this.scrollToBottom();
      this.startSync();
    } else {
      win.classList.add('hidden');
      if (!this.isWaitingAgent && this.pollTimer) {
        clearInterval(this.pollTimer);
      }
    }
  },

  showTypingIndicator() {
    this.isTyping = true;
    const ind = document.getElementById('chatbot-typing-indicator');
    if (ind) ind.classList.remove('hidden');
    this.scrollToBottom();
  },

  hideTypingIndicator() {
    this.isTyping = false;
    const ind = document.getElementById('chatbot-typing-indicator');
    if (ind) ind.classList.add('hidden');
  },

  async loadHistory() {
    if (!this.conversationId) return;
    try {
      const res = await API.get(`/chat/conversations/${this.conversationId}`);
      if (res.success && res.conversation) {
        const conv = res.conversation;
        if (conv.status === 'resolved') {
          // Previous conversation already resolved — open clean session for new visit
          this.resetChat();
          return;
        }
        if (conv.status === 'waiting_agent' || conv.status === 'in_progress') {
          this.isWaitingAgent = true;
          this.updateHeaderStatus();
          this.startSync();
        }
        if (Array.isArray(conv.messages)) {
          this.messages = conv.messages;
          this.renderMessages();
        }
      }
    } catch (e) {
      // Conversation not yet saved on server, ignore
    }
  },

  startSync() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (this.conversationId && !this.isTyping) {
        try {
          const res = await API.get(`/chat/conversations/${this.conversationId}`);
          if (res.success && res.conversation && res.conversation.messages) {
            const conv = res.conversation;
            const serverMsgs = conv.messages;
            const prevWaiting = this.isWaitingAgent;
            this.isWaitingAgent = conv.status === 'waiting_agent' || conv.status === 'in_progress';
            if (prevWaiting !== this.isWaitingAgent) this.updateHeaderStatus();

            if (serverMsgs.length !== this.messages.length) {
              this.messages = serverMsgs;
              this.renderMessages();
            }
          }
        } catch (e) {}
      }
    }, 4000);
  },

  renderProductCardsList(items) {
    return items.map(p => {
      const hasDiscount = p.compareAtPrice && Number(p.compareAtPrice) > Number(p.price);
      const stockNum = p.stock !== undefined ? Number(p.stock) : null;
      const outOfStock = stockNum !== null && stockNum <= 0;
      const realImage = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : (p.image || '');
      const metaLine = [p.brand, p.categoryName].filter(Boolean).join(' • ');
      const varsSummary = Array.isArray(p.variations) && p.variations.length > 0
        ? p.variations.filter(v => v && Array.isArray(v.values) && v.values.length > 0).map(v => `${v.name}: ${v.values.join('، ')}`).join(' | ')
        : '';
      return `
        <a href="#/product/${p.id}" onclick="Chatbot.toggle()" class="flex items-start gap-2 p-2 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200 transition-colors">
          ${realImage
            ? `<img src="${this.escapeHtml(realImage)}" loading="lazy" class="w-10 h-10 rounded object-cover flex-shrink-0 border border-slate-200" />`
            : `<div class="w-10 h-10 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0" title="لا توجد صورة مسجلة"><i class="fa-regular fa-image text-xs"></i></div>`}
          <div class="overflow-hidden flex-1">
            <div class="font-bold text-[11px] text-slate-800 truncate">${this.escapeHtml(p.title)}</div>
            ${metaLine ? `<div class="text-[9px] text-slate-500 font-semibold truncate">${this.escapeHtml(metaLine)}</div>` : ''}
            ${p.description ? `<div class="text-[10px] text-slate-600 truncate mt-0.5">${this.escapeHtml(p.description)}</div>` : ''}
            <div class="flex items-center gap-1.5 flex-wrap mt-1">
              <span class="text-[11px] font-extrabold text-emerald-700">${p.price} ج.م</span>
              ${hasDiscount ? `<span class="text-[10px] text-slate-400 line-through">${p.compareAtPrice} ج.م</span>` : ''}
              ${hasDiscount && p.discountPercent ? `<span class="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded-full">خصم ${p.discountPercent}%</span>` : ''}
              ${p.isFreeShipping ? `<span class="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">شحن مجاني</span>` : ''}
              ${outOfStock
                ? `<span class="text-[9px] bg-red-50 text-red-700 border border-red-200 font-bold px-1.5 py-0.2 rounded-full">غير متوفر (المخزون: 0)</span>`
                : (stockNum !== null ? `<span class="text-[9px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.2 rounded-full">متوفر (${stockNum})</span>` : '')}
            </div>
            ${varsSummary ? `<div class="text-[9px] text-slate-500 mt-0.5 truncate">${this.escapeHtml(varsSummary)}</div>` : ''}
            ${p.recommendationReason ? `<div class="text-[9px] text-emerald-800 font-medium mt-1 leading-snug">${this.escapeHtml(p.recommendationReason)}</div>` : ''}
          </div>
        </a>
      `;
    }).join('');
  },

  renderMessages() {
    const stream = document.getElementById('chatbot-stream');
    if (!stream) return;

    stream.innerHTML = this.messages.map(m => {
      const isCust = m.sender === 'customer';
      const isStaff = m.sender === 'staff';
      const isSys = m.sender === 'system';

      if (isSys) {
        return `
          <div class="text-center my-1.5">
            <span class="bg-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-block">
              ${this.escapeHtml(m.text)}
            </span>
          </div>
        `;
      }

      if (isCust) {
        return `
          <div class="flex justify-end">
            <div class="bg-emerald-600 text-white rounded-2xl rounded-tl-none p-2.5 max-w-[85%] text-xs shadow-sm">
              <div>${this.escapeHtml(m.text)}</div>
              <div class="text-[9px] text-emerald-200 text-left mt-0.5 font-mono">
                ${new Date(m.timestamp || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        `;
      }

      if (isStaff) {
        return `
          <div class="flex justify-start">
            <div class="bg-amber-50 text-amber-950 border border-amber-300 rounded-2xl rounded-tr-none p-2.5 max-w-[85%] text-xs shadow-sm">
              <div class="text-[10px] font-bold text-amber-800 mb-1 flex items-center gap-1">
                <i class="fa-solid fa-headset"></i> ${this.escapeHtml(m.staffName || 'ممثل خدمة العملاء')}
              </div>
              <div>${this.formatRichText(m.text)}</div>
            </div>
          </div>
        `;
      }

      // Bot Message (Bassam)
      const hasProducts = Array.isArray(m.products) && m.products.length > 0;
      const productIds = new Set((m.products || []).map(p => String(p.id)));
      const uniqueComplementary = Array.isArray(m.complementary)
        ? m.complementary.filter(p => !productIds.has(String(p.id)))
        : [];
      const uniqueAlternatives = Array.isArray(m.alternatives)
        ? m.alternatives.filter(p => !productIds.has(String(p.id)))
        : [];
      const hasComplementary = uniqueComplementary.length > 0;
      const hasAlternatives = uniqueAlternatives.length > 0;
      const hasSuggestions = Array.isArray(m.suggestions) && m.suggestions.length > 0;
      const formattedText = this.formatRichText(m.text || '');
      const highlightEscalate = Boolean(m.escalationSuggested);

      return `
        <div class="flex justify-start">
          <div class="bg-white text-slate-800 border border-slate-200 rounded-2xl rounded-tr-none p-3 max-w-[88%] text-xs shadow-sm space-y-2.5">
            <div class="leading-relaxed">${formattedText}</div>

            ${hasProducts ? `
              <div class="space-y-1.5 pt-1.5 border-t border-slate-100">
                ${this.renderProductCardsList(m.products)}
              </div>
            ` : ''}

            ${hasAlternatives ? `
              <div class="space-y-1.5 pt-1.5 border-t border-slate-100">
                <div class="text-[10px] font-extrabold text-amber-800">🔄 بدائل متاحة قد تناسبك</div>
                ${this.renderProductCardsList(uniqueAlternatives)}
              </div>
            ` : ''}

            ${hasComplementary ? `
              <div class="space-y-1.5 pt-1.5 border-t border-slate-100">
                <div class="text-[10px] font-extrabold text-emerald-800">💡 منتجات مكملة متوافقة</div>
                ${this.renderProductCardsList(uniqueComplementary)}
              </div>
            ` : ''}

            ${hasSuggestions ? `
              <div class="flex flex-wrap gap-1 pt-1 border-t border-slate-100">
                ${m.suggestions.map(s => `
                  <button type="button" data-suggestion="${this.escapeHtml(s)}" onclick="Chatbot.sendQuick(this.dataset.suggestion)" class="text-[10px] font-semibold bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 px-2 py-0.5 rounded-full border border-slate-200 transition-colors">
                    ${this.escapeHtml(s)}
                  </button>
                `).join('')}
              </div>
            ` : ''}

            ${!this.isWaitingAgent ? `
              <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5 ${highlightEscalate ? 'bg-amber-50/70 -mx-1 px-2 py-1.5 rounded-lg border-amber-200' : ''}">
                <span class="text-[10px] ${highlightEscalate ? 'text-amber-900 font-bold' : 'text-slate-500 font-medium'}">
                  ${highlightEscalate ? 'تحب تتواصل مع موظف خدمة عملاء مباشرة؟' : 'محتاج موظف بشري يساعدك؟'}
                </span>
                <button type="button" onclick="Chatbot.promptHumanEscalation()" class="text-[10px] font-bold ${highlightEscalate ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700' : 'text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'} border px-2.5 py-0.5 rounded-md flex-shrink-0 transition-colors">
                  تحويل لموظف
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.scrollToBottom();
  },

  scrollToBottom() {
    const body = document.getElementById('chatbot-messages-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  },

  sendQuick(text) {
    if (!text) return;
    if (text === 'التحدث مع موظف') {
      this.promptHumanEscalation();
      return;
    }
    const input = document.getElementById('chatbot-input');
    if (input) {
      input.value = text;
      this.submitMessage(new Event('submit'));
    }
  },

  async submitMessage(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (this.isOnAdminRoute() || this.isTyping) return;

    const input = document.getElementById('chatbot-input');
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = '';

    // Append user message immediately
    const userMsg = {
      id: 'local_' + Date.now(),
      sender: 'customer',
      text: userText,
      timestamp: new Date().toISOString()
    };
    this.messages.push(userMsg);
    this.renderMessages();

    const customerInfo = State.user ? {
      name: State.user.name,
      phone: State.user.phone,
      email: State.user.email,
      whatsapp: State.user.whatsappPhone || ''
    } : null;

    // Show 3-dot typing indicator & compute realistic 1-3s human delay when bot will reply
    const shouldShowTyping = !this.isWaitingAgent;
    const startMs = Date.now();
    if (shouldShowTyping) {
      this.showTypingIndicator();
    }

    try {
      const res = await API.post('/chat/message', {
        conversationId: this.conversationId,
        message: userText,
        customerInfo
      });

      if (shouldShowTyping && res.reply) {
        const replyLen = (res.reply.text || '').length;
        const targetDelay = Math.min(2700, Math.max(1200, 1100 + Math.floor(replyLen * 4) + Math.floor(Math.random() * 450)));
        const remaining = targetDelay - (Date.now() - startMs);
        if (remaining > 0) {
          await new Promise(resolve => setTimeout(resolve, remaining));
        }
      }

      this.hideTypingIndicator();

      if (res.success && res.reply) {
        if (res.escalated || res.status === 'waiting_agent') {
          this.isWaitingAgent = true;
          this.updateHeaderStatus();
          this.startSync();
        }
        if (res.conversation && Array.isArray(res.conversation.messages)) {
          this.messages = res.conversation.messages;
        } else {
          this.messages.push(res.reply);
        }
        this.renderMessages();

        if (res.openEscalateBox || res.reply.openEscalateBox) {
          this.promptHumanEscalation();
        }
      } else if (res.success && !res.reply) {
        this.isWaitingAgent = true;
        this.updateHeaderStatus();
        this.startSync();
      }
    } catch (err) {
      this.hideTypingIndicator();
      this.messages.push({
        id: 'err_' + Date.now(),
        sender: 'bot',
        text: 'عذراً يا فندم، حصلت مشكلة بسيطة في الاتصال. تحب تجرب تاني أو أحولك لموظف خدمة العملاء؟',
        escalationSuggested: true,
        timestamp: new Date().toISOString()
      });
      this.renderMessages();
    }
  },

  promptHumanEscalation() {
    const box = document.getElementById('chatbot-escalate-box');
    if (box) {
      box.classList.remove('hidden');
      const nameIn = document.getElementById('cb-esc-name');
      const phoneIn = document.getElementById('cb-esc-phone');
      if (State.user) {
        if (nameIn && State.user.name) nameIn.value = State.user.name;
        if (phoneIn && (State.user.whatsappPhone || State.user.phone)) {
          phoneIn.value = State.user.whatsappPhone || State.user.phone;
        }
      }
      setTimeout(() => {
        if (nameIn && !nameIn.value) nameIn.focus();
        else if (phoneIn) phoneIn.focus();
      }, 80);
    }
  },

  cancelEscalate() {
    const box = document.getElementById('chatbot-escalate-box');
    if (box) box.classList.add('hidden');
  },

  async submitEscalate(e) {
    e.preventDefault();
    const name = document.getElementById('cb-esc-name')?.value.trim();
    const phone = document.getElementById('cb-esc-phone')?.value.trim() || '';

    if (!name) return;

    try {
      const res = await API.post('/chat/escalate', {
        conversationId: this.conversationId,
        customerName: name,
        phone,
        whatsapp: phone
      });

      this.cancelEscalate();

      if (res.success) {
        this.isWaitingAgent = true;
        this.updateHeaderStatus();
        this.startSync();
        if (res.conversation && res.conversation.messages) {
          this.messages = res.conversation.messages;
          this.renderMessages();
        }
        App.showToast('تم تحويل طلبك لخدمة العملاء بنجاح وسيتم الرد عليك قريباً', 'success');
      }
    } catch (err) {
      App.showToast('فشل تحويل المحادثة', 'error');
    }
  }
};
