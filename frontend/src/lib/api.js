import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('spreetail_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('spreetail_token');
      localStorage.removeItem('spreetail_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth ─────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// ── Groups ───────────────────────────────────────────────────
export const groupsApi = {
  list: () => api.get('/groups'),
  create: (data) => api.post('/groups', data),
  get: (id) => api.get(`/groups/${id}`),
  inviteMember: (id, data) => api.post(`/groups/${id}/members`, data),
  setMemberLeft: (id, userId, leftAt) => api.patch(`/groups/${id}/members/${userId}`, { leftAt }),
  getActivity: (id, params) => api.get(`/groups/${id}/activity`, { params }),
};

// ── Expenses ─────────────────────────────────────────────────
export const expensesApi = {
  list: (groupId, params) => api.get(`/groups/${groupId}/expenses`, { params }),
  create: (groupId, data) => api.post(`/groups/${groupId}/expenses`, data),
  get: (id) => api.get(`/expenses/${id}`),
  update: (id, data) => api.patch(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

// ── Balances & Settlements ────────────────────────────────────
export const balancesApi = {
  get: (groupId) => api.get(`/groups/${groupId}/balances`),
  drilldown: (groupId, userId) => api.get(`/groups/${groupId}/balances/${userId}/drilldown`),
  recordSettlement: (groupId, data) => api.post(`/groups/${groupId}/settlements`, data),
  listSettlements: (groupId) => api.get(`/groups/${groupId}/settlements`),
};

// ── Import ───────────────────────────────────────────────────
export const importApi = {
  upload: (groupId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('groupId', groupId);
    return api.post('/import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getSession: (sessionId) => api.get(`/import/${sessionId}`),
  resolveAnomaly: (sessionId, anomalyId, data) =>
    api.patch(`/import/${sessionId}/anomalies/${anomalyId}`, data),
  bulkResolve: (sessionId, data) => api.patch(`/import/${sessionId}/anomalies`, data),
  confirm: (sessionId) => api.post(`/import/${sessionId}/confirm`),
  getReport: (sessionId) => api.get(`/import/${sessionId}/report`),
};
