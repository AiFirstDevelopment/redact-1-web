# Redact-1 Web Application

React/TypeScript web application for managing FOIA/records requests with PII redaction.

## Build & Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run web tests (from redact-1-web directory)
cd /Users/joelstevick/redact-1-web && npm run test:run

# Run web tests with coverage
cd /Users/joelstevick/redact-1-web && npm run test:coverage

# Run API tests (from redact-1-api directory)
cd /Users/joelstevick/redact-1-api && npm run test
```

**IMPORTANT:** Always run tests from the correct directory:
- Web tests: `/Users/joelstevick/redact-1-web`
- API tests: `/Users/joelstevick/redact-1-api`

## Testing Guidelines

**IMPORTANT: All UI tests must use React Testing Library for DOM-based integration testing. Unit tests are acceptable for pure logic and utility functions.**

### Test Architecture
- Use `@testing-library/react` for rendering components
- Use `@testing-library/user-event` for simulating user interactions
- Use `msw` (Mock Service Worker) for API mocking
- Tests run against actual React components with mocked API services

### Test Patterns
```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

describe('MyComponent', () => {
  it('should render and handle user interaction', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <MyComponent />
      </BrowserRouter>
    );

    // Query elements using Testing Library queries
    const button = screen.getByRole('button', { name: /submit/i });
    await user.click(button);

    // Assert on DOM state
    await waitFor(() => {
      expect(screen.getByText(/success/i)).toBeInTheDocument();
    });
  });
});
```

### Pre-commit Hook
A pre-commit hook runs all tests before each commit. Tests must pass to commit.

### Test Failure Policy
**IMPORTANT:** If an existing test fails, assume that it is identifying a regression until proven otherwise. Never modify an existing test without checking with the user first.

## Architecture

- **src/**
  - `components/` - Reusable React components
  - `pages/` - Page-level components (routes)
  - `stores/` - Zustand state management stores
  - `services/` - API service layer
  - `types/` - TypeScript type definitions
  - `mocks/` - MSW handlers for API mocking

## API

Backend: `https://redact-1-worker.joelstevick.workers.dev`

API responses are wrapped:
- Lists: `{ "requests": [...] }`, `{ "files": [...] }`
- Single items: `{ "request": {...} }`
