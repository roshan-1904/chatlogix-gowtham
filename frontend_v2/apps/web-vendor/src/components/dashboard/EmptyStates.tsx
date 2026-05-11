import { Card } from '@chatlogix/ui';
import { Button } from '@chatlogix/ui';
import { useNavigate } from 'react-router-dom';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  actionPath?: string;
  icon?: string;
}

export function EmptyState({
  title,
  message,
  actionLabel,
  actionPath,
  icon = '📊'
}: EmptyStateProps) {
  const navigate = useNavigate();

  return (
    <Card className="p-8 text-center">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      {actionLabel && actionPath && (
        <Button
          variant="primary"
          onClick={() => navigate(actionPath)}
        >
          {actionLabel}
        </Button>
      )}
    </Card>
  );
}

export function EmptyOrders() {
  return (
    <EmptyState
      title="No orders yet"
      message="Start receiving orders by sharing your catalog with customers"
      actionLabel="View Products"
      actionPath="/catalog"
      icon="🛒"
    />
  );
}

export function EmptyConversations() {
  return (
    <EmptyState
      title="No conversations yet"
      message="Start your first conversation with a customer"
      icon="💬"
    />
  );
}

export function EmptyProducts() {
  return (
    <EmptyState
      title="No products yet"
      message="Add your first product to start selling"
      actionLabel="Add Product"
      actionPath="/catalog/new"
      icon="📦"
    />
  );
}

