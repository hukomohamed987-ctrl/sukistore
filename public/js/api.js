/**
 * Suki Store API Client
 * Centralized fetch handler with JWT authorization and error normalization
 */

const API = {
  getToken() {
    return localStorage.getItem('suki_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('suki_token', token);
    } else {
      localStorage.removeItem('suki_token');
    }
  },

  getHeaders(isFormData = false) {
    const headers = {};
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
    const isFormData = options.body instanceof FormData;

    const config = {
      credentials: 'include',
      ...options,
      headers: {
        ...this.getHeaders(isFormData),
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Only trigger auth:expired if user had a token, and NOT on auth submit endpoints
        const isAuthEndpoint = endpoint.includes('/auth/login') ||
                               endpoint.includes('/auth/register') ||
                               endpoint.includes('/auth/send-otp') ||
                               endpoint.includes('/auth/2fa/verify') ||
                               endpoint.includes('/auth/google');

        if (response.status === 401 && !isAuthEndpoint && this.getToken()) {
          window.dispatchEvent(new CustomEvent('auth:expired', { detail: { data } }));
        }

        const error = new Error(data.message || 'حدث خطأ في الاتصال بالخادم');
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  },

  get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  },

  post(endpoint, body = {}) {
    const isFormData = body instanceof FormData;
    return this.request(endpoint, {
      method: 'POST',
      body: isFormData ? body : JSON.stringify(body)
    });
  },

  put(endpoint, body = {}) {
    const isFormData = body instanceof FormData;
    return this.request(endpoint, {
      method: 'PUT',
      body: isFormData ? body : JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // Download a file (e.g. an Excel export) with the user's session
  async download(endpoint, params = {}, fallbackName = 'export.xlsx') {
    const query = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))).toString();
    const url = `/api${endpoint}${query ? '?' + query : ''}`;
    const response = await fetch(url, { credentials: 'include', headers: this.getHeaders() });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'فشل تحميل الملف');
    }
    const blob = await response.blob();
    const cd = response.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
    const name = m ? decodeURIComponent(m[1]) : fallbackName;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return name;
  },

  upload(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/upload/single', {
      method: 'POST',
      body: formData
    });
  },

  uploadMultiple(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    return this.request('/upload/multiple', {
      method: 'POST',
      body: formData
    });
  },

  uploadVideo(file) {
    const formData = new FormData();
    formData.append('video', file);
    return this.request('/upload/video', {
      method: 'POST',
      body: formData
    });
  }
};
