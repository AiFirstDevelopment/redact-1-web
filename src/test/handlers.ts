import { http, HttpResponse } from 'msw';

const API_BASE = 'https://redact-1-worker.joelstevick.workers.dev';

// Mock data
export const mockUser = {
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test User',
  role: 'supervisor' as const,
};

export const mockAgency = {
  id: 'agency-1',
  name: 'Springfield Police Department',
  code: 'SPRINGFIELD-PD',
  default_deadline_days: 10,
  deadline_type: 'business_days' as const,
};

export const mockRequest = {
  id: 'req-1',
  request_number: 'RR-20260318-001',
  title: 'Test Request',
  request_date: Date.now(),
  due_date: Date.now() + 10 * 24 * 60 * 60 * 1000, // 10 days from now
  tolled_at: null,
  tolled_days: 0,
  notes: null,
  status: 'new' as const,
  created_by: 'user-1',
  archived_at: null,
  created_at: Date.now(),
  updated_at: Date.now(),
};

export const mockFile = {
  id: 'file-1',
  request_id: 'req-1',
  filename: 'test.pdf',
  file_type: 'pdf' as const,
  mime_type: 'application/pdf',
  file_size: 1024,
  original_r2_key: 'files/test.pdf',
  original_s3_key: null,
  redacted_r2_key: null,
  redacted_s3_key: null,
  status: 'uploaded' as const,
  uploaded_by: 'user-1',
  created_at: Date.now(),
  updated_at: Date.now(),
  detection_count: 1,
  pending_count: 1,
};

export const mockDetection = {
  id: 'det-1',
  file_id: 'file-1',
  detection_type: 'face' as const,
  bbox_x: 0.1,
  bbox_y: 0.1,
  bbox_width: 0.2,
  bbox_height: 0.2,
  page_number: 1,
  text_start: null,
  text_end: null,
  text_content: null,
  confidence: 0.95,
  status: 'pending' as const,
  exemption_code: null,
  comment: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: Date.now(),
};

