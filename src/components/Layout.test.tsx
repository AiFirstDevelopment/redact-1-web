import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Layout } from './Layout';

// Mock Clerk
vi.mock('@clerk/clerk-react', () => ({
  useClerk: () => ({
    signOut: vi.fn(),
  }),
}));

// Mock auth store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

import { useAuthStore } from '../stores/authStore';

const mockSupervisor = {
  id: 'user-1',
  name: 'Test Supervisor',
  email: 'supervisor@test.com',
  role: 'supervisor' as const,
};

const mockClerk = {
  id: 'user-2',
  name: 'Test Clerk',
  email: 'clerk@test.com',
  role: 'clerk' as const,
};

const mockAgency = {
  id: 'agency-1',
  name: 'Test Agency',
  code: 'TEST',
};

describe('Layout', () => {
  const mockOnTabChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tab Visibility for Supervisors', () => {
    beforeEach(() => {
      (useAuthStore as any).mockReturnValue({
        user: mockSupervisor,
        agency: mockAgency,
      });
    });

    it('should show all tabs for supervisor', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      expect(screen.getByText('Requests')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
      expect(screen.getByText('Users')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should call onTabChange when Settings tab is clicked', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      fireEvent.click(screen.getByText('Settings'));
      expect(mockOnTabChange).toHaveBeenCalledWith('settings');
    });

    it('should call onTabChange when Users tab is clicked', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      fireEvent.click(screen.getByText('Users'));
      expect(mockOnTabChange).toHaveBeenCalledWith('users');
    });
  });

  describe('Tab Visibility for Clerks', () => {
    beforeEach(() => {
      (useAuthStore as any).mockReturnValue({
        user: mockClerk,
        agency: mockAgency,
      });
    });

    it('should hide Users and Settings tabs for clerk', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      expect(screen.getByText('Requests')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
      expect(screen.queryByText('Users')).not.toBeInTheDocument();
      expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });

    it('should show only Requests and Archived tabs', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      const tabs = screen.getAllByRole('button').filter(btn =>
        ['Requests', 'Archived'].includes(btn.textContent || '')
      );
      expect(tabs).toHaveLength(2);
    });
  });

  describe('Header', () => {
    beforeEach(() => {
      (useAuthStore as any).mockReturnValue({
        user: mockSupervisor,
        agency: mockAgency,
      });
    });

    it('should display agency name', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      expect(screen.getByText('Test Agency')).toBeInTheDocument();
    });

    it('should display user name', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      expect(screen.getByText('Test Supervisor')).toBeInTheDocument();
    });

    it('should display Sign Out button', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });
  });

  describe('Active Tab Styling', () => {
    beforeEach(() => {
      (useAuthStore as any).mockReturnValue({
        user: mockSupervisor,
        agency: mockAgency,
      });
    });

    it('should highlight active tab', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      const requestsTab = screen.getByText('Requests');
      expect(requestsTab.className).toContain('border-blue-600');
    });

    it('should not highlight inactive tabs', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Content</div>
        </Layout>
      );

      const archivedTab = screen.getByText('Archived');
      expect(archivedTab.className).toContain('border-transparent');
    });
  });

  describe('Right Panel', () => {
    beforeEach(() => {
      (useAuthStore as any).mockReturnValue({
        user: mockSupervisor,
        agency: mockAgency,
      });
    });

    it('should render right panel when provided', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange} rightPanel={<div>Right Panel Content</div>}>
          <div>Main Content</div>
        </Layout>
      );

      expect(screen.getByText('Right Panel Content')).toBeInTheDocument();
    });

    it('should render children as main content', () => {
      render(
        <Layout activeTab="requests" onTabChange={mockOnTabChange}>
          <div>Main Content</div>
        </Layout>
      );

      expect(screen.getByText('Main Content')).toBeInTheDocument();
    });
  });
});
