export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 font-body text-sm text-clay">
      {message}
    </p>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-clay/30 bg-clay/5 px-4 py-3 font-body text-sm text-clay"
    >
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-md border border-trust/30 bg-trust/5 px-4 py-3 font-body text-sm text-trust">
      {message}
    </div>
  );
}
