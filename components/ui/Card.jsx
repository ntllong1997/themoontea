export function Card({ children, className = '' }) {
  return (
    <div
      className={`border rounded-lg shadow-sm bg-white p-4 ${className}`}
      style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className = '' }) {
  return <div className={`space-y-2 ${className}`}>{children}</div>;
}
