import { ExemptionCode, EXEMPTION_LABELS } from '../types';

interface DetectionToolbarProps {
  position: { left: number; top: number };
  exemptionCode: ExemptionCode;
  comment: string;
  onExemptionCodeChange: (code: ExemptionCode) => void;
  onCommentChange: (comment: string) => void;
  onApprove: () => void;
  onReject: () => void;
}

export function DetectionToolbar({
  position,
  exemptionCode,
  comment,
  onExemptionCodeChange,
  onCommentChange,
  onApprove,
  onReject,
}: DetectionToolbarProps) {
  return (
    <div
      className="absolute bg-[#252530] rounded-lg shadow-xl p-3 flex items-center gap-2 z-50"
      style={{
        left: position.left,
        top: position.top,
      }}
      data-testid="detection-toolbar"
    >
      <select
        value={exemptionCode}
        onChange={(e) => onExemptionCodeChange(e.target.value as ExemptionCode)}
        className="bg-gray-700 text-white text-sm rounded px-2 py-1.5 border-0 outline-none cursor-pointer"
        data-testid="exemption-select"
      >
        {Object.entries(EXEMPTION_LABELS).map(([code, label]) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Justification (required)"
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        className={`bg-gray-700 text-white text-sm rounded px-2 py-1.5 w-36 outline-none placeholder-gray-400 ${!comment.trim() ? 'border border-yellow-500' : 'border border-transparent'}`}
        data-testid="comment-input"
      />
      <button
        onClick={onApprove}
        disabled={!comment.trim()}
        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={comment.trim() ? 'Approve' : 'Enter justification to approve'}
        data-testid="approve-button"
      >
        ✓
      </button>
      <button
        onClick={onReject}
        disabled={!comment.trim()}
        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={comment.trim() ? 'Reject' : 'Enter justification to reject'}
        data-testid="reject-button"
      >
        ✗
      </button>
    </div>
  );
}
