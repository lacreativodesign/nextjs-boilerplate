'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { FieldMapper } from '@/components/import-export/FieldMapper';
import { apiFetch } from '@/lib/api/client';

type ImportEntity = 'clients' | 'invoices' | 'projects' | 'employees';

type ParsedPreview = {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
};

type ValidationError = {
  row: number;
  field: string;
  error: string;
};

const ENTITY_FIELDS: Record<ImportEntity, { key: string; label: string; required: boolean }[]> = {
  clients: [
    { key: 'companyName', label: 'Company Name', required: true },
    { key: 'contactName', label: 'Contact Name', required: true },
    { key: 'email', label: 'Email', required: true },
    { key: 'phone', label: 'Phone', required: false },
    { key: 'industry', label: 'Industry', required: false },
    { key: 'website', label: 'Website', required: false },
  ],
  invoices: [
    { key: 'clientId', label: 'Client ID', required: true },
    { key: 'items', label: 'Items JSON', required: true },
    { key: 'currency', label: 'Currency', required: false },
    { key: 'dueDate', label: 'Due Date (YYYY-MM-DD)', required: false },
    { key: 'notes', label: 'Notes', required: false },
    { key: 'status', label: 'Status', required: false },
  ],
  projects: [
    { key: 'name', label: 'Project Name', required: true },
    { key: 'clientId', label: 'Client ID', required: true },
    { key: 'startDate', label: 'Start Date (YYYY-MM-DD)', required: true },
    { key: 'endDate', label: 'End Date (YYYY-MM-DD)', required: false },
    { key: 'status', label: 'Status', required: false },
    { key: 'priority', label: 'Priority', required: false },
    { key: 'budget', label: 'Budget', required: false },
  ],
  employees: [
    { key: 'userId', label: 'User ID', required: true },
    { key: 'department', label: 'Department', required: true },
    { key: 'position', label: 'Position', required: true },
    { key: 'employmentType', label: 'Employment Type', required: true },
    { key: 'startDate', label: 'Start Date (YYYY-MM-DD)', required: true },
    { key: 'salary', label: 'Salary', required: false },
    { key: 'manager', label: 'Manager User ID', required: false },
  ],
};

