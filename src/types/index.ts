export interface User {
  id: string;
  email: string;
  name: string;
  role: 'clerk' | 'supervisor';
}

export interface Request {
  id: string;
  request_number: string;
  title: string;
  request_date: number;
  notes: string | null;
  status: 'new' | 'in_progress' | 'completed';
  created_by: string;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface EvidenceFile {
  id: string;
  request_id: string;
  filename: string;
  file_type: 'image' | 'pdf';
  mime_type: string;
  file_size: number;
  original_r2_key: string;
  redacted_r2_key: string | null;
  status: 'uploaded' | 'processing' | 'detected' | 'reviewed' | 'exported';
  uploaded_by: string;
  created_at: number;
  updated_at: number;
}

export interface Detection {
  id: string;
  file_id: string;
  detection_type: 'face' | 'plate' | 'ssn' | 'phone' | 'email' | 'address' | 'dob';
  bbox_x: number | null;
  bbox_y: number | null;
  bbox_width: number | null;
  bbox_height: number | null;
  page_number: number | null;
  text_start: number | null;
  text_end: number | null;
  text_content: string | null;
  confidence: number | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
}

export interface ManualRedaction {
  id: string;
  file_id: string;
  redaction_type: string;
  bbox_x: number | null;
  bbox_y: number | null;
  bbox_width: number | null;
  bbox_height: number | null;
  page_number: number | null;
  created_by: string;
  created_at: number;
}

export interface LoginResponse {
  token: string;
  user: User;
}
