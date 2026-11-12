/**
 * Suki Store Admin - Live Customer Support Chat Management
 * Implements:
 * - Queue of customer support requests
 * - First-responder lock mechanism (Claim & Lock)
 * - Notice when another staff member is handling a conversation
 * - Live messaging between staff and customer
 * - Resolve / close conversation action
 */

const LiveChatAdmin = {
  conversations: [],
  selectedChatId: null,
  activeChat: null,
  currentTab: 'waiting_agent', // 'waiting_agent', 'in_progress', 'resolved', 'all'
  refreshTimer: null,

  async render() {
    AdminLayout.render('live-chat', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب محادثات الدعم الفني المباشر...</div>
      </div>
    `);

    await this.fetchConversations();
    this.renderUI();
    this.startAutoRefresh();
  },

  startAutoRefresh() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(async () => {
      // Only refresh if currently on live-chat page
      if (window.location.hash.includes('admin/live-chat')) {
        await this.fetchConversations(false);
        this.renderUI(true);
      } else {
        clearInterval(this.refreshTimer);
      }
    }, 5000);
  },

  async fetchConversations(showLoading = true) {
    try {
      const params = {};
      if (this.currentTab !== 'all') {
        params.status = this.currentTab;
      }
      const res = await API.get('/chat/conversations', params);
      this.conversations = res.chats || [];

      // If active chat selected, refresh its details
      if (this.selectedChatId) {
        const detailRes = await API.get(`/chat/conversations/${this.selectedChatId}`);
        if (detailRes.success) {
          this.activeChat = detailRes.conversation;
        }
      } else if (this.conversations.length > 0 && !this.selectedChatId) {
        this.selectedChatId = this.conversations[0].id;
        this.activeChat = this.conversations[0];
      }
    } catch (err) {
      console.error('Fetch chats error:', err);
    }
  },

  renderUI(preserveScroll = false) {
    const waitingCount = this.conversations.filter(c => c.status === 'waiting_agent').length;
    const currentUserId = State.user ? State.user.id : null;

    const html = `
      <div>
        <!-- Page Header -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-headset text-emerald-600"></i>
              <span>لوحة خدمة العملاء والمحادثات المباشرة</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">الرد على استفسارات العملاء المحولة من الشات بوت الذكي ونظام الاستلام الحصري للموظفين</p>
          </div>
          <button onclick="LiveChatAdmin.manualRefresh()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5">
            <i class="fa-solid fa-rotate-right"></i>
            <span>تحديث الآن</span>
          </button>
        </div>

        <!-- Filter Tabs -->
        <div class="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <button onclick="LiveChatAdmin.switchTab('waiting_agent')" class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${this.currentTab === 'waiting_agent' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200'}">
            <span class="w-2 h-2 rounded-full ${waitingCount > 0 ? 'bg-white animate-ping' : 'bg-red-400'}"></span>
            <span>في انتظار الاستلام</span>
            ${waitingCount > 0 ? `<span class="bg-white text-red-600 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold">${waitingCount}</span>` : ''}
          </button>

          <button onclick="LiveChatAdmin.switchTab('in_progress')" class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${this.currentTab === 'in_progress' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}">
            <i class="fa-solid fa-comments ml-1"></i>
            <span>قيد المتابعة</span>
          </button>

          <button onclick="LiveChatAdmin.switchTab('resolved')" class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${this.currentTab === 'resolved' ? 'bg-slate-700 text-white' : 'bg-white text-slate-700 border border-slate-200'}">
            <i class="fa-solid fa-circle-check ml-1"></i>
            <span>تم الحل</span>
          </button>

          <button onclick="LiveChatAdmin.switchTab('all')" class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${this.currentTab === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}">
            <span>جميع المحادثات</span>
          </button>
        </div>

        <!-- Chat Workspace Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[680px]">
          <!-- Conversations List (4 cols) -->
          <div class="lg:col-span-4 admin-card p-0 flex flex-col overflow-hidden h-full">
            <div class="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <span class="font-bold text-xs text-slate-700">قائمة المحادثات (${this.conversations.length})</span>
              <span class="text-[10px] text-slate-400">تحديث تلقائي كل 5 ثوانٍ</span>
            </div>

            <div class="flex-1 overflow-y-auto divide-y divide-slate-100">
              ${this.conversations.length === 0 ? `
                <div class="p-8 text-center text-slate-400 text-xs">
                  <i class="fa-solid fa-inbox text-3xl mb-2 text-slate-300"></i>
                  <div>لا توجد محادثات في هذا القسم حالياً</div>
                </div>
              ` : this.conversations.map(c => {
                const isSelected = this.selectedChatId === c.id;
                const lastMsg = c.messages && c.messages.length > 0 ? c.messages[c.messages.length - 1] : null;
                const isWaiting = c.status === 'waiting_agent';
                const isMyClaim = c.claimedBy && c.claimedBy.id === currentUserId;
                const isOtherClaim = c.claimedBy && c.claimedBy.id !== currentUserId && c.status === 'in_progress';

                return `
                  <div onclick="LiveChatAdmin.selectChat('${c.id}')" class="p-3 cursor-pointer transition-all hover:bg-slate-50 ${isSelected ? 'bg-emerald-50/60 border-r-4 border-r-emerald-600' : ''}">
                    <div class="flex items-center justify-between mb-1">
                      <div class="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                        <i class="fa-solid fa-user text-slate-400 text-[10px]"></i>
                        <span>${c.customer?.name || 'عميل سوقي ستور'}</span>
                      </div>
                      <span class="text-[10px] text-slate-400 font-mono">
                        ${new Date(c.updatedAt || c.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div class="text-[11px] text-slate-500 truncate mb-2">
                      ${lastMsg ? (lastMsg.text || 'محادثة جارية...') : 'طلب محادثة'}
                    </div>

                    <div class="flex items-center justify-between text-[10px]">
                      <div>
                        ${isWaiting ? `
                          <span class="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                            في الانتظار
                          </span>
                        ` : isMyClaim ? `
                          <span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            مستلمة بواسطتك ✅
                          </span>
                        ` : isOtherClaim ? `
                          <span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full truncate max-w-[120px]">
                            متابعة: ${c.claimedBy.name} 🔒
                          </span>
                        ` : `
                          <span class="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                            تم الحل ⭐
                          </span>
                        `}
                      </div>

                      ${c.customer?.phone ? `
                        <span class="font-mono text-slate-400">${c.customer.phone}</span>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Chat Detail & Messaging View (8 cols) -->
          <div class="lg:col-span-8 admin-card p-0 flex flex-col overflow-hidden h-full">
            ${!this.activeChat ? `
              <div class="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                <i class="fa-solid fa-comments text-5xl mb-3 text-slate-200"></i>
                <div class="text-sm font-bold">اختر محادثة من القائمة لعرض تفاصيلها والتواصل مع العميل</div>
              </div>
            ` : this.renderActiveChatBox(currentUserId)}
          </div>
        </div>
      </div>
    `;

    AdminLayout.render('live-chat', html);

    // Scroll to bottom of message list
    const msgBox = document.getElementById('chat-messages-container');
    if (msgBox) {
      msgBox.scrollTop = msgBox.scrollHeight;
    }
  },

  renderActiveChatBox(currentUserId) {
    const c = this.activeChat;
    const isWaiting = c.status === 'waiting_agent';
    const isMyClaim = c.claimedBy && c.claimedBy.id === currentUserId;
    const isOtherClaim = c.claimedBy && c.claimedBy.id !== currentUserId && c.status === 'in_progress';
    const isResolved = c.status === 'resolved';

    return `
      <!-- Chat Header -->
      <div class="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
            ${(c.customer?.name || 'ع')[0]}
          </div>
          <div>
            <div class="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <span>${c.customer?.name || 'عميل سوقي ستور'}</span>
              ${c.customer?.whatsapp ? `
                <a href="https://wa.me/${c.customer.whatsapp.replace(/[^0-9]/g, '')}" target="_blank" class="text-emerald-600 hover:text-emerald-700 text-xs font-bold inline-flex items-center gap-1" title="محادثة واتساب مباشرة">
                  <i class="fa-brands fa-whatsapp text-sm"></i>
                  <span>${c.customer.whatsapp}</span>
                </a>
              ` : ''}
            </div>
            <div class="text-xs text-slate-500 font-mono">
              هاتف: ${c.customer?.phone || 'غير محدد'} • بدء المحادثة: ${new Date(c.createdAt).toLocaleTimeString('ar-EG')}
            </div>
          </div>
        </div>

        <!-- Action Buttons in Header -->
        <div class="flex items-center gap-2">
          ${isWaiting ? `
            <button onclick="LiveChatAdmin.claimChat('${c.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md animate-bounce">
              <i class="fa-solid fa-lock"></i>
              <span>استلام المحادثة وتثبيتها باسمي</span>
            </button>
          ` : isMyClaim && !isResolved ? `
            <button onclick="LiveChatAdmin.resolveChat('${c.id}')" class="bg-slate-700 hover:bg-slate-800 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5">
              <i class="fa-solid fa-check"></i>
              <span>إنهاء المحادثة (تم الحل)</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Lock Notice Banner if claimed by someone else -->
      ${isOtherClaim ? `
        <div class="bg-amber-50 border-b border-amber-200 p-2.5 px-4 text-xs font-bold text-amber-900 flex items-center gap-2">
          <i class="fa-solid fa-lock text-amber-600"></i>
          <span>هذه المحادثة قيد المتابعة بواسطة: <strong>${c.claimedBy.name}</strong> 🔒 (لا يمكن لغيره الرد لضمان خصوصية المحادثة)</span>
        </div>
      ` : ''}

      ${isResolved ? `
        <div class="bg-slate-100 border-b border-slate-200 p-2.5 px-4 text-xs font-bold text-slate-700 flex items-center gap-2">
          <i class="fa-solid fa-circle-check text-emerald-600"></i>
          <span>تم إغلاق هذه المحادثة وحل استفسار العميل بنجاح ⭐</span>
        </div>
      ` : ''}

      <!-- Message History Container -->
      <div id="chat-messages-container" class="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
        ${(!c.messages || c.messages.length === 0) ? `
          <div class="text-center py-10 text-slate-400 text-xs">لا توجد رسائل سابقة في هذه المحادثة</div>
        ` : c.messages.map(m => {
          const isMe = m.sender === 'staff';
          const isBot = m.sender === 'bot';
          const isSystem = m.sender === 'system';
          const isCust = m.sender === 'customer';

          if (isSystem) {
            return `
              <div class="text-center my-2">
                <span class="bg-slate-200 text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full inline-block">
                  ${m.text}
                </span>
              </div>
            `;
          }

          if (isBot) {
            return `
              <div class="flex justify-start">
                <div class="bg-emerald-50 text-emerald-950 border border-emerald-200 rounded-2xl rounded-tr-none p-3 max-w-[80%] text-xs shadow-sm">
                  <div class="text-[10px] font-bold text-emerald-700 mb-1 flex items-center gap-1">
                    <i class="fa-solid fa-robot"></i> رد الشات بوت الآلي
                  </div>
                  <div>${m.text}</div>
                </div>
              </div>
            `;
          }

          if (isMe) {
            return `
              <div class="flex justify-end">
                <div class="bg-emerald-600 text-white rounded-2xl rounded-tl-none p-3 max-w-[80%] text-xs shadow-sm">
                  <div class="text-[10px] font-bold text-emerald-100 mb-1 flex items-center gap-1 justify-end">
                    <i class="fa-solid fa-headset"></i> ${m.staffName || 'أنت'}
                  </div>
                  <div>${m.text}</div>
                  <div class="text-[9px] text-emerald-200 text-left mt-1 font-mono">
                    ${new Date(m.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            `;
          }

          // Customer message
          return `
            <div class="flex justify-start">
              <div class="bg-white text-slate-800 border border-slate-200 rounded-2xl rounded-tr-none p-3 max-w-[80%] text-xs shadow-sm">
                <div class="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                  <i class="fa-solid fa-user"></i> ${c.customer?.name || 'العميل'}
                </div>
                <div>${m.text}</div>
                <div class="text-[9px] text-slate-400 text-right mt-1 font-mono">
                  ${new Date(m.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Message Reply Input Box -->
      <div class="p-3 border-t border-slate-200 bg-white">
        ${isOtherClaim ? `
          <div class="text-center py-2 text-xs text-slate-400 font-semibold">
            المحادثة مغلقة حالياً للرد لأنها مستلمة من زميلك.
          </div>
        ` : isResolved ? `
          <div class="text-center py-2 text-xs text-slate-400 font-semibold">
            المحادثة مغلقة. يمكنك إعادة فتحها عند استلام رسالة جديدة من العميل.
          </div>
        ` : !isMyClaim ? `
          <div class="text-center py-2">
            <button onclick="LiveChatAdmin.claimChat('${c.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2 rounded-xl text-xs">
              <i class="fa-solid fa-lock ml-1"></i> اضغط هنا لاستلام المحادثة وبدء الرد
            </button>
          </div>
        ` : `
          <form onsubmit="LiveChatAdmin.sendReply(event, '${c.id}')" class="flex gap-2">
            <input 
              type="text" 
              id="staff-reply-input" 
              class="form-control text-xs flex-1" 
              placeholder="اكتب ردك للعميل هنا..." 
              required 
              autocomplete="off"
            />
            <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm">
              <i class="fa-solid fa-paper-plane"></i>
              <span>إرسال الرد</span>
            </button>
          </form>
        `}
      </div>
    `;
  },

  async selectChat(id) {
    this.selectedChatId = id;
    try {
      const res = await API.get(`/chat/conversations/${id}`);
      if (res.success) {
        this.activeChat = res.conversation;
        this.renderUI();
      }
    } catch (err) {
      App.showToast('فشل تحميل المحادثة', 'error');
    }
  },

  async switchTab(tab) {
    this.currentTab = tab;
    await this.fetchConversations();
    this.renderUI();
  },

  async manualRefresh() {
    await this.fetchConversations();
    this.renderUI();
    App.showToast('تم تحديث المحادثات', 'info');
  },

  async claimChat(id) {
    try {
      const res = await API.post(`/chat/conversations/${id}/claim`);
      if (res.success) {
        App.showToast(res.message, 'success');
        this.activeChat = res.conversation;
        await this.fetchConversations(false);
        this.renderUI();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل استلام المحادثة', 'error');
    }
  },

  async sendReply(e, id) {
    e.preventDefault();
    const input = document.getElementById('staff-reply-input');
    if (!input || !input.value.trim()) return;

    const msg = input.value.trim();
    input.value = '';

    try {
      const res = await API.post(`/chat/conversations/${id}/reply`, { message: msg });
      if (res.success) {
        this.activeChat = res.conversation;
        await this.fetchConversations(false);
        this.renderUI();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل إرسال الرد', 'error');
    }
  },

  async resolveChat(id) {
    App.confirm('هل أنت متأكد من إنهاء هذه المحادثة وإغلاقها بعد حل مشكلة العميل؟', async () => {
      try {
        const res = await API.put(`/chat/conversations/${id}/resolve`);
        if (res.success) {
          App.showToast(res.message, 'success');
          this.activeChat = res.conversation;
          await this.fetchConversations(false);
          this.renderUI();
        }
      } catch (err) {
        App.showToast(err.message || 'فشل إغلاق المحادثة', 'error');
      }
    });
  }
};
