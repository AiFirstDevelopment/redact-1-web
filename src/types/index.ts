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
  file_count?: number;
  files_completed?: number;
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
  detection_count?: number;
  pending_count?: number;
}

export interface Detection {
  id: string;
  file_id: string;
  detection_type: 'face' | 'plate' | 'ssn' | 'phone' | 'email' | 'address' | 'dob' | 'manual';
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
  exemption_code: string | null;
  comment: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
}

export type ExemptionCode =
  | 'b1'      // National security
  | 'b2'      // Internal agency rules
  | 'b3'      // Statutory exemption
  | 'b4'      // Trade secrets
  | 'b5'      // Privileged communications
  | 'b6'      // Personal privacy
  | 'b7a'     // Law enforcement - interference
  | 'b7c'     // Law enforcement - personal privacy
  | 'b7d'     // Law enforcement - confidential source
  | 'b7e'     // Law enforcement - techniques
  | 'b7f'     // Law enforcement - safety
  | 'other';  // Other/custom

export const EXEMPTION_LABELS: Record<ExemptionCode, string> = {
  'b1': '(b)(1) National Security',
  'b2': '(b)(2) Internal Rules',
  'b3': '(b)(3) Statutory',
  'b4': '(b)(4) Trade Secrets',
  'b5': '(b)(5) Privileged',
  'b6': '(b)(6) Personal Privacy',
  'b7a': '(b)(7)(A) LE Interference',
  'b7c': '(b)(7)(C) LE Privacy',
  'b7d': '(b)(7)(D) Confidential Source',
  'b7e': '(b)(7)(E) Techniques',
  'b7f': '(b)(7)(F) Safety',
  'other': 'Other',
};

// Default exemption codes based on detection type
export const DEFAULT_EXEMPTION_CODES: Record<Detection['detection_type'], ExemptionCode> = {
  'face': 'b7c',
  'plate': 'b7c',
  'ssn': 'b6',
  'phone': 'b6',
  'email': 'b6',
  'address': 'b6',
  'dob': 'b6',
  'manual': 'b6',
};

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
