export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 py-4 px-6">
      <div className="flex items-center justify-between text-sm text-gray-600">
        <p>© {year} ChatLogix. All rights reserved.</p>
        <p>Version 0.1.0</p>
      </div>
    </footer>
  );
}

