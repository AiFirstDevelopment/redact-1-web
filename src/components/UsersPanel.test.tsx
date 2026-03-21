import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UsersPanel } from './UsersPanel';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

// Mock the API
vi.mock('../services/api', () => ({
  api: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

// Mock the auth store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

const mockCurrentUser = {
  id: 'current-user-id',
  email: 'current@test.com',
  name: 'Current User',
  role: 'supervisor' as const,
};

const mockUsers = [
  { id: 'current-user-id', email: 'current@test.com', name: 'Current User', role: 'supervisor' as const, auth_status: 'active' as const },
  { id: 'user-2', email: 'other@test.com', name: 'Other User', role: 'clerk' as const, auth_status: 'invited' as const },
  { id: 'user-3', email: 'signing@test.com', name: 'Signing User', role: 'clerk' as const, auth_status: 'signing_up' as const },
];

describe('UsersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as any).mockReturnValue({ user: mockCurrentUser });
    (api.listUsers as any).mockResolvedValue({ users: mockUsers });
  });

  describe('User List', () => {
    it('should display users with their information', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Current User')).toBeInTheDocument();
      });

      expect(screen.getByText('current@test.com')).toBeInTheDocument();
      expect(screen.getByText('Other User')).toBeInTheDocument();
      expect(screen.getByText('other@test.com')).toBeInTheDocument();
    });

    it('should display auth_status badges', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('active')).toBeInTheDocument();
      });

      expect(screen.getByText('invited')).toBeInTheDocument();
      expect(screen.getByText('signing up')).toBeInTheDocument();
    });

    it('should display role badges', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Current User')).toBeInTheDocument();
      });

      const supervisorBadges = screen.getAllByText('supervisor');
      const clerkBadges = screen.getAllByText('clerk');
      expect(supervisorBadges.length).toBeGreaterThan(0);
      expect(clerkBadges.length).toBeGreaterThan(0);
    });

    it('should show loading state', () => {
      (api.listUsers as any).mockImplementation(() => new Promise(() => {}));
      render(<UsersPanel />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should show empty state when no users', async () => {
      (api.listUsers as any).mockResolvedValue({ users: [] });
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('No users found.')).toBeInTheDocument();
      });
    });
  });

  describe('Delete User', () => {
    it('should hide delete button for current user', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Current User')).toBeInTheDocument();
      });

      // Get all delete buttons - should only have 2 (for other users, not current user)
      const deleteButtons = screen.getAllByText('Delete');
      expect(deleteButtons).toHaveLength(2);
    });

    it('should show delete button for other users', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Other User')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      expect(deleteButtons.length).toBeGreaterThan(0);
    });

    it('should show confirmation when delete is clicked', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Other User')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      fireEvent.click(deleteButtons[0]);

      // Should show cancel button in confirmation state
      await waitFor(() => {
        expect(screen.getByTitle('Cancel')).toBeInTheDocument();
      });
    });

    it('should cancel delete when cancel is clicked', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Other User')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByTitle('Cancel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Cancel'));

      await waitFor(() => {
        expect(screen.queryByTitle('Cancel')).not.toBeInTheDocument();
      });
    });

    it('should delete user when confirmed', async () => {
      (api.deleteUser as any).mockResolvedValue({});
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Other User')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByTitle('Confirm delete')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Confirm delete'));

      await waitFor(() => {
        expect(api.deleteUser).toHaveBeenCalled();
      });
    });
  });

  describe('Add User Form', () => {
    it('should show add user button', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });
    });

    it('should show form when add user is clicked', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add User'));

      await waitFor(() => {
        expect(screen.getByText('Add New User')).toBeInTheDocument();
      });

      // Form should have name and email text inputs
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThanOrEqual(2);
    });

    it('should show invite email message in add form', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add User'));

      await waitFor(() => {
        expect(screen.getByText(/invite email will be sent/i)).toBeInTheDocument();
      });
    });

    it('should not have password field in form', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add User'));

      await waitFor(() => {
        expect(screen.getByText('Add New User')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    });

    it('should close form when cancel is clicked', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add User'));

      await waitFor(() => {
        expect(screen.getByText('Add New User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('Add New User')).not.toBeInTheDocument();
      });
    });

    it('should create user when form is submitted', async () => {
      (api.createUser as any).mockResolvedValue({
        user: { id: 'new-user', email: 'new@test.com', name: 'New User', role: 'clerk' },
        invite: { sent: true },
      });

      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add User'));

      await waitFor(() => {
        expect(screen.getByText('Add New User')).toBeInTheDocument();
      });

      // Fill in the form using text inputs
      const inputs = screen.getAllByRole('textbox');
      const nameInput = inputs[0];
      const emailInput = inputs[1];

      fireEvent.change(nameInput, { target: { value: 'New User' } });
      fireEvent.change(emailInput, { target: { value: 'new@test.com' } });

      // Submit - find the submit button in the form
      const buttons = screen.getAllByRole('button');
      const submitButton = buttons.find(btn => btn.textContent === 'Add User' && btn.getAttribute('type') === 'submit');
      fireEvent.click(submitButton!);

      await waitFor(() => {
        expect(api.createUser).toHaveBeenCalledWith({
          name: 'New User',
          email: 'new@test.com',
          role: 'clerk',
        });
      });
    });
  });

  describe('Edit User', () => {
    it('should show edit button for all users', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Current User')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      expect(editButtons).toHaveLength(3);
    });

    it('should show edit form when edit is clicked', async () => {
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Current User')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Edit User')).toBeInTheDocument();
      });
    });
  });

  describe('Last Supervisor Protection', () => {
    it('should hide clerk option when editing the last supervisor', async () => {
      const onlyOneSupervisor = [
        { id: 'supervisor-1', email: 'super@test.com', name: 'Only Supervisor', role: 'supervisor' as const, auth_status: 'active' as const },
      ];
      (api.listUsers as any).mockResolvedValue({ users: onlyOneSupervisor });
      (useAuthStore as any).mockReturnValue({ user: onlyOneSupervisor[0] });

      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Only Supervisor')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Edit'));

      await waitFor(() => {
        expect(screen.getByText('Edit User')).toBeInTheDocument();
      });

      // Role dropdown should not contain "Clerk" option
      const roleSelect = screen.getByRole('combobox');
      expect(roleSelect).toBeInTheDocument();

      // Should show the warning message
      expect(screen.getByText(/Cannot demote the last supervisor/i)).toBeInTheDocument();

      // The dropdown should only have Supervisor option
      const options = roleSelect.querySelectorAll('option');
      expect(options).toHaveLength(1);
      expect(options[0].textContent).toBe('Supervisor');
    });

    it('should show clerk option when multiple supervisors exist', async () => {
      const multipleSupervisors = [
        { id: 'supervisor-1', email: 'super1@test.com', name: 'Supervisor One', role: 'supervisor' as const, auth_status: 'active' as const },
        { id: 'supervisor-2', email: 'super2@test.com', name: 'Supervisor Two', role: 'supervisor' as const, auth_status: 'active' as const },
      ];
      (api.listUsers as any).mockResolvedValue({ users: multipleSupervisors });
      (useAuthStore as any).mockReturnValue({ user: multipleSupervisors[0] });

      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Supervisor One')).toBeInTheDocument();
      });

      // Edit the first supervisor
      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Edit User')).toBeInTheDocument();
      });

      // Should not show the warning message
      expect(screen.queryByText(/Cannot demote the last supervisor/i)).not.toBeInTheDocument();

      // The dropdown should have both options
      const roleSelect = screen.getByRole('combobox');
      const options = roleSelect.querySelectorAll('option');
      expect(options).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should show error when fetching users fails', async () => {
      (api.listUsers as any).mockRejectedValue(new Error('Network error'));
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should show error when creating user fails', async () => {
      (api.createUser as any).mockRejectedValue(new Error('User already exists'));
      render(<UsersPanel />);

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add User'));

      await waitFor(() => {
        expect(screen.getByText('Add New User')).toBeInTheDocument();
      });

      const inputs = screen.getAllByRole('textbox');
      const nameInput = inputs[0];
      const emailInput = inputs[1];

      fireEvent.change(nameInput, { target: { value: 'New User' } });
      fireEvent.change(emailInput, { target: { value: 'existing@test.com' } });

      const buttons = screen.getAllByRole('button');
      const submitButton = buttons.find(btn => btn.textContent === 'Add User' && btn.getAttribute('type') === 'submit');
      fireEvent.click(submitButton!);

      await waitFor(() => {
        expect(screen.getByText('User already exists')).toBeInTheDocument();
      });
    });
  });
});
