// src/api/apiClient.js
import axios from "axios";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
export const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
});

export function attachToken(token) {
  if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete api.defaults.headers.common["Authorization"];
}

function mapLeadsParams(params = {}) {
  const p = {};
  if (params.q !== undefined) p.search = params.q;
  if (params.search !== undefined) p.search = params.search;
  if (params.brand) p.brand = params.brand;
  if (params.source) p.source = params.source;
  if (params.assignedTo) p.counsellor = params.assignedTo;
  if (params.counsellor) p.counsellor = params.counsellor;
  if (params.course) p.course = params.course;
  if (params.status) p.status = params.status;
  if (params.quick) p.quickFilter = params.quick;
  if (params.quickFilter) p.quickFilter = params.quickFilter;
  if (params.sortBy) p.sortBy = params.sortBy;
  if (params.sort) p.sortBy = params.sort;
  p.page = params.page ?? params.p ?? 1;
  p.limit = params.limit ?? 25;
  if (params.limit === 0) p.limit = 0;
  return p;
}

function normalizeLeadsResp(res) {
  const payload = res?.data ?? res ?? {};
  if (payload && typeof payload === "object" && (payload.results || payload.total !== undefined)) {
    const leads = Array.isArray(payload.results) ? payload.results : (Array.isArray(payload.data) ? payload.data : []);
    return {
      leads: Array.isArray(leads) ? leads : [],
      total: payload.total ?? (Array.isArray(leads) ? leads.length : 0),
      page: payload.page ?? 1,
      limit: payload.limit ?? (Array.isArray(leads) ? leads.length : 0),
      raw: payload
    };
  }

  const arr = payload.leads || payload.data || payload.docs || (Array.isArray(payload) ? payload : []);
  const leads = Array.isArray(arr) ? arr : [];
  const total = payload.total ?? payload.count ?? leads.length;
  return { leads, total, page: 1, limit: leads.length, raw: payload };
}

function safeData(res) {
  return res?.data ?? res;
}

