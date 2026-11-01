import { Link } from 'react-router-dom';
import { Card, Button } from '@chatlogix/ui';

export function Templates() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Templates</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          WhatsApp broadcast message templates and canned assistant replies.
        </p>
      </div>

      <Card className="p-8 border border-gray-200/80 shadow-sm bg-white space-y-4">
        <div className="flex items-start gap-4">
          <span className="text-3xl p-3 bg-gray-50 rounded-xl border border-gray-100">📝</span>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-gray-900">Template Tools Not Built</h2>
            <p className="text-sm text-gray-600 leading-relaxed max-w-xl">
              Template tools are not built. We have not decided whether this means WhatsApp template messages,
              saved replies, or something else. The vendor portal has the same open question.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="border border-gray-300">
              &larr; Return to Dashboard
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
