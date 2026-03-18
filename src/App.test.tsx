import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const renderApp = () => {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
};

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Routing', () => {
    it('redirects to enrollment page when not enrolled', async () => {
      // No localStorage = not enrolled
      renderApp();

      await waitFor(() => {
        expect(screen.getByText('Enter your department code to get started')).toBeInTheDocument();
      });
    });

    it('shows enrollment page when agency not set', async () => {
      // No agency in localStorage = enrollment page
      renderApp();

      await waitFor(() => {
        expect(screen.getByText('Enter your department code to get started')).toBeInTheDocument();
      });
    });

    it('shows main page when authenticated', async () => {
      // Set both token and agency to simulate authenticated state
      localStorage.setItem('token', 'mock-token');
      localStorage.setItem('agency', JSON.stringify({
        id: 'agency-1',
        name: 'Springfield Police Department',
        code: 'SPRINGFIELD-PD',
      }));

      renderApp();

      await waitFor(() => {
        expect(screen.getByText('Records Requests')).toBeInTheDocument();
      });
    });
  });

  describe('Protected Routes', () => {
    it('allows authenticated users to access protected routes', async () => {
      localStorage.setItem('token', 'mock-token');
      localStorage.setItem('agency', JSON.stringify({
        id: 'agency-1',
        name: 'Springfield Police Department',
        code: 'SPRINGFIELD-PD',
      }));

      window.history.pushState({}, '', '/');
      renderApp();

      await waitFor(() => {
        expect(screen.getByText('Records Requests')).toBeInTheDocument();
      });
    });
  });

  describe('Public Routes', () => {
    it('redirects authenticated users from login to main page', async () => {
      localStorage.setItem('token', 'mock-token');
      localStorage.setItem('agency', JSON.stringify({
        id: 'agency-1',
        name: 'Springfield Police Department',
        code: 'SPRINGFIELD-PD',
      }));

      window.history.pushState({}, '', '/login');
      renderApp();

      await waitFor(() => {
        expect(screen.getByText('Records Requests')).toBeInTheDocument();
      });
    });

    it('redirects authenticated users from enrollment to main page', async () => {
      localStorage.setItem('token', 'mock-token');
      localStorage.setItem('agency', JSON.stringify({
        id: 'agency-1',
        name: 'Springfield Police Department',
        code: 'SPRINGFIELD-PD',
      }));

      window.history.pushState({}, '', '/enroll');
      renderApp();

      await waitFor(() => {
        expect(screen.getByText('Records Requests')).toBeInTheDocument();
      });
    });
  });
});