export const AdminAPI = {
  login: (body) => api.post("/auth/login", body),
  me: () => api.get("/auth/me"),

  // Leads
  getLeads: async (params = {}) => {
    const mapped = mapLeadsParams(params);
    const res = await api.get("/leads", { params: mapped });
    return normalizeLeadsResp(res);
  },
  getLead: (id) => api.get(`/leads/${id}`),
  createLead: (body) => api.post("/leads", body),
  updateLead: (id, body) => api.put(`/leads/${id}`, body),
  deleteLead: (id) => api.delete(`/leads/${id}`),

  // Attempts / Remarks / Demos
  getAttempts: (leadId) => api.get(`/leads/${leadId}/attempts`),
  addAttempt: (leadId, body) => api.post(`/leads/${leadId}/attempts`, body),

  getRemarks: (leadId) => api.get(`/leads/${leadId}/remarks`),
  addRemark: (leadId, body) => api.post(`/leads/${leadId}/remarks`, body),

  bookDemo: (leadId, body) => api.post(`/leads/${leadId}/demos`, body),
  getDemos: (leadId) => api.get(`/leads/${leadId}/demos`),
  updateDemo: (demoId, body) => api.put(`/leads/demos/${demoId}`, body),

  importLeads: (formData, onUploadProgress) =>
    api.post("/import/leads", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    }).then(r => r.data),

  getImportStatus: (jobId) => api.get(`/admin/leads/import/status/${jobId}`).then(r => r.data),

  // Conversions & payments
  convertLead: (leadId, body) => api.post(`/conversions/${leadId}/convert`, body),
  convertedLead: (leadId, query = {}) => api.get(`/conversions/${leadId}/converted`, { params: query }),
  addPayment: (leadId, body) => api.post(`/conversions/${leadId}/payments`, body),
  getPayments: (leadId, query = {}) => api.get(`/conversions/${leadId}/payments`, { params: query }),
  scheduleReminder: (leadId, body) => api.post(`/conversions/${leadId}/schedule-reminder`, body),
  markFullyPaid: (leadId, body) => api.post(`/conversions/${leadId}/mark-paid`, body),

  // WhatsApp helper
  getWhatsAppUrl: (leadId, opts = {}) => api.get(`/leads/${leadId}/whatsapp-url`, { params: opts }),

  // Brands
  getBrands: (params = {}) => {
    const p = { ...(params || {}) };
    // support populateCourses flag for convenience
    if (p.populateCourses) p.populateCourses = p.populateCourses === true || p.populateCourses === "true";
    return api.get("/brands", { params: p });
  },
  getBrand: (id, opts = {}) => {
    const params = {};
    if (opts.populateCourses) params.populateCourses = true;
    return api.get(`/brands/${id}`, { params });
  },
  createBrand: (body) => {
    if (body instanceof FormData) {
      return api.post("/brands", body, { headers: { "Content-Type": "multipart/form-data" } });
    }
    return api.post("/brands", body);
  },
  updateBrand: (id, body) => {
    if (body instanceof FormData) {
      return api.put(`/brands/${id}`, body, { headers: { "Content-Type": "multipart/form-data" } });
    }
    return api.put(`/brands/${id}`, body);
  },
  deleteBrand: (id, opts = {}) => {
    const params = {};
    if (opts.force) params.force = true;
    return api.delete(`/brands/${id}`, { params });
  },

  // Brand -> Courses helper
  getBrandCourses: (brandId) => api.get(`/brands/${brandId}/courses`).then(safeData),

  // Courses (CRUD)
  getCourses: (params = {}) => {
    const { q, active, page, limit } = params;
    const p = {};
    if (q) p.q = q;
    if (active !== undefined) p.active = active;
    if (page) p.page = page;
    if (limit) p.limit = limit;
    return api.get("/courses", { params: p }).then(safeData);
  },
  getCourse: (id) => api.get(`/courses/${id}`).then(safeData),
  createCourse: (body) => api.post("/courses", body).then(safeData),
  updateCourse: (id, body) => api.put(`/courses/${id}`, body).then(safeData),
  deleteCourse: (id, opts = {}) => {
    const params = {};
    if (opts.force) params.force = true;
    return api.delete(`/courses/${id}`, { params }).then(safeData);
  },

  // Reports: course performance
  getCoursePerformance: (params = {}) => {
    // params: from, to, courseId, brandId, page, limit, etc.
    return api.get("/admin/course-performance", { params }).then(safeData);
  },

  // Admin utilities
  createUser: (body) => api.post("/admin/users", body),
  updateUser: (id, body) => api.put(`/admin/users/${id}`, body),
  getAuditLogs: (params = {}) => api.get("/admin/audit-logs", { params }),
  reassignLeads: (body) => api.post("/admin/reassign", body),
  getReportsSummary: async (params = {}) => {
    try {
      return await api.get("/admin/reports/summary", { params });
    } catch (err) {
      return api.get("/reports/summary", { params });
    }
  },

  // Counsellors helper (robust tries)
  getCounsellors: async (opts = {}) => {
    // allow optional filtering by courseId
    const tries = [
      { url: "/admin/users", params: { role: "counsellor", ...(opts.courseId ? { courseId: opts.courseId } : {}) } },
      { url: "/users", params: { role: "counsellor", ...(opts.courseId ? { courseId: opts.courseId } : {}) } },
    ];

    for (const t of tries) {
      try {
        const res = await api.get(t.url, { params: t.params });
        const payload = res?.data ?? res;
        const arr = payload?.users || payload?.data || (Array.isArray(payload) ? payload : null);
        if (Array.isArray(arr)) return { data: arr, users: arr };
        return res;
      } catch (err) {
        const status = err?.response?.status;
        if (status === 404 || status === 405 || status === 401 || status === 403) {
          continue;
        }
        throw err;
      }
    }
    return { data: [], users: [] };
  },

  // Assign courses to a user (admin)
  assignCoursesToUser: (userId, courseIds = []) => api.post(`/admin/users/${userId}/assign-courses`, { courseIds }).then(safeData),

  // generic raw ops
  rawGet: (url, opts = {}) => api.get(url, opts),
  rawPost: (url, body, opts = {}) => api.post(url, body, opts),
  rawPut: (url, body, opts = {}) => api.put(url, body, opts),
  rawDelete: (url, opts = {}) => api.delete(url, opts),
};

export default AdminAPI;
