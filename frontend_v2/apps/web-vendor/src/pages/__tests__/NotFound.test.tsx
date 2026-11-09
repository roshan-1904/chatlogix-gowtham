import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFound } from '../NotFound';

describe('NotFound Page', () => {
  it('renders styled 404 message and title', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    expect(screen.getByText(/404 Error/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /Page not found/i })).toBeInTheDocument();
    expect(
      screen.getByText(/The page you're looking for doesn't exist, has been moved/i)
    ).toBeInTheDocument();
  });

  it('renders primary link back to dashboard', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    const dashboardLink = screen.getByRole('link', { name: /Back to Dashboard/i });
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
  });

  it('renders secondary link to support', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    const supportLink = screen.getByRole('link', { name: /Contact Support/i });
    expect(supportLink).toHaveAttribute('href', '/support');
  });

  it('renders popular destination links', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /^Orders$/i })).toHaveAttribute('href', '/orders');
    expect(screen.getByRole('link', { name: /^Catalog$/i })).toHaveAttribute('href', '/catalog');
    expect(screen.getByRole('link', { name: /^Queries$/i })).toHaveAttribute('href', '/queries');
    expect(screen.getByRole('link', { name: /^Wallet$/i })).toHaveAttribute('href', '/wallet');
  });
});

