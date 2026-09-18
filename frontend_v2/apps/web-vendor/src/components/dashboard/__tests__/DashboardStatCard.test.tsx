/**
 * Unit tests for DashboardStatCard component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardStatCard } from '../DashboardStatCard';

describe('DashboardStatCard', () => {
  it('should render label and value', () => {
    render(<DashboardStatCard label="Test Label" value={100} />);
    
    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('should render subValue when provided', () => {
    render(<DashboardStatCard label="Test" value={50} subValue="Today: 5" />);
    
    expect(screen.getByText('Today: 5')).toBeInTheDocument();
  });

  it('should render trend indicator when provided', () => {
    render(<DashboardStatCard label="Test" value={100} trend="up" />);
    
    expect(screen.getByText(/vs yesterday/)).toBeInTheDocument();
  });

  it('should call onClick when clicked', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    
    render(<DashboardStatCard label="Test" value={100} onClick={handleClick} />);
    
    const card = screen.getByRole('button');
    await user.click(card);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be keyboard accessible', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    
    render(<DashboardStatCard label="Test" value={100} onClick={handleClick} />);
    
    const card = screen.getByRole('button');
    card.focus();
    await user.keyboard('{Enter}');
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should have proper ARIA labels', () => {
    render(<DashboardStatCard label="Orders" value={50} subValue="Today: 5" onClick={() => {}} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label');
  });
});

