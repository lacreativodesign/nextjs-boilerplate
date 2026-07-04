'use client';

import { useEffect, useState } from 'react';
import { CustomerCard } from '@/components/crm/CustomerCard';
import { CreateCustomerDialog } from '@/components/crm/CreateCustomerDialog';
import EmptyState from '@/components/ui/EmptyState';

type Customer = {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  companyName?: string;
  status?: string;
  type?: string;
  leadScore?: number;
  ownerName?: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);

      const response = await fetch(`/api/crm/customers?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      setCustomers(data.customers || []);
    } catch {
      setError('Unable to load customers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-frame">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <CreateCustomerDialog onSuccess={fetchCustomers} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {['all', 'new', 'contacted', 'qualified', 'won'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${filter === status ? 'bg-[var(--erp-blue)] text-white' : 'bg-[var(--surface-muted)] text-[var(--text-primary)]'}`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : error ? (
        <EmptyState title="Something went wrong" description={error} />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add your first customer to start building your book of business."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {customers.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} onUpdate={fetchCustomers} />
          ))}
        </div>
      )}
    </div>
  );
}
