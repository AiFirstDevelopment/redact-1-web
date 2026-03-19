import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetectionToolbar } from './DetectionToolbar';

describe('DetectionToolbar', () => {
  const defaultProps = {
    position: { left: 100, top: 200 },
    exemptionCode: 'b6' as const,
    comment: '',
    onExemptionCodeChange: vi.fn(),
    onCommentChange: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
  };

  it('renders at the specified position', () => {
    render(<DetectionToolbar {...defaultProps} />);

    const toolbar = screen.getByTestId('detection-toolbar');
    expect(toolbar).toHaveStyle({ left: '100px', top: '200px' });
  });

  it('displays the current exemption code', () => {
    render(<DetectionToolbar {...defaultProps} exemptionCode="b7c" />);

    const select = screen.getByTestId('exemption-select');
    expect(select).toHaveValue('b7c');
  });

  it('displays the current comment', () => {
    render(<DetectionToolbar {...defaultProps} comment="Test comment" />);

    const input = screen.getByTestId('comment-input');
    expect(input).toHaveValue('Test comment');
  });

  it('calls onExemptionCodeChange when select changes', async () => {
    const onExemptionCodeChange = vi.fn();
    const user = userEvent.setup();

    render(<DetectionToolbar {...defaultProps} onExemptionCodeChange={onExemptionCodeChange} />);

    const select = screen.getByTestId('exemption-select');
    await user.selectOptions(select, 'b7c');

    expect(onExemptionCodeChange).toHaveBeenCalledWith('b7c');
  });

  it('calls onCommentChange when input changes', async () => {
    const onCommentChange = vi.fn();
    const user = userEvent.setup();

    render(<DetectionToolbar {...defaultProps} onCommentChange={onCommentChange} />);

    const input = screen.getByTestId('comment-input');
    await user.type(input, 'New comment');

    expect(onCommentChange).toHaveBeenCalled();
  });

  it('calls onApprove when approve button is clicked', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();

    render(<DetectionToolbar {...defaultProps} onApprove={onApprove} />);

    await user.click(screen.getByTestId('approve-button'));

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onReject when reject button is clicked', async () => {
    const onReject = vi.fn();
    const user = userEvent.setup();

    render(<DetectionToolbar {...defaultProps} onReject={onReject} />);

    await user.click(screen.getByTestId('reject-button'));

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('renders all exemption code options', () => {
    render(<DetectionToolbar {...defaultProps} />);

    const select = screen.getByTestId('exemption-select');
    const options = select.querySelectorAll('option');

    // Should have options for all exemption codes
    expect(options.length).toBeGreaterThan(0);
  });

  it('has correct button titles for accessibility', () => {
    render(<DetectionToolbar {...defaultProps} />);

    expect(screen.getByTitle('Approve')).toBeInTheDocument();
    expect(screen.getByTitle('Reject')).toBeInTheDocument();
  });

  it('shows placeholder text in comment input', () => {
    render(<DetectionToolbar {...defaultProps} />);

    const input = screen.getByPlaceholderText('Add note...');
    expect(input).toBeInTheDocument();
  });
});
