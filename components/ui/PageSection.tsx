export default function PageSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="section-title mb-1">{title}</h2>
        {description && <p className="section-subtitle">{description}</p>}
      </div>

      {children}
    </div>
  );
}