export default function ImportPage() {
  const [step, setStep] = useState(1);
  const [tenantId, setTenantId] = useState('');
  const [entityType, setEntityType] = useState<ImportEntity>('clients');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validRowCount, setValidRowCount] = useState(0);
  const [importResult, setImportResult] = useState<{ imported: number; total: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const systemFields = useMemo(() => ENTITY_FIELDS[entityType], [entityType]);

  const parseAndContinue = async (selectedFile: File) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await apiFetch('/api/import/parse', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to parse file');
      }

      setFile(selectedFile);
      setParsed(payload as ParsedPreview);
      setStep(2);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  };

  const runValidation = async () => {
    if (!parsed) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await apiFetch('/api/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          entityType,
          rows: parsed.rows,
          mapping,
          dryRun: true,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        if (Array.isArray(payload.errors)) {
          setValidationErrors(payload.errors);
          setValidRowCount(payload.validRows || 0);
          return;
        }
        throw new Error(payload.error || 'Validation failed');
      }

      setValidationErrors([]);
      setValidRowCount(payload.validRows || 0);
      setStep(4);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  const executeImport = async () => {
    if (!parsed) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await apiFetch('/api/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          entityType,
          rows: parsed.rows,
          mapping,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Import failed');
      }

      setImportResult(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-frame">
      <div className="mb-6">
        <h1 className="page-title">Import Data</h1>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Step num={1} active={step === 1} label="Upload" />
        <Step num={2} active={step === 2} label="Map Fields" />
        <Step num={3} active={step === 3} label="Validate" />
        <Step num={4} active={step === 4} label="Import" />
      </div>

      {errorMessage ? (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {step === 1 ? (
        <UploadStep
          loading={loading}
          tenantId={tenantId}
          entityType={entityType}
          onTenantIdChange={setTenantId}
          onEntityTypeChange={setEntityType}
          onNext={parseAndContinue}
        />
      ) : null}

      {step === 2 && parsed ? (
        <div className="space-y-4">
          <FieldMapper
            fileHeaders={parsed.headers}
            systemFields={systemFields}
            onMap={(nextMapping) => {
              setMapping(nextMapping);
              setStep(3);
            }}
          />
          <div>
            <button type="button" className="text-sm text-blue-600" onClick={() => setStep(1)}>
              Back to upload
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <ValidateStep
          loading={loading}
          errors={validationErrors}
          validRows={validRowCount}
          onValidate={runValidation}
          onBack={() => setStep(2)}
        />
      ) : null}

      {step === 4 ? (
        <ImportStep
          loading={loading}
          result={importResult}
          onImport={executeImport}
          onBack={() => setStep(3)}
        />
      ) : null}

      {file ? (
        <p className="mt-6 text-xs text-[var(--text-muted)]">Selected file: {file.name}</p>
      ) : null}
    </div>
  );
}

function Step({ num, active, label }: { num: number; active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
          active ? 'border-blue-600 bg-blue-600 text-white' : 'border-neutral-300'
        }`}
      >
        {num}
      </div>
      <span className={`text-sm ${active ? 'font-semibold' : 'text-[var(--text-muted)]'}`}>
        {label}
      </span>
    </div>
  );
}

function UploadStep({
  loading,
  tenantId,
  entityType,
  onTenantIdChange,
  onEntityTypeChange,
  onNext,
}: {
  loading: boolean;
  tenantId: string;
  entityType: ImportEntity;
  onTenantIdChange: (value: string) => void;
  onEntityTypeChange: (value: ImportEntity) => void;
  onNext: (file: File) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  return (
    <div className="space-y-4 rounded border p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="tenant-id">
            Tenant ID
          </label>
          <input
            id="tenant-id"
            className="w-full rounded border px-3 py-2"
            value={tenantId}
            onChange={(event) => onTenantIdChange(event.target.value)}
            placeholder="Tenant ID"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="entity-type">
            Entity Type
          </label>
          <select
            id="entity-type"
            className="w-full rounded border px-3 py-2"
            value={entityType}
            onChange={(event) => onEntityTypeChange(event.target.value as ImportEntity)}
          >
            <option value="clients">Clients</option>
            <option value="invoices">Invoices</option>
            <option value="projects">Projects</option>
            <option value="employees">Employees</option>
          </select>
        </div>
      </div>

      <label
        className="flex cursor-pointer items-center gap-3 rounded border border-dashed p-4"
        htmlFor="import-file"
      >
        <Upload className="h-5 w-5" />
        <span>{selectedFile ? selectedFile.name : 'Choose CSV or Excel file'}</span>
      </label>
      <input
        id="import-file"
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
      />

      <button
        type="button"
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        onClick={() => selectedFile && onNext(selectedFile)}
        disabled={loading || !selectedFile || !tenantId.trim()}
      >
        {loading ? 'Parsing...' : 'Continue'}
      </button>
    </div>
  );
}

function ValidateStep({
  loading,
  errors,
  validRows,
  onValidate,
  onBack,
}: {
  loading: boolean;
  errors: ValidationError[];
  validRows: number;
  onValidate: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 rounded border p-4">
      <div className="flex items-center gap-2 text-sm">
        {errors.length > 0 ? (
          <AlertCircle className="h-4 w-4 text-red-600" />
        ) : (
          <CheckCircle className="h-4 w-4 text-green-600" />
        )}
        <span>
          {errors.length > 0
            ? `Validation found ${errors.length} issue(s).`
            : validRows > 0
              ? `${validRows} rows validated successfully.`
              : 'Run validation before importing.'}
        </span>
      </div>

      {errors.length > 0 ? (
        <div className="max-h-72 overflow-auto rounded border">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((error, index) => (
                  <tr key={`${error.row}-${error.field}-${index}`} className="border-t">
                    <td className="px-3 py-2">{error.row}</td>
                    <td className="px-3 py-2">{error.field}</td>
                    <td className="px-3 py-2">{error.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex gap-3">
        <button type="button" className="rounded border px-4 py-2" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="rounded bg-blue-600 px-4 py-2 text-white"
          onClick={onValidate}
          disabled={loading}
        >
          {loading ? 'Validating...' : 'Validate Data'}
        </button>
      </div>
    </div>
  );
}

function ImportStep({
  loading,
  result,
  onImport,
  onBack,
}: {
  loading: boolean;
  result: { imported: number; total: number } | null;
  onImport: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 rounded border p-4">
      {result ? (
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle className="h-5 w-5" />
          <span>
            Imported {result.imported} of {result.total} rows.
          </span>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          Validation passed. Execute import to write records.
        </p>
      )}

      <div className="flex gap-3">
        <button type="button" className="rounded border px-4 py-2" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="rounded bg-blue-600 px-4 py-2 text-white"
          onClick={onImport}
          disabled={loading || Boolean(result)}
        >
          {loading ? 'Importing...' : result ? 'Imported' : 'Start Import'}
        </button>
      </div>
    </div>
  );
}
