import { Modal, Button } from '@chatlogix/ui';

interface ConfirmationDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
}

export function ConfirmationDialog({
  open,
  onConfirm,
  onCancel,
  title = 'Confirm Changes',
  message = 'Are you sure you want to save these changes?',
  confirmText = 'Save',
  cancelText = 'Cancel',
  variant = 'default',
}: ConfirmationDialogProps) {
  return (
    <Modal isOpen={open} onClose={onCancel} title={title}>
      <div className="space-y-4">
        <p className="text-gray-700">{message}</p>
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'secondary' : 'primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