export const handlers = [
  // Auth
  http.post(`${API_BASE}/api/auth/login`, async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    if (body.email === 'test@test.com' && body.password === 'password') {
      return HttpResponse.json({ token: 'mock-token', user: mockUser, agency: mockAgency });
    }
    if (body.email === 'supervisor@test.com' && body.password === 'test123') {
      return HttpResponse.json({ token: 'mock-token', user: mockUser, agency: mockAgency });
    }
    if (body.email === 'noenroll@test.com' && body.password === 'password') {
      return HttpResponse.json({ token: 'mock-token', user: mockUser });
    }
    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }),

  http.post(`${API_BASE}/api/auth/logout`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.get(`${API_BASE}/api/auth/me`, ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (auth === 'Bearer mock-token') {
      return HttpResponse.json({ user: mockUser, agency: mockAgency });
    }
    if (auth === 'Bearer no-agency-token') {
      return HttpResponse.json({ user: mockUser });
    }
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),

  http.post(`${API_BASE}/api/auth/enroll`, async ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json() as { code: string };
    if (body.code === 'SPRINGFIELD-PD') {
      return HttpResponse.json({ agency: mockAgency });
    }
    return HttpResponse.json({ error: 'Department not found' }, { status: 404 });
  }),

  // Agencies
  http.get(`${API_BASE}/api/agencies/code/:code`, ({ params }) => {
    if (params.code === 'SPRINGFIELD-PD') {
      return HttpResponse.json({ agency: mockAgency });
    }
    return HttpResponse.json({ error: 'Agency not found' }, { status: 404 });
  }),

  http.put(`${API_BASE}/api/agencies/:id`, async ({ params, request }) => {
    const body = await request.json() as { default_deadline_days?: number; deadline_type?: string };
    return HttpResponse.json({
      agency: {
        ...mockAgency,
        id: params.id as string,
        default_deadline_days: body.default_deadline_days ?? mockAgency.default_deadline_days,
        deadline_type: body.deadline_type ?? mockAgency.deadline_type,
      },
    });
  }),

  // Requests
  http.get(`${API_BASE}/api/requests`, ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '25', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    return HttpResponse.json({ requests: [mockRequest], total: 1, limit, offset });
  }),

  http.get(`${API_BASE}/api/requests/archived`, ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '25', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    return HttpResponse.json({ requests: [], total: 0, limit, offset });
  }),

  http.get(`${API_BASE}/api/requests/intake`, ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '25', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    return HttpResponse.json({ requests: [], total: 0, limit, offset });
  }),

  http.post(`${API_BASE}/api/requests/:id/assign`, async ({ params, request }) => {
    const body = await request.json() as { assign_to: string };
    return HttpResponse.json({
      request: {
        ...mockRequest,
        id: params.id as string,
        created_by: body.assign_to,
      },
    });
  }),

  http.get(`${API_BASE}/api/requests/:id`, ({ params }) => {
    if (params.id === 'req-1') {
      return HttpResponse.json({ request: mockRequest });
    }
    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),

  http.post(`${API_BASE}/api/requests`, async ({ request }) => {
    const body = await request.json() as { title: string };
    const newRequest = {
      ...mockRequest,
      id: 'req-new',
      title: body.title || 'New Request',
      request_number: 'RR-20260318-002',
    };
    return HttpResponse.json({ request: newRequest }, { status: 201 });
  }),

  http.put(`${API_BASE}/api/requests/:id`, async ({ params, request }) => {
    const body = await request.json() as Partial<typeof mockRequest>;
    return HttpResponse.json({ request: { ...mockRequest, id: params.id, ...body } });
  }),

  http.delete(`${API_BASE}/api/requests/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${API_BASE}/api/requests/:id/archive`, ({ params }) => {
    return HttpResponse.json({ request: { ...mockRequest, id: params.id, archived_at: Date.now() } });
  }),

  http.post(`${API_BASE}/api/requests/:id/unarchive`, ({ params }) => {
    return HttpResponse.json({ request: { ...mockRequest, id: params.id, archived_at: null } });
  }),

  http.post(`${API_BASE}/api/requests/:id/toll`, ({ params }) => {
    return HttpResponse.json({ request: { ...mockRequest, id: params.id, tolled_at: Date.now() } });
  }),

  http.post(`${API_BASE}/api/requests/:id/resume`, ({ params }) => {
    return HttpResponse.json({ request: { ...mockRequest, id: params.id, tolled_at: null, tolled_days: 1 } });
  }),

  http.post(`${API_BASE}/api/requests/:id/extend`, async ({ params, request }) => {
    const body = await request.json() as { new_due_date: number };
    return HttpResponse.json({ request: { ...mockRequest, id: params.id, due_date: body.new_due_date } });
  }),

  http.get(`${API_BASE}/api/requests/:id/timeline`, ({ params }) => {
    return HttpResponse.json({
      timeline: [
        {
          id: 'timeline-1',
          request_id: params.id,
          event_type: 'created',
          reason: null,
          previous_due_date: null,
          new_due_date: mockRequest.due_date,
          created_by: 'user-1',
          user_name: 'Test User',
          created_at: Date.now(),
        },
      ],
    });
  }),

  http.get(`${API_BASE}/api/requests/:id/audit`, () => {
    return HttpResponse.json({
      audit_logs: [
        {
          id: 'audit-1',
          user_id: 'user-1',
          action: 'create',
          entity_type: 'request',
          entity_id: 'req-1',
          details: null,
          created_at: Date.now(),
        },
      ],
    });
  }),

  // Files
  http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
    return HttpResponse.json({ files: [mockFile] });
  }),

  http.post(`${API_BASE}/api/requests/:requestId/files`, () => {
    return HttpResponse.json({ file: mockFile }, { status: 201 });
  }),

  http.get(`${API_BASE}/api/files/:id`, ({ params }) => {
    return HttpResponse.json({
      file: {
        ...mockFile,
        id: params.id as string,
      },
    });
  }),

  http.get(`${API_BASE}/api/files/:id/original`, () => {
    return new HttpResponse(new Blob(['mock pdf content'], { type: 'application/pdf' }), {
      headers: { 'Content-Type': 'application/pdf' },
    });
  }),

  http.delete(`${API_BASE}/api/files/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${API_BASE}/api/files/:id/mark-reviewed`, ({ params }) => {
    return HttpResponse.json({
      file: { ...mockFile, id: params.id as string, status: 'reviewed' },
    });
  }),

  // Detections
  http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
    return HttpResponse.json({ detections: [mockDetection], manual_redactions: [] });
  }),

  http.post(`${API_BASE}/api/files/:fileId/detections`, () => {
    return HttpResponse.json({ detections: [mockDetection] }, { status: 201 });
  }),

  http.post(`${API_BASE}/api/files/:fileId/detect`, () => {
    return HttpResponse.json({ detections: [mockDetection], count: 1 }, { status: 201 });
  }),

  http.put(`${API_BASE}/api/detections/:id`, async ({ params, request }) => {
    const body = await request.json() as Partial<typeof mockDetection>;
    return HttpResponse.json({ detection: { ...mockDetection, id: params.id, ...body } });
  }),

  // Manual redactions
  http.post(`${API_BASE}/api/files/:fileId/manual-redactions`, () => {
    return HttpResponse.json({
      manual_redaction: {
        id: 'mr-1',
        file_id: 'file-1',
        redaction_type: 'manual',
        bbox_x: 0.1,
        bbox_y: 0.1,
        bbox_width: 0.1,
        bbox_height: 0.1,
        page_number: null,
        created_by: 'user-1',
        created_at: Date.now(),
      },
    }, { status: 201 });
  }),

  http.delete(`${API_BASE}/api/manual-redactions/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Users
  http.get(`${API_BASE}/api/users`, () => {
    return HttpResponse.json({ users: [mockUser] });
  }),

  http.post(`${API_BASE}/api/users`, async ({ request }) => {
    const body = await request.json() as { email: string; name: string; role: string };
    return HttpResponse.json({
      user: { id: 'user-new', ...body },
    }, { status: 201 });
  }),

  http.put(`${API_BASE}/api/users/:id`, async ({ params, request }) => {
    const body = await request.json() as Partial<typeof mockUser>;
    return HttpResponse.json({ user: { ...mockUser, id: params.id as string, ...body } });
  }),

  http.delete(`${API_BASE}/api/users/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Video routes
  http.post(`${API_BASE}/api/requests/:requestId/videos`, () => {
    return HttpResponse.json({
      file: {
        ...mockFile,
        id: 'video-1',
        filename: 'test-video.mp4',
        file_type: 'video',
        mime_type: 'video/mp4',
        original_s3_key: 'videos/test.mp4',
        original_r2_key: null,
      },
    }, { status: 201 });
  }),

  http.post(`${API_BASE}/api/files/:fileId/video/detect`, () => {
    return HttpResponse.json({
      job: {
        id: 'job-1',
        file_id: 'file-1',
        job_type: 'detection',
        status: 'pending',
        progress: 0,
        created_at: Date.now(),
      },
    }, { status: 201 });
  }),

  http.get(`${API_BASE}/api/files/:fileId/video/job`, () => {
    return HttpResponse.json({
      job: {
        id: 'job-1',
        file_id: 'file-1',
        job_type: 'detection',
        status: 'completed',
        progress: 100,
        duration_seconds: 120,
        frame_rate: 30,
        created_at: Date.now(),
      },
    });
  }),

  http.get(`${API_BASE}/api/files/:fileId/video/detections`, () => {
    return HttpResponse.json({
      detections: [
        {
          id: 'vdet-1',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 0,
          end_time_ms: 5000,
          bbox_x: 0.1,
          bbox_y: 0.1,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'face-001',
          confidence: 0.95,
          status: 'pending',
          created_at: Date.now(),
        },
      ],
      tracks: [{ track_id: 'face-001', count: 1 }],
    });
  }),

  http.post(`${API_BASE}/api/files/:fileId/video/detections`, async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      detection: {
        id: 'vdet-new',
        ...body,
        status: body.detection_type === 'manual' ? 'approved' : 'pending',
        created_at: Date.now(),
      },
    }, { status: 201 });
  }),

  http.put(`${API_BASE}/api/video-detections/:id`, async ({ params, request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      detection: {
        id: params.id,
        file_id: 'file-1',
        detection_type: 'face',
        start_time_ms: 0,
        end_time_ms: 5000,
        bbox_x: 0.1,
        bbox_y: 0.1,
        bbox_width: 0.2,
        bbox_height: 0.2,
        track_id: 'face-001',
        ...body,
        reviewed_by: 'user-1',
        reviewed_at: Date.now(),
        created_at: Date.now(),
      },
    });
  }),

  http.put(`${API_BASE}/api/files/:fileId/video/detections/bulk`, async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      success: true,
      count: 5,
      track_id: body.track_id || null,
    });
  }),

  http.delete(`${API_BASE}/api/files/:fileId/video/detections`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${API_BASE}/api/files/:fileId/video/redact`, () => {
    return HttpResponse.json({
      job: {
        id: 'job-2',
        file_id: 'file-1',
        job_type: 'redaction',
        status: 'pending',
        progress: 0,
        created_at: Date.now(),
      },
    }, { status: 201 });
  }),

  http.get(`${API_BASE}/api/files/:fileId/video/stream`, () => {
    return HttpResponse.json({ url: 'https://s3.example.com/presigned-video-url' });
  }),

  http.get(`${API_BASE}/api/files/:fileId/video/stream/redacted`, () => {
    return HttpResponse.json({ url: 'https://s3.example.com/presigned-redacted-url' });
  }),
];
